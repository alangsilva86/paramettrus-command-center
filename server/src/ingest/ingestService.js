import { query, withClient } from '../db.js';
import { config } from '../config.js';
import { normalizeZohoRecord } from './normalize.js';
import { fetchZohoReport, withRetry } from './zohoClient.js';
import { addDays, formatDate, toDateOnly } from '../utils/date.js';
import { logError, logInfo, logSuccess, logWarn } from '../utils/logger.js';
import {
  insertIngestionRun,
  finalizeIngestionRun,
  insertRawPayload,
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

        const existing = await getExistingRowInfo(client, normalized.contract_id);
        if (existing) {
          const needsVendorUpdate = !existing.vendedorId || existing.vendedorId === '';
          const normalizedTs = resolveTimestamp(normalized);
          const existingTs = resolveTimestamp(existing);
          const needsModifiedUpdate =
            normalizedTs && (!existingTs || normalizedTs > existingTs);
          if (existing.rowHash === normalized.row_hash && !needsVendorUpdate && !needsModifiedUpdate) {
            duplicatesCount += 1;
            continue;
          }
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
