import { withClient } from '../src/db.js';
import { config } from '../src/config.js';
import { normalizeZohoRecord } from '../src/ingest/normalize.js';
import { fetchZohoReport, withRetry } from '../src/ingest/zohoClient.js';
import { formatDate, formatMonthRef, startOfMonth, endOfMonth, toDateOnly } from '../src/utils/date.js';
import { sha256 } from '../src/utils/hash.js';
import { logError, logInfo, logSuccess, logWarn } from '../src/utils/logger.js';

const SOURCE = 'zoho';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (value === undefined) return fallback;
  return value;
};

const help = args.includes('--help');
if (help) {
  console.log(`Usage: node scripts/ingest_backfill.js --from YYYY-MM-DD --to YYYY-MM-DD [options]

Options:
  --date-field effective|inicio|modified   (default: effective)
  --include-inicio                          include inicio range when date-field=effective
  --dry-run                                 do not write to database
`);
  process.exit(0);
}

const fromArg = getArg('from');
const toArg = getArg('to');
if (!fromArg || !toArg) {
  console.error('Parametros obrigatorios: --from YYYY-MM-DD --to YYYY-MM-DD');
  process.exit(1);
}

const fromDate = toDateOnly(fromArg);
const toDate = toDateOnly(toArg);
if (!fromDate || !toDate) {
  console.error('Datas invalidas. Use YYYY-MM-DD.');
  process.exit(1);
}
if (fromDate > toDate) {
  console.error('--from deve ser menor ou igual a --to');
  process.exit(1);
}

const dateFieldMode = getArg('date-field', 'effective');
const includeInicio = args.includes('--include-inicio');
const dryRun = args.includes('--dry-run');
const allowedModes = new Set(['effective', 'inicio', 'modified']);
if (!allowedModes.has(dateFieldMode)) {
  console.error('--date-field deve ser effective, inicio ou modified');
  process.exit(1);
}

const resolveDateField = (mode) => {
  if (mode === 'modified') return config.zohoFields.modifiedTime || 'Modified_Time';
  if (mode === 'inicio') return config.zohoFields.inicio;
  return config.zohoFields.dataEfetivacao;
};

const shiftMonthRef = (monthRef, deltaMonths) => {
  const [year, month] = monthRef.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return formatMonthRef(shifted);
};

const buildRanges = (start, end) => {
  const ranges = [];
  const startMonth = formatMonthRef(start);
  const endMonth = formatMonthRef(end);
  let cursor = startMonth;
  while (cursor <= endMonth) {
    const rangeStart = cursor === startMonth ? start : startOfMonth(cursor);
    const rangeEnd = cursor === endMonth ? end : endOfMonth(cursor);
    ranges.push({ monthRef: cursor, start: rangeStart, end: rangeEnd });
    cursor = shiftMonthRef(cursor, 1);
  }
  return ranges;
};

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

