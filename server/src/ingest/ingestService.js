import { withClient } from '../db.js';
import { config } from '../config.js';
import { mapWithConcurrency } from '../utils/concurrency.js';
import { addDays, endOfMonth, formatDate, startOfMonth, toDateOnly } from '../utils/date.js';
import { logError, logInfo, logSuccess, logWarn } from '../utils/logger.js';
import { listMonthRefs, normalizeMonthRange } from '../utils/monthRef.js';
import { normalizeZohoRecord } from './normalize.js';
import { streamZohoReport } from './zohoClient.js';
import { buildIngestionBatchCache, persistNormalizedRecord } from './ingestBatch.js';
import { insertIngestionRun, finalizeIngestionRun, upsertRawPayloadBatch } from './ingestRepository.js';
import { buildZohoRetryOptions, createZohoCircuitBreaker } from './ingestRetry.js';
import { classifyNormalizedRecord, getDedupKey, markDeduped } from './ingestRules.js';

const SOURCE = 'zoho';
const DEFAULT_LOOKBACK_DAYS = 7;
const INGEST_BATCH_SIZE = Math.max(1, Number(config.ingest?.batchSize || 200));
const INGEST_CONCURRENCY = Math.max(1, Number(config.ingest?.concurrency || 4));

const buildCriteria = (field, start, end) => {
  return `(${field} >= "${start}" && ${field} <= "${end}")`;
};

const buildRangeCriteria = (fields, start, end) => {
  const clauses = fields.map((field) => buildCriteria(field, start, end)).filter(Boolean);
  if (!clauses.length) return null;
  if (clauses.length === 1) return clauses[0];
  return `(${clauses.join(' || ')})`;
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

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const prepareIngestionBatch = (records, seenIds) => {
  const entries = [];
  let invalid = 0;
  let incomplete = 0;
  let duplicates = 0;

  for (const record of records) {
    const normalized = normalizeZohoRecord(record);
    const classification = classifyNormalizedRecord(normalized);
    invalid += classification.invalidCount;
    incomplete += classification.incompleteCount;
    if (classification.skip) continue;

    const dedupKey = getDedupKey(normalized);
    if (markDeduped(seenIds, dedupKey)) {
      duplicates += 1;
      continue;
    }

    entries.push({ record, normalized });
  }

  return { entries, invalid, incomplete, duplicates };
};

const buildRawPayloadItems = (entries) =>
  entries.map(({ record, normalized }) => ({
    record,
    sourceContractIdOverride: normalized.is_synthetic_id ? normalized.contract_id : null
  }));

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
    const breaker = createZohoCircuitBreaker();
    const retryOptions = buildZohoRetryOptions(breaker);

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

        for await (const records of streamZohoReport({ criteria, retryOptions })) {
          fetchedCount += records.length;

          const batches = chunkArray(records, INGEST_BATCH_SIZE);
          for (const batch of batches) {
            const prepared = prepareIngestionBatch(batch, seenIds);
            invalidCount += prepared.invalid;
            incompleteCount += prepared.incomplete;
            duplicatesCount += prepared.duplicates;

            if (!prepared.entries.length) continue;

            const [caches, rawResult] = await Promise.all([
              buildIngestionBatchCache(client, prepared.entries),
              upsertRawPayloadBatch({
                client,
                items: buildRawPayloadItems(prepared.entries),
                fetchedAt,
                source: SOURCE
              })
            ]);
            rawInserted += rawResult.inserted;
            rawUpdated += rawResult.updated;
            rawSkipped += rawResult.skipped;

            const persistResults = await mapWithConcurrency(
              prepared.entries,
              INGEST_CONCURRENCY,
              (entry) =>
                persistNormalizedRecord({
                  client,
                  normalized: entry.normalized,
                  caches
                }),
              {
                keyFn: (entry) => entry.normalized.row_hash || getDedupKey(entry.normalized)
              }
            );
            for (let i = 0; i < persistResults.length; i += 1) {
              const result = persistResults[i];
              insertedNormCount += result.insertedNorm;
              updatedNormCount += result.updatedNorm;
              duplicatesCount += result.duplicates;
              if (
                (result.insertedNorm > 0 || result.updatedNorm > 0) &&
                prepared.entries[i].normalized.cpf_cnpj
              ) {
                touchedCpfs.push(prepared.entries[i].normalized.cpf_cnpj);
              }
            }
          }
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
    let rawInserted = 0;
    let rawUpdated = 0;
    let rawSkipped = 0;
    const seenIds = new Set();
    const breaker = createZohoCircuitBreaker();
    const retryOptions = buildZohoRetryOptions(breaker);
    let failedDuringProcessing = false;

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
      for await (const records of streamZohoReport({ criteria, retryOptions })) {
        fetchedCount += records.length;
        try {
          const batches = chunkArray(records, INGEST_BATCH_SIZE);
          for (const batch of batches) {
            const prepared = prepareIngestionBatch(batch, seenIds);
            invalidCount += prepared.invalid;
            incompleteCount += prepared.incomplete;
            duplicatesCount += prepared.duplicates;

            if (!prepared.entries.length) continue;

            const [caches, rawResult] = await Promise.all([
              buildIngestionBatchCache(client, prepared.entries),
              upsertRawPayloadBatch({
                client,
                items: buildRawPayloadItems(prepared.entries),
                fetchedAt,
                source: SOURCE
              })
            ]);
            rawInserted += rawResult.inserted;
            rawUpdated += rawResult.updated;
            rawSkipped += rawResult.skipped;

            const persistResults = await mapWithConcurrency(
              prepared.entries,
              INGEST_CONCURRENCY,
              (entry) =>
                persistNormalizedRecord({
                  client,
                  normalized: entry.normalized,
                  caches
                }),
              {
                keyFn: (entry) => entry.normalized.row_hash || getDedupKey(entry.normalized)
              }
            );
            for (let i = 0; i < persistResults.length; i += 1) {
              const result = persistResults[i];
              insertedNormCount += result.insertedNorm;
              updatedNormCount += result.updatedNorm;
              duplicatesCount += result.duplicates;
              if (
                (result.insertedNorm > 0 || result.updatedNorm > 0) &&
                prepared.entries[i].normalized.cpf_cnpj
              ) {
                touchedCpfs.push(prepared.entries[i].normalized.cpf_cnpj);
              }
            }
          }
        } catch (error) {
          failedDuringProcessing = true;
          throw error;
        }
      }
    } catch (error) {
      if (failedDuringProcessing) {
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

    logInfo('ingest', 'Registros recebidos', { fetched: fetchedCount });

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
        updated_norm_count: updatedNormCount,
        raw_inserted: rawInserted,
        raw_updated: rawUpdated,
        raw_skipped: rawSkipped
      }
    });

    return { runId, status: 'SUCCESS' };
  });
};
