import { withClient } from '../src/db.js';
import { config } from '../src/config.js';
import { normalizeZohoRecord } from '../src/ingest/normalize.js';
import {
  finalizeIngestionRun,
  getExistingRowInfo,
  getLatestByRowHash,
  insertIngestionRun,
  insertNormalized,
  isIncomingNewer,
  purgeDuplicatesByRowHash,
  resolveTimestamp,
  updateNormalized,
  upsertRawPayload
} from '../src/ingest/ingestRepository.js';
import { fetchZohoReport, withRetry } from '../src/ingest/zohoClient.js';
import { formatDate, formatMonthRef, startOfMonth, endOfMonth, toDateOnly } from '../src/utils/date.js';
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

            const rawResult = await upsertRawPayload({
              client,
              record,
              fetchedAt,
              source: SOURCE,
              sourceContractIdOverride: normalized.is_synthetic_id ? normalized.contract_id : null
            });
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
