import { query, withClient } from '../db.js';
import { sha256 } from '../utils/hash.js';
import { normalizeZohoRecord } from './normalize.js';
import { fetchZohoReport, withRetry } from './zohoClient.js';
import { addDays, formatDate, toDateOnly } from '../utils/date.js';
import { logError, logInfo, logSuccess, logWarn } from '../utils/logger.js';

const SOURCE = 'zoho';
const DEFAULT_LOOKBACK_DAYS = 7;

const buildCriteria = (field, start, end) => {
  return `(${field} >= "${start}" && ${field} <= "${end}")`;
};

const insertIngestionRun = async (client, startedAt) => {
  const result = await client.query(
    `INSERT INTO ingestion_runs (started_at, status)
     VALUES ($1, $2)
     RETURNING run_id`,
    [startedAt, 'RUNNING']
  );
  return result.rows[0].run_id;
};

const finalizeIngestionRun = async (client, runId, payload) => {
  const {
    status,
    finishedAt,
    fetchedCount,
    insertedNormCount,
    duplicatesCount,
    error,
    details
  } = payload;

  await client.query(
    `UPDATE ingestion_runs
     SET finished_at = $2,
         status = $3,
         fetched_count = $4,
         inserted_norm_count = $5,
         duplicates_count = $6,
         error = $7,
         details = $8
     WHERE run_id = $1`,
    [
      runId,
      finishedAt,
      status,
      fetchedCount,
      insertedNormCount,
      duplicatesCount,
      error,
      details ? JSON.stringify(details) : null
    ]
  );
};

const insertRawPayload = async (client, record, fetchedAt) => {
  const payloadHash = sha256(JSON.stringify(record));
  const sourceContractId = record.ID || record.id || null;
  await client.query(
    `INSERT INTO contracts_raw (source, source_contract_id, payload, fetched_at, payload_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [SOURCE, sourceContractId, JSON.stringify(record), fetchedAt, payloadHash]
  );
  return payloadHash;
};

const getExistingRowInfo = async (client, contractId) => {
  const result = await client.query(
    'SELECT row_hash, vendedor_id, modified_time, added_time FROM contracts_norm WHERE contract_id = $1 LIMIT 1',
    [contractId]
  );
  if (result.rowCount === 0) return null;
  return {
    rowHash: result.rows[0].row_hash,
    vendedorId: result.rows[0].vendedor_id,
    modifiedTime: result.rows[0].modified_time,
    addedTime: result.rows[0].added_time
  };
};

const resolveTimestamp = (record) => {
  const value =
    record?.modified_time ??
    record?.modifiedTime ??
    record?.added_time ??
    record?.addedTime ??
    null;
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? null : ts;
};

const isIncomingNewer = (incoming, existing) => {
  const incomingTs = resolveTimestamp(incoming);
  const existingTs = resolveTimestamp(existing);
  if (incomingTs && existingTs) return incomingTs > existingTs;
  if (incomingTs && !existingTs) return true;
  if (!incomingTs && existingTs) return false;
  return false;
};

const getLatestByRowHash = async (client, rowHash) => {
  const result = await client.query(
    `SELECT contract_id, modified_time, added_time
     FROM contracts_norm
     WHERE row_hash = $1
     ORDER BY modified_time DESC NULLS LAST, added_time DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [rowHash]
  );
  if (result.rowCount === 0) return null;
  return {
    contract_id: result.rows[0].contract_id,
    modified_time: result.rows[0].modified_time,
    added_time: result.rows[0].added_time
  };
};

const purgeDuplicatesByRowHash = async (client, rowHash, keepContractId) => {
  const result = await client.query(
    `DELETE FROM contracts_norm
     WHERE row_hash = $1 AND contract_id <> $2`,
    [rowHash, keepContractId]
  );
  return result.rowCount || 0;
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

const insertNormalized = async (client, contract) => {
  const columns = [
    'contract_id',
    'cpf_cnpj',
    'segurado_nome',
    'vendedor_id',
    'produto',
    'ramo',
    'seguradora',
    'cidade',
    'data_efetivacao',
    'inicio',
    'termino',
    'added_time',
    'modified_time',
    'status',
    'premio',
    'comissao_pct',
    'comissao_valor',
    'row_hash',
    'dedup_group',
    'is_synthetic_id',
    'is_incomplete',
    'is_invalid',
    'quality_flags',
    'needs_review',
    'month_ref'
  ];

  const values = [
    contract.contract_id,
    contract.cpf_cnpj,
    contract.segurado_nome,
    contract.vendedor_id,
    contract.produto,
    contract.ramo,
    contract.seguradora,
    contract.cidade || null,
    contract.data_efetivacao,
    contract.inicio,
    contract.termino,
    contract.added_time,
    contract.modified_time,
    contract.status,
    contract.premio,
    contract.comissao_pct,
    contract.comissao_valor,
    contract.row_hash,
    contract.dedup_group,
    contract.is_synthetic_id,
    contract.is_incomplete,
    contract.is_invalid,
    contract.quality_flags,
    contract.needs_review,
    contract.month_ref
  ];

  const placeholders = values.map((_, idx) => `$${idx + 1}`);
  await client.query(
    `INSERT INTO contracts_norm (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     ON CONFLICT (contract_id) DO NOTHING`,
    values
  );
};

const updateNormalized = async (client, contract) => {
  const columns = [
    'cpf_cnpj',
    'segurado_nome',
    'vendedor_id',
    'produto',
    'ramo',
    'seguradora',
    'cidade',
    'data_efetivacao',
    'inicio',
    'termino',
    'added_time',
    'modified_time',
    'status',
    'premio',
    'comissao_pct',
    'comissao_valor',
    'row_hash',
    'dedup_group',
    'is_synthetic_id',
    'is_incomplete',
    'is_invalid',
    'quality_flags',
    'needs_review',
    'month_ref'
  ];

  const values = [
    contract.cpf_cnpj,
    contract.segurado_nome,
    contract.vendedor_id,
    contract.produto,
    contract.ramo,
    contract.seguradora,
    contract.cidade || null,
    contract.data_efetivacao,
    contract.inicio,
    contract.termino,
    contract.added_time,
    contract.modified_time,
    contract.status,
    contract.premio,
    contract.comissao_pct,
    contract.comissao_valor,
    contract.row_hash,
    contract.dedup_group,
    contract.is_synthetic_id,
    contract.is_incomplete,
    contract.is_invalid,
    contract.quality_flags,
    contract.needs_review,
    contract.month_ref,
    contract.contract_id
  ];

  const assignments = columns.map((col, idx) => `${col} = $${idx + 1}`);
  await client.query(
    `UPDATE contracts_norm
     SET ${assignments.join(', ')}
     WHERE contract_id = $${columns.length + 1}`,
    values
  );
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
        await insertRawPayload(client, record, fetchedAt);
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
