import {
  getExistingRowInfo,
  getLatestByRowHash,
  insertNormalized,
  isIncomingNewer,
  purgeDuplicatesByRowHash,
  resolveTimestamp,
  updateNormalized,
  upsertRawPayload
} from '../ingestRepository.js';

/**
 * @typedef {Object} BackfillPersistResult
 * @property {number} insertedNorm
 * @property {number} updatedNorm
 * @property {number} duplicates
 * @property {number} rawInserted
 * @property {number} rawUpdated
 * @property {number} rawSkipped
 */

/**
 * @param {Object} params
 * @param {import('pg').PoolClient} params.client
 * @param {Object} params.record
 * @param {Object} params.normalized
 * @param {string} params.fetchedAt
 * @param {string} params.source
 * @param {Set<string>} params.seenIds
 * @param {boolean} params.dryRun
 * @returns {Promise<BackfillPersistResult>}
 */
export const persistBackfillRecord = async ({
  client,
  record,
  normalized,
  fetchedAt,
  source,
  seenIds,
  dryRun
}) => {
  const result = {
    insertedNorm: 0,
    updatedNorm: 0,
    duplicates: 0,
    rawInserted: 0,
    rawUpdated: 0,
    rawSkipped: 0
  };

  const dedupKey = normalized.zoho_record_id || normalized.contract_id;
  if (dedupKey && seenIds.has(dedupKey)) {
    result.duplicates += 1;
    return result;
  }
  if (dedupKey) seenIds.add(dedupKey);

  if (dryRun) return result;

  const rawResult = await upsertRawPayload({
    client,
    record,
    fetchedAt,
    source,
    sourceContractIdOverride: normalized.is_synthetic_id ? normalized.contract_id : null
  });
  result.rawInserted += rawResult.inserted;
  result.rawUpdated += rawResult.updated;
  result.rawSkipped += rawResult.skipped;

  const fingerprint = await getLatestByRowHash(client, normalized.row_hash);
  if (fingerprint && fingerprint.contract_id !== normalized.contract_id) {
    const incomingNewer = isIncomingNewer(normalized, fingerprint);
    if (!incomingNewer) {
      result.duplicates += 1;
      return result;
    }
  }

  const existing = await getExistingRowInfo(client, {
    contractId: normalized.contract_id,
    zohoRecordId: normalized.zoho_record_id
  });
  if (existing) {
    normalized.contract_id = existing.contractId;
  }
  const normalizedTs = resolveTimestamp(normalized);
  const existingTs = resolveTimestamp(existing);
  const needsModifiedUpdate = existing && normalizedTs && (!existingTs || normalizedTs > existingTs);
  const needsVendorUpdate = existing && (!existing.vendedorId || existing.vendedorId === '');
  if (existing && existing.rowHash === normalized.row_hash && !needsVendorUpdate && !needsModifiedUpdate) {
    result.duplicates += 1;
    return result;
  }
  if (existing) {
    await updateNormalized(client, normalized);
    result.updatedNorm += 1;
  } else {
    await insertNormalized(client, normalized);
    result.insertedNorm += 1;
  }

  if (fingerprint) {
    const removed = await purgeDuplicatesByRowHash(
      client,
      normalized.row_hash,
      normalized.contract_id
    );
    if (removed > 0) result.duplicates += removed;
  }

  return result;
};