const upsertRawPayload = async (client, record, fetchedAt, sourceContractIdOverride = null) => {
  const payloadHash = sha256(JSON.stringify(record));
  const sourceContractId = sourceContractIdOverride || record.ID || record.id || null;
  const payload = JSON.stringify(record);

  if (!sourceContractId) {
    await client.query(
      `INSERT INTO contracts_raw (source, source_contract_id, payload, fetched_at, payload_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [SOURCE, null, payload, fetchedAt, payloadHash]
    );
    return { inserted: 1, updated: 0, skipped: 0 };
  }

  const existing = await client.query(
    `SELECT raw_id, payload_hash
     FROM contracts_raw
     WHERE source = $1 AND source_contract_id = $2
     ORDER BY fetched_at DESC
     LIMIT 1`,
    [SOURCE, sourceContractId]
  );
  if (existing.rowCount === 0) {
    await client.query(
      `INSERT INTO contracts_raw (source, source_contract_id, payload, fetched_at, payload_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [SOURCE, sourceContractId, payload, fetchedAt, payloadHash]
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
     VALUES (${placeholders.join(', ')})`,
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

const run = async () => {
  const dateField = resolveDateField(dateFieldMode);
  const ranges = buildRanges(fromDate, toDate);
  const primaryCriteriaFields = [dateField];
  if (dateFieldMode === 'effective' && includeInicio && config.zohoFields.inicio) {
    primaryCriteriaFields.push(config.zohoFields.inicio);
  }

  logInfo('ingest', 'Backfill iniciado', {
    from: formatDate(fromDate),
    to: formatDate(toDate),
    date_field: dateFieldMode,
    criteria_fields: primaryCriteriaFields,
    dry_run: dryRun
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

    try {
      for (const range of ranges) {
        const startKey = formatDate(range.start);
        const endKey = formatDate(range.end);
        for (const field of primaryCriteriaFields) {
          const criteria = buildCriteria(field, startKey, endKey);
          logInfo('ingest', 'Backfill janela', {
            month_ref: range.monthRef,
            field,
            criteria
          });

          const records = await withRetry(
            () => fetchZohoReport({ criteria }),
            3,
            (error) => error?.code !== 'ZOHO_AUTH_401'
          );
          fetchedCount += records.length;

          for (const record of records) {
            const contractId = record.ID || record.id || null;
            if (contractId && seenIds.has(contractId)) {
              duplicatesCount += 1;
              continue;
            }
            if (contractId) seenIds.add(contractId);

            const normalized = normalizeZohoRecord(record);
            if (!normalized.month_ref) {
              invalidCount += 1;
              continue;
            }
            if (normalized.is_incomplete) incompleteCount += 1;
            if (normalized.is_invalid) invalidCount += 1;

            if (dryRun) continue;

            const rawResult = await upsertRawPayload(
              client,
              record,
              fetchedAt,
              normalized.is_synthetic_id ? normalized.contract_id : null
            );
            rawInserted += rawResult.inserted;
            rawUpdated += rawResult.updated;
            rawSkipped += rawResult.skipped;

            const fingerprint = await getLatestByRowHash(client, normalized.row_hash);
            if (fingerprint && fingerprint.contract_id !== normalized.contract_id) {
              const incomingNewer = isIncomingNewer(normalized, fingerprint);
              if (!incomingNewer) {
                duplicatesCount += 1;
                continue;
              }
            }

            const existing = await getExistingRowInfo(client, normalized.contract_id);
            const normalizedTs = resolveTimestamp(normalized);
            const existingTs = resolveTimestamp(existing);
            const needsModifiedUpdate =
              normalizedTs && (!existingTs || normalizedTs > existingTs);
            const needsVendorUpdate = existing && (!existing.vendedorId || existing.vendedorId === '');
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
          }
        }
      }

      await finalizeIngestionRun(client, runId, {
        status: 'SUCCESS',
        finishedAt: new Date(),
        fetchedCount,
        insertedNormCount,
        duplicatesCount,
        details: {
          mode: 'backfill',
          from: formatDate(fromDate),
          to: formatDate(toDate),
          date_field_mode: dateFieldMode,
          criteria_fields: primaryCriteriaFields,
          dry_run: dryRun,
          updated_norm_count: updatedNormCount,
          raw_inserted: rawInserted,
          raw_updated: rawUpdated,
          raw_skipped: rawSkipped,
          invalid_count: invalidCount,
          incomplete_count: incompleteCount
        }
      });

      logSuccess('ingest', 'Backfill concluido', {
        fetched: fetchedCount,
        inserted: insertedNormCount,
        updated: updatedNormCount,
        duplicates: duplicatesCount,
        invalid: invalidCount,
        incomplete: incompleteCount,
        raw_inserted: rawInserted,
        raw_updated: rawUpdated,
        raw_skipped: rawSkipped
      });
    } catch (error) {
      logError('ingest', 'Falha no backfill', { error: error?.message });
      await finalizeIngestionRun(client, runId, {
        status: 'FAILED',
        finishedAt: new Date(),
        fetchedCount,
        insertedNormCount,
        duplicatesCount,
        error: error?.message || 'Backfill failed'
      });
      throw error;
    }
  });
};

run().catch((error) => {
  logWarn('ingest', 'Backfill encerrado com erro', { error: error?.message });
  process.exit(1);
});
