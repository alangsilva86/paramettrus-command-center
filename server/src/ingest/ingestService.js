import { query, withClient } from '../db.js';
import { config } from '../config.js';
import { normalizeZohoRecord } from './normalize.js';
import { fetchZohoReport, withRetry } from './zohoClient.js';
import { addDays, endOfMonth, formatDate, startOfMonth, toDateOnly } from '../utils/date.js';
import { logError, logInfo, logSuccess, logWarn } from '../utils/logger.js';
import {
  insertIngestionRun,
  finalizeIngestionRun,
  insertRawPayload,
  upsertRawPayload,
  getExistingRowInfo,
  resolveTimestamp,
  isIncomingNewer,
  getLatestByRowHash,
  purgeDuplicatesByRowHash,
  insertNormalized,
  updateNormalized
} from './ingestRepository.js';

const SOURCE = 'zoho';
const DEFAULT_LOOKBACK_DAYS = 7;

const buildCriteria = (field, start, end) => {
  return `(${field} >= "${start}" && ${field} <= "${end}")`;
};

const buildRangeCriteria = (fields, start, end) => {
  const clauses = fields.map((field) => buildCriteria(field, start, end)).filter(Boolean);
  if (!clauses.length) return null;
  if (clauses.length === 1) return clauses[0];
  return `(${clauses.join(' || ')})`;
};

const monthRefToIndex = (monthRef) => {
  const [year, month] = monthRef.split('-').map(Number);
  return year * 12 + (month - 1);
};

const normalizeMonthRange = (startMonth, endMonth) => {
  if (monthRefToIndex(startMonth) <= monthRefToIndex(endMonth)) {
    return { start: startMonth, end: endMonth };
  }
  return { start: endMonth, end: startMonth };
};

