import { query, withClient } from '../db.js';
import { sha256 } from '../utils/hash.js';
import { normalizeZohoRecord } from './normalize.js';
import { fetchZohoReport, withRetry } from './zohoClient.js';
import { formatDate } from '../utils/date.js';
import { logError, logInfo, logSuccess, logWarn } from '../utils/logger.js';

const SOURCE = 'zoho';

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

const contractExists = async (client, contractId) => {
  const result = await client.query(
    'SELECT 1 FROM contracts_norm WHERE contract_id = $1 LIMIT 1',
    [contractId]
  );
  return result.rowCount > 0;
};

const rowHashExistsInMonth = async (client, rowHash, monthRef) => {
  const result = await client.query(
    'SELECT 1 FROM contracts_norm WHERE row_hash = $1 AND month_ref = $2 LIMIT 1',
    [rowHash, monthRef]
  );
  return result.rowCount > 0;
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
    'status',
    'premio',
    'comissao_pct',
    'comissao_valor',
    'row_hash',
    'dedup_group',
    'is_synthetic_id',
    'is_incomplete',
    'is_invalid',
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
    contract.status,
    contract.premio,
    contract.comissao_pct,
    contract.comissao_valor,
    contract.row_hash,
    contract.dedup_group,
    contract.is_synthetic_id,
    contract.is_incomplete,
    contract.is_invalid,
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
    const fetchedAt = new Date().toISOString();
    const touchedCpfs = [];

    let records = [];
    try {
      records = await withRetry(() => fetchZohoReport(), 3);
    } catch (error) {
      logError('ingest', 'Zoho indisponível ou credenciais inválidas');
      await finalizeIngestionRun(client, runId, {
        status: 'STALE_DATA',
        finishedAt: new Date(),
        fetchedCount,
        insertedNormCount,
        duplicatesCount,
        error: error?.message || 'Zoho unavailable'
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

        if (!normalized.is_synthetic_id) {
          const exists = await contractExists(client, normalized.contract_id);
          if (exists) {
            duplicatesCount += 1;
            continue;
          }
        } else {
          const dup = await rowHashExistsInMonth(client, normalized.row_hash, normalized.month_ref);
          if (dup) {
            duplicatesCount += 1;
            continue;
          }
        }

        await insertNormalized(client, normalized);
        insertedNormCount += 1;
        if (normalized.cpf_cnpj) touchedCpfs.push(normalized.cpf_cnpj);
      }

      await refreshCustomers(client, touchedCpfs);

      if (insertedNormCount === 0) {
        logWarn('ingest', 'Nenhum contrato normalizado foi inserido');
      }
      logSuccess('ingest', 'Ingestão concluída', {
        inserted: insertedNormCount,
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
          invalid_count: invalidCount
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
