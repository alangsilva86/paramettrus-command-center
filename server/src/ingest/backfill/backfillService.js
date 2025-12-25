import { withClient } from '../../db.js';
import { config } from '../../config.js';
import { formatDate } from '../../utils/date.js';
import { logError, logInfo, logSuccess, logWarn } from '../../utils/logger.js';
import { finalizeIngestionRun, insertIngestionRun, upsertRawPayloadBatch } from '../ingestRepository.js';
import { buildBackfillCriteria, fetchBackfillRecords } from './backfillFetch.js';
import { normalizeBackfillRecord } from './backfillNormalize.js';
import { buildBackfillBatchCache, persistNormalizedRecord } from './backfillPersist.js';
import { buildBackfillRanges } from './backfillRanges.js';
import { classifyBackfillRecord, getBackfillDedupKey, markDeduped } from './backfillRules.js';

const SOURCE = 'zoho';
const BACKFILL_BATCH_SIZE = Math.max(1, Number(config.ingest?.backfillBatchSize || 200));

const resolveDateField = (mode) => {
  if (mode === 'modified') return config.zohoFields.modifiedTime || 'Modified_Time';
  if (mode === 'inicio') return config.zohoFields.inicio;
  return config.zohoFields.dataEfetivacao;
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const prepareBackfillBatch = (records, seenIds) => {
  const entries = [];
  let invalid = 0;
  let incomplete = 0;
  let duplicates = 0;

  for (const record of records) {
    const normalized = normalizeBackfillRecord(record);
    const classification = classifyBackfillRecord(normalized);
    invalid += classification.invalidCount;
    incomplete += classification.incompleteCount;
    if (classification.skip) continue;

    const dedupKey = getBackfillDedupKey(normalized);
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

/**
 * @typedef {Object} BackfillOptions
 * @property {Date} fromDate
 * @property {Date} toDate
 * @property {'effective'|'inicio'|'modified'} dateFieldMode
 * @property {boolean} includeInicio
 * @property {boolean} dryRun
 */

/**
 * @param {BackfillOptions} options
 * @returns {Promise<void>}
 */
export const runBackfill = async ({
  fromDate,
  toDate,
  dateFieldMode,
  includeInicio,
  dryRun
}) => {
  const dateField = resolveDateField(dateFieldMode);
  const ranges = buildBackfillRanges(fromDate, toDate);
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
          const criteria = buildBackfillCriteria(field, startKey, endKey);
          logInfo('ingest', 'Backfill janela', {
            month_ref: range.monthRef,
            field,
            criteria
          });

          const records = await fetchBackfillRecords({ criteria });
          fetchedCount += records.length;

          const batches = chunkArray(records, BACKFILL_BATCH_SIZE);
          for (const batch of batches) {
            const prepared = prepareBackfillBatch(batch, seenIds);
            invalidCount += prepared.invalid;
            incompleteCount += prepared.incomplete;
            duplicatesCount += prepared.duplicates;

            if (!prepared.entries.length) continue;
            if (dryRun) continue;

            const caches = await buildBackfillBatchCache(client, prepared.entries);
            const rawResult = await upsertRawPayloadBatch({
              client,
              items: buildRawPayloadItems(prepared.entries),
              fetchedAt,
              source: SOURCE
            });
            rawInserted += rawResult.inserted;
            rawUpdated += rawResult.updated;
            rawSkipped += rawResult.skipped;

            for (const entry of prepared.entries) {
              const persistResult = await persistNormalizedRecord({
                client,
                normalized: entry.normalized,
                caches
              });
              insertedNormCount += persistResult.insertedNorm;
              updatedNormCount += persistResult.updatedNorm;
              duplicatesCount += persistResult.duplicates;
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

/**
 * @param {Error} error
 */
export const handleBackfillError = (error) => {
  logWarn('ingest', 'Backfill encerrado com erro', { error: error?.message });
};