const listMonthRefs = (startMonth, endMonth) => {
  const startIdx = monthRefToIndex(startMonth);
  const endIdx = monthRefToIndex(endMonth);
  const months = [];
  for (let idx = startIdx; idx <= endIdx; idx += 1) {
    const year = Math.floor(idx / 12);
    const month = String((idx % 12) + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
  }
  return months;
};

const buildMonthRanges = (startMonth, endMonth) => {
  const normalized = normalizeMonthRange(startMonth, endMonth);
  const months = listMonthRefs(normalized.start, normalized.end);
  return months.map((monthRef) => ({
    monthRef,
    start: startOfMonth(monthRef),
    end: endOfMonth(monthRef)
  }));
};

const resolveIncrementalCriteria = async (client) => {
  if (config.ingest?.mode !== 'incremental') return null;
  const lookbackDays = Number(
    config.ingest.incrementalLookbackDays || DEFAULT_LOOKBACK_DAYS
  );
  const safeLookback = Number.isFinite(lookbackDays) && lookbackDays > 0 ? lookbackDays : DEFAULT_LOOKBACK_DAYS;
  const result = await client.query(
    'SELECT MAX(modified_time) AS last_modified FROM contracts_norm'
  );
  const lastModified = result.rows[0]?.last_modified || null;
  const today = toDateOnly(new Date());
  const fromBase = lastModified ? toDateOnly(lastModified) : today;
  if (!lastModified) {
    logWarn('ingest', 'Incremental sem baseline; usando janela de lookback', {
      lookback_days: safeLookback
    });
  }
  const fromDate = fromBase ? addDays(fromBase, -safeLookback) : null;
  if (!fromDate || !today) return null;
  const field = config.zohoFields.modifiedTime || 'Modified_Time';
  return {
    criteria: buildCriteria(field, formatDate(fromDate), formatDate(today)),
    field,
    from: formatDate(fromDate),
    to: formatDate(today)
  };
};


const refreshCustomers = async (client, cpfCnpjs) => {
  if (!cpfCnpjs.length) return;
  const unique = [...new Set(cpfCnpjs.filter(Boolean))];
  for (const cpf of unique) {
    const rows = await client.query(
      `SELECT cpf_cnpj, ramo, data_efetivacao, status
       FROM contracts_norm
       WHERE cpf_cnpj = $1`,
      [cpf]
    );

    if (rows.rowCount === 0) continue;
    const dates = rows.rows.map((r) => r.data_efetivacao).filter(Boolean);
    dates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const firstSeen = dates[0];
    const lastSeen = dates[dates.length - 1];

    const activeRamos = new Set(
      rows.rows
        .filter((r) => r.status === 'vigente')
        .map((r) => r.ramo)
        .filter(Boolean)
    );
    const activeProducts = Array.from(activeRamos.values());

    await client.query(
      `INSERT INTO customers (cpf_cnpj, first_seen_at, last_seen_at, active_products, distinct_ramos_count, is_monoproduto, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (cpf_cnpj)
       DO UPDATE SET
         first_seen_at = LEAST(customers.first_seen_at, EXCLUDED.first_seen_at),
         last_seen_at = GREATEST(customers.last_seen_at, EXCLUDED.last_seen_at),
         active_products = EXCLUDED.active_products,
         distinct_ramos_count = EXCLUDED.distinct_ramos_count,
         is_monoproduto = EXCLUDED.is_monoproduto,
         updated_at = NOW()`,
      [
        cpf,
        firstSeen ? formatDate(new Date(firstSeen)) : null,
        lastSeen ? formatDate(new Date(lastSeen)) : null,
        activeProducts,
        activeProducts.length,
        activeProducts.length <= 1
      ]
    );
  }
};

export const refreshZohoPeriod = async ({
  startMonth,
  endMonth,
  includeInicio = true
}) => {
  const normalized = normalizeMonthRange(startMonth, endMonth);
  const ranges = buildMonthRanges(normalized.start, normalized.end);
  const criteriaFields = [config.zohoFields.dataEfetivacao || 'contract_effective_date'];
  if (includeInicio && config.zohoFields.inicio) {
    if (!criteriaFields.includes(config.zohoFields.inicio)) {
      criteriaFields.push(config.zohoFields.inicio);
    }
  }

  logInfo('ingest', 'Refresh de periodo iniciado', {
    start: normalized.start,
    end: normalized.end,
    criteria_fields: criteriaFields,
    include_inicio: includeInicio
  });

  return withClient(async (client) => {
      const startedAt = new Date();
      const runId = await insertIngestionRun(client, startedAt);
      let fetchedCount = 0;
      let insertedNormCount = 0;
      let updatedNormCount = 0;
      let duplicatesCount = 0;
      let invalidCount = 0;
      let incompleteCount = 0;
      let rawInserted = 0;
      let rawUpdated = 0;
      let rawSkipped = 0;
      const seenIds = new Set();
      const fetchedAt = new Date().toISOString();
      const touchedCpfs = [];

      try {
        for (const range of ranges) {
          const startKey = formatDate(range.start);
          const endKey = formatDate(range.end);
          const criteria = buildRangeCriteria(criteriaFields, startKey, endKey);
          if (!criteria) continue;
          logInfo('ingest', 'Refresh periodo janela', {
            month_ref: range.monthRef,
            criteria
          });

          const records = await withRetry(
            () => fetchZohoReport({ criteria }),
            3,
            (error) => error?.code !== 'ZOHO_AUTH_401'
          );
          fetchedCount += records.length;

          for (const record of records) {
            const normalizedRecord = normalizeZohoRecord(record);
            if (!normalizedRecord.month_ref) {
              invalidCount += 1;
              continue;
            }
            if (normalizedRecord.is_incomplete) incompleteCount += 1;
            if (normalizedRecord.is_invalid) invalidCount += 1;

            const dedupKey = normalizedRecord.zoho_record_id || normalizedRecord.contract_id;
            if (dedupKey && seenIds.has(dedupKey)) {
              duplicatesCount += 1;
              continue;
            }
            if (dedupKey) seenIds.add(dedupKey);

            const rawResult = await upsertRawPayload({
              client,
              record,
              fetchedAt,
              source: SOURCE,
              sourceContractIdOverride: normalizedRecord.is_synthetic_id ? normalizedRecord.contract_id : null
            });
            rawInserted += rawResult.inserted;
            rawUpdated += rawResult.updated;
            rawSkipped += rawResult.skipped;

            const fingerprint = await getLatestByRowHash(client, normalizedRecord.row_hash);
            if (fingerprint && fingerprint.contract_id !== normalizedRecord.contract_id) {
              const incomingNewer = isIncomingNewer(normalizedRecord, fingerprint);
              if (!incomingNewer) {
                duplicatesCount += 1;
                continue;
              }
            }

            const existing = await getExistingRowInfo(client, {
              contractId: normalizedRecord.contract_id,
              zohoRecordId: normalizedRecord.zoho_record_id
            });
            if (existing) {
              normalizedRecord.contract_id = existing.contractId;
            }
            const normalizedTs = resolveTimestamp(normalizedRecord);
            const existingTs = resolveTimestamp(existing);
            const needsModifiedUpdate = existing && normalizedTs && (!existingTs || normalizedTs > existingTs);
            const needsVendorUpdate = existing && (!existing.vendedorId || existing.vendedorId === '');
            if (
              existing &&
              existing.rowHash === normalizedRecord.row_hash &&
              !needsVendorUpdate &&
              !needsModifiedUpdate
            ) {
              duplicatesCount += 1;
              continue;
            }
            if (existing) {
              await updateNormalized(client, normalizedRecord);
              updatedNormCount += 1;
            } else {
              await insertNormalized(client, normalizedRecord);
              insertedNormCount += 1;
            }

            if (fingerprint) {
              const removed = await purgeDuplicatesByRowHash(
                client,
                normalizedRecord.row_hash,
                normalizedRecord.contract_id
              );
              if (removed > 0) duplicatesCount += removed;
            }

            if (normalizedRecord.cpf_cnpj) touchedCpfs.push(normalizedRecord.cpf_cnpj);
          }
        }

        await refreshCustomers(client, touchedCpfs);

        await finalizeIngestionRun(client, runId, {
          status: 'SUCCESS',
          finishedAt: new Date(),
          fetchedCount,
          insertedNormCount,
          duplicatesCount,
          details: {
            mode: 'period_refresh',
            start_month: normalized.start,
            end_month: normalized.end,
            criteria_fields: criteriaFields,
            include_inicio: includeInicio,
            updated_norm_count: updatedNormCount,
            raw_inserted: rawInserted,
            raw_updated: rawUpdated,
            raw_skipped: rawSkipped,
            invalid_count: invalidCount,
            incomplete_count: incompleteCount
          }
        });

        logSuccess('ingest', 'Refresh de periodo concluido', {
          start: normalized.start,
          end: normalized.end,
          fetched: fetchedCount,
          inserted: insertedNormCount,
          updated: updatedNormCount,
          duplicates: duplicatesCount,
          invalid: invalidCount,
          incomplete: incompleteCount
        });

        return {
          runId,
          status: 'SUCCESS',
          fetchedCount,
          insertedNormCount,
          updatedNormCount,
          duplicatesCount
        };
      } catch (error) {
      const statusCode = error?.status || error?.response?.status || null;
      const errorCode = error?.code || error?.response?.data?.code || null;
      const detail =
        error?.detail ||
        error?.response?.data?.message ||
        error?.response?.data?.description ||
        error?.message ||
        'Period refresh failed';
      logError('ingest', 'Falha no refresh de periodo', {
        error: detail,
        status_code: statusCode,
        code: errorCode
      });
      await finalizeIngestionRun(client, runId, {
        status: 'FAILED',
        finishedAt: new Date(),
        fetchedCount,
        insertedNormCount,
        duplicatesCount,
        error: detail,
        details: {
          mode: 'period_refresh',
          start_month: normalized.start,
          end_month: normalized.end,
          status_code: statusCode,
          error_code: errorCode
        }
      });
      const wrapped = new Error('Falha ao atualizar dados do Zoho');
      wrapped.status = statusCode;
      wrapped.code = errorCode;
      wrapped.detail = detail;
      throw wrapped;
    }
  });
};

export const runIngestion = async () => {
  const startedAt = new Date();
  logInfo('ingest', 'Iniciando ingestão do Zoho');
  return withClient(async (client) => {
    const runId = await insertIngestionRun(client, startedAt);
    let fetchedCount = 0;
    let insertedNormCount = 0;
    let duplicatesCount = 0;
    let incompleteCount = 0;
    let invalidCount = 0;
    let updatedNormCount = 0;
    const fetchedAt = new Date().toISOString();
    const touchedCpfs = [];

    let records = [];
    try {
      const incremental = await resolveIncrementalCriteria(client);
      const criteria = incremental ? incremental.criteria : null;
      if (incremental) {
        logInfo('ingest', 'Modo incremental ativo', {
          field: incremental.field,
          from: incremental.from,
          to: incremental.to
        });
      }
      records = await withRetry(
        () => fetchZohoReport({ criteria }),
        3,
        (error) => error?.code !== 'ZOHO_AUTH_401'
      );
    } catch (error) {
      const isAuthError = error?.code === 'ZOHO_AUTH_401' || error?.status === 401;
      const status = isAuthError ? 'FAILED' : 'STALE_DATA';
      const diagnostic = isAuthError ? 'ZOHO_AUTH_401' : 'ZOHO_UNAVAILABLE';

      logError('ingest', 'Falha ao coletar dados do Zoho', {
        status,
        diagnostic,
        error: error?.message
      });

      await finalizeIngestionRun(client, runId, {
        status,
        finishedAt: new Date(),
        fetchedCount,
        insertedNormCount,
        duplicatesCount,
        error: error?.message || 'Zoho unavailable',
        details: {
          diagnostic,
          status_code: error?.status || null
        }
      });
      throw error;
    }

    try {
      fetchedCount = records.length;
      logInfo('ingest', 'Registros recebidos', { fetched: fetchedCount });

        for (const record of records) {
          await insertRawPayload({ client, record, fetchedAt, source: SOURCE });
          const normalized = normalizeZohoRecord(record);
          if (!normalized.month_ref) {
            invalidCount += 1;
            continue;
          }
          if (normalized.is_incomplete) incompleteCount += 1;
          if (normalized.is_invalid) invalidCount += 1;

          const fingerprint = await getLatestByRowHash(client, normalized.row_hash);
          if (fingerprint && fingerprint.contract_id !== normalized.contract_id) {
            const incomingNewer = isIncomingNewer(normalized, fingerprint);
            if (!incomingNewer) {
              duplicatesCount += 1;
              continue;
            }
          }

          const existing = await getExistingRowInfo(client, {
            contractId: normalized.contract_id,
            zohoRecordId: normalized.zoho_record_id
          });
          if (existing) {
            normalized.contract_id = existing.contractId;
          }
          const needsVendorUpdate = existing && (!existing.vendedorId || existing.vendedorId === '');
          const normalizedTs = resolveTimestamp(normalized);
          const existingTs = resolveTimestamp(existing);
          const needsModifiedUpdate = existing && normalizedTs && (!existingTs || normalizedTs > existingTs);
          if (existing && existing.rowHash === normalized.row_hash && !needsVendorUpdate && !needsModifiedUpdate) {
            duplicatesCount += 1;
            continue;
          }
          if (existing) {
            await updateNormalized(client, normalized);
            updatedNormCount += 1;
          } else {
            await insertNormalized(client, normalized);
            insertedNormCount += 1;
          }

        if (fingerprint) {
          const removed = await purgeDuplicatesByRowHash(
            client,
            normalized.row_hash,
            normalized.contract_id
          );
          if (removed > 0) duplicatesCount += removed;
        }

        if (normalized.cpf_cnpj) touchedCpfs.push(normalized.cpf_cnpj);
      }

      await refreshCustomers(client, touchedCpfs);

      if (insertedNormCount === 0) {
        logWarn('ingest', 'Nenhum contrato normalizado foi inserido');
      }
      logSuccess('ingest', 'Ingestão concluída', {
        inserted: insertedNormCount,
        updated: updatedNormCount,
        duplicates: duplicatesCount,
        incomplete: incompleteCount,
        invalid: invalidCount
      });

      await finalizeIngestionRun(client, runId, {
        status: 'SUCCESS',
        finishedAt: new Date(),
        fetchedCount,
        insertedNormCount,
        duplicatesCount,
        details: {
          fetched_at: fetchedAt,
          incomplete_count: incompleteCount,
          invalid_count: invalidCount,
          updated_norm_count: updatedNormCount
        }
      });

      return { runId, status: 'SUCCESS' };
    } catch (error) {
      logError('ingest', 'Falha durante normalização', { error: error?.message });
      await finalizeIngestionRun(client, runId, {
        status: 'FAILED',
        finishedAt: new Date(),
        fetchedCount,
        insertedNormCount,
        duplicatesCount,
        error: error?.message || 'Ingestion failed'
      });
      throw error;
    }
  });
};
