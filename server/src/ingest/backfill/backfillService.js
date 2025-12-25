import { withClient } from '../../db.js';
import { config } from '../../config.js';
import { formatDate } from '../../utils/date.js';
import { logError, logInfo, logSuccess, logWarn } from '../../utils/logger.js';
import { finalizeIngestionRun, insertIngestionRun } from '../ingestRepository.js';
import { buildBackfillCriteria, fetchBackfillRecords } from './backfillFetch.js';
import { normalizeBackfillRecord } from './backfillNormalize.js';
import { persistBackfillRecord } from './backfillPersist.js';
import { buildBackfillRanges } from './backfillRanges.js';

const SOURCE = 'zoho';

const resolveDateField = (mode) => {
  if (mode === 'modified') return config.zohoFields.modifiedTime || 'Modified_Time';
  if (mode === 'inicio') return config.zohoFields.inicio;
  return config.zohoFields.dataEfetivacao;
};

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

          for (const record of records) {
            const normalized = normalizeBackfillRecord(record);
            if (!normalized.month_ref) {
              invalidCount += 1;
              continue;
            }
            if (normalized.is_incomplete) incompleteCount += 1;
            if (normalized.is_invalid) invalidCount += 1;

            const persistResult = await persistBackfillRecord({
              client,
              record,
              normalized,
              fetchedAt,
              source: SOURCE,
              seenIds,
              dryRun
            });
            insertedNormCount += persistResult.insertedNorm;
            updatedNormCount += persistResult.updatedNorm;
            duplicatesCount += persistResult.duplicates;
            rawInserted += persistResult.rawInserted;
            rawUpdated += persistResult.rawUpdated;
            rawSkipped += persistResult.rawSkipped;
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
