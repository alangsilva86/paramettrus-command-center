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

const buildExistingRowInfo = (row) => ({
  contractId: row.contract_id,
  rowHash: row.row_hash,
  vendedorId: row.vendedor_id,
  modifiedTime: row.modified_time,
  addedTime: row.added_time,
  zohoRecordId: row.zoho_record_id,
  zohoModifiedTime: row.zoho_modified_time
});

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

export const upsertRawPayloadBatch = async ({ client, items, fetchedAt, source }) => {
  if (!items.length) return { inserted: 0, updated: 0, skipped: 0 };

  const prepared = items.map((item) => {
    const payload = JSON.stringify(item.record);
    const payloadHash = sha256(payload);
    const sourceContractId = item.sourceContractIdOverride || item.record.ID || item.record.id || null;
    return {
      sourceContractId,
      payload,
      payloadHash
    };
  });

  const withoutId = prepared.filter((item) => !item.sourceContractId);
  const withId = prepared.filter((item) => item.sourceContractId);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const insertRows = async (rows) => {
    if (!rows.length) return;
    const values = [];
    const placeholders = rows.map((row, idx) => {
      const base = idx * 5;
      values.push(source, row.sourceContractId || null, row.payload, fetchedAt, row.payloadHash);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
    });
    await client.query(
      `INSERT INTO contracts_raw (source, source_contract_id, payload, fetched_at, payload_hash)\n       VALUES ${placeholders.join(', ')}`,
      values
    );
  };

  if (withoutId.length) {
    await insertRows(withoutId);
    inserted += withoutId.length;
  }

  if (withId.length) {
    const ids = [...new Set(withId.map((item) => item.sourceContractId))];
    const existing = await client.query(
      `SELECT DISTINCT ON (source_contract_id) source_contract_id, raw_id, payload_hash\n       FROM contracts_raw\n       WHERE source = $1 AND source_contract_id = ANY($2)\n       ORDER BY source_contract_id, fetched_at DESC, raw_id DESC`,
      [source, ids]
    );
    const existingMap = new Map(
      existing.rows.map((row) => [row.source_contract_id, row])
    );

    const toInsert = [];
    const toUpdate = [];
    for (const item of withId) {
      const existingRow = existingMap.get(item.sourceContractId);
      if (!existingRow) {
        toInsert.push(item);
        inserted += 1;
        continue;
      }
      if (existingRow.payload_hash === item.payloadHash) {
        skipped += 1;
        continue;
      }
      toUpdate.push({
        rawId: existingRow.raw_id,
        payload: item.payload,
        payloadHash: item.payloadHash
      });
      updated += 1;
    }

    if (toInsert.length) {
      await insertRows(toInsert);
    }

    if (toUpdate.length) {
      const values = [];
      const placeholders = toUpdate.map((row, idx) => {
        const base = idx * 4;
        values.push(row.rawId, row.payload, fetchedAt, row.payloadHash);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
      });
      await client.query(
        `UPDATE contracts_raw AS cr\n         SET payload = v.payload,\n             fetched_at = v.fetched_at,\n             payload_hash = v.payload_hash\n         FROM (VALUES ${placeholders.join(', ')}) AS v(raw_id, payload, fetched_at, payload_hash)\n         WHERE cr.raw_id = v.raw_id`,
        values
      );
    }
  }

  return { inserted, updated, skipped };
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
    return buildExistingRowInfo(row);
  }
  return null;
};

export const getExistingRowInfoBatch = async (
  client,
  { contractIds = [], zohoRecordIds = [] } = {}
) => {
  const columns = [
    'contract_id',
    'row_hash',
    'vendedor_id',
    'modified_time',
    'added_time',
    'zoho_record_id',
    'zoho_modified_time'
  ].join(', ');
  const byContractId = new Map();
  const byZohoRecordId = new Map();

  if (zohoRecordIds.length) {
    const result = await client.query(
      `SELECT DISTINCT ON (zoho_record_id) ${columns}
       FROM contracts_norm
       WHERE zoho_record_id = ANY($1)
       ORDER BY zoho_record_id, modified_time DESC NULLS LAST, added_time DESC NULLS LAST, created_at DESC`,
      [zohoRecordIds]
    );
    result.rows.forEach((row) => {
      if (!row.zoho_record_id) return;
      byZohoRecordId.set(row.zoho_record_id, buildExistingRowInfo(row));
    });
  }

  if (contractIds.length) {
    const result = await client.query(
      `SELECT DISTINCT ON (contract_id) ${columns}
       FROM contracts_norm
       WHERE contract_id = ANY($1)
       ORDER BY contract_id, modified_time DESC NULLS LAST, added_time DESC NULLS LAST, created_at DESC`,
      [contractIds]
    );
    result.rows.forEach((row) => {
      if (!row.contract_id) return;
      byContractId.set(row.contract_id, buildExistingRowInfo(row));
    });
  }

  return { byContractId, byZohoRecordId };
};

export const getLatestByRowHashBatch = async (client, rowHashes = []) => {
  if (!rowHashes.length) return new Map();
  const result = await client.query(
    `SELECT DISTINCT ON (row_hash) row_hash, contract_id, modified_time, added_time
     FROM contracts_norm
     WHERE row_hash = ANY($1)
     ORDER BY row_hash, modified_time DESC NULLS LAST, added_time DESC NULLS LAST, created_at DESC`,
    [rowHashes]
  );
  return new Map(
    result.rows.map((row) => [
      row.row_hash,
      {
        contract_id: row.contract_id,
        modified_time: row.modified_time,
        added_time: row.added_time
      }
    ])
  );
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
