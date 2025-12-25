import { sha256 } from '../utils/hash.js';

const normalizedColumns = [
  'contract_id',
  'zoho_record_id',
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
  'zoho_modified_time',
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

const buildNormalizedValues = (contract) => {
  const values = [
    contract.contract_id,
    contract.zoho_record_id || null,
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
    contract.zoho_modified_time,
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
  return values;
};

export const insertIngestionRun = async (client, startedAt) => {
  const result = await client.query(
    `INSERT INTO ingestion_runs (started_at, status)
     VALUES ($1, $2)
     RETURNING run_id`,
    [startedAt, 'RUNNING']
  );
  return result.rows[0].run_id;
};

export const finalizeIngestionRun = async (client, runId, payload) => {
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

export const insertRawPayload = async ({
  client,
  record,
  fetchedAt,
  source,
  sourceContractIdOverride = null
}) => {
  const payloadHash = sha256(JSON.stringify(record));
  const sourceContractId = sourceContractIdOverride || record.ID || record.id || null;
  await client.query(
    `INSERT INTO contracts_raw (source, source_contract_id, payload, fetched_at, payload_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [source, sourceContractId, JSON.stringify(record), fetchedAt, payloadHash]
  );
  return payloadHash;
};

export const upsertRawPayload = async ({
  client,
  record,
  fetchedAt,
  source,
  sourceContractIdOverride = null
}) => {
  const payloadHash = sha256(JSON.stringify(record));
  const sourceContractId = sourceContractIdOverride || record.ID || record.id || null;
  const payload = JSON.stringify(record);

  if (!sourceContractId) {
    await client.query(
      `INSERT INTO contracts_raw (source, source_contract_id, payload, fetched_at, payload_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [source, null, payload, fetchedAt, payloadHash]
    );
    return { inserted: 1, updated: 0, skipped: 0 };
  }

  const existing = await client.query(
    `SELECT raw_id, payload_hash
     FROM contracts_raw
     WHERE source = $1 AND source_contract_id = $2
     ORDER BY fetched_at DESC
     LIMIT 1`,
    [source, sourceContractId]
  );
  if (existing.rowCount === 0) {
    await client.query(
      `INSERT INTO contracts_raw (source, source_contract_id, payload, fetched_at, payload_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [source, sourceContractId, payload, fetchedAt, payloadHash]
    );
    return { inserted: 1, updated: 0, skipped: 0 };
  }
  if (existing.rows[0].payload_hash === payloadHash) {
    return { inserted: 0, updated: 0, skipped: 1 };
  }
  await client.query(
    `UPDATE contracts_raw
     SET payload = $1,
         fetched_at = $2,
         payload_hash = $3
     WHERE raw_id = $4`,
    [payload, fetchedAt, payloadHash, existing.rows[0].raw_id]
  );
  return { inserted: 0, updated: 1, skipped: 0 };
};

export const getExistingRowInfo = async (client, { contractId, zohoRecordId } = {}) => {
  const columns = [
    'contract_id',
    'row_hash',
    'vendedor_id',
    'modified_time',
    'added_time',
    'zoho_record_id',
    'zoho_modified_time'
  ].join(', ');

  const queries = [];
  if (zohoRecordId) {
    queries.push({
      text: `SELECT ${columns} FROM contracts_norm WHERE zoho_record_id = $1 LIMIT 1`,
      values: [zohoRecordId]
    });
  }
  if (contractId) {
    queries.push({
      text: `SELECT ${columns} FROM contracts_norm WHERE contract_id = $1 LIMIT 1`,
      values: [contractId]
    });
  }

  for (const queryConfig of queries) {
    const result = await client.query(queryConfig.text, queryConfig.values);
    if (result.rowCount === 0) continue;
    const row = result.rows[0];
    return {
      contractId: row.contract_id,
      rowHash: row.row_hash,
      vendedorId: row.vendedor_id,
      modifiedTime: row.modified_time,
      addedTime: row.added_time,
      zohoRecordId: row.zoho_record_id,
      zohoModifiedTime: row.zoho_modified_time
    };
  }
  return null;
};

export const resolveTimestamp = (record) => {
  const candidates = [
    record?.zoho_modified_time,
    record?.zohoModifiedTime,
    record?.modified_time,
    record?.modifiedTime,
    record?.added_time,
    record?.addedTime
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const ts = new Date(candidate).getTime();
    if (!Number.isNaN(ts)) return ts;
  }
  return null;
};

export const isIncomingNewer = (incoming, existing) => {
  const incomingTs = resolveTimestamp(incoming);
  const existingTs = resolveTimestamp(existing);
  if (incomingTs && existingTs) return incomingTs > existingTs;
  if (incomingTs && !existingTs) return true;
  if (!incomingTs && existingTs) return false;
  return false;
};

export const getLatestByRowHash = async (client, rowHash) => {
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

export const purgeDuplicatesByRowHash = async (client, rowHash, keepContractId) => {
  const result = await client.query(
    `DELETE FROM contracts_norm
     WHERE row_hash = $1 AND contract_id <> $2`,
    [rowHash, keepContractId]
  );
  return result.rowCount || 0;
};

export const insertNormalized = async (client, contract) => {
  const values = buildNormalizedValues(contract);
  const placeholders = values.map((_, idx) => `$${idx + 1}`);
  await client.query(
    `INSERT INTO contracts_norm (${normalizedColumns.join(', ')})
     VALUES (${placeholders.join(', ')})
     ON CONFLICT (contract_id) DO NOTHING`,
    values
  );
};

export const updateNormalized = async (client, contract) => {
  const assignments = normalizedColumns
    .slice(1)
    .map((col, idx) => `${col} = $${idx + 1}`);
  const values = buildNormalizedValues(contract).slice(1);
  values.push(contract.contract_id);
  await client.query(
    `UPDATE contracts_norm
     SET ${assignments.join(', ')}
     WHERE contract_id = $${normalizedColumns.length}`,
    values
  );
};
