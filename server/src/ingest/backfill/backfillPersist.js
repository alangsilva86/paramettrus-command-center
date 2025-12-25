import {
  getExistingRowInfoBatch,
  getLatestByRowHashBatch,
  insertNormalized,
  isIncomingNewer,
  purgeDuplicatesByRowHash,
  resolveTimestamp,
  updateNormalized
} from '../ingestRepository.js';

const buildExistingInfoFromNormalized = (normalized) => ({
  contractId: normalized.contract_id,
  rowHash: normalized.row_hash,
  vendedorId: normalized.vendedor_id,
  modifiedTime: normalized.modified_time,
  addedTime: normalized.added_time,
  zohoRecordId: normalized.zoho_record_id,
  zohoModifiedTime: normalized.zoho_modified_time
});

const resolveExistingFromCache = (normalized, caches) => {
  if (normalized.zoho_record_id && caches.existingByZohoId.has(normalized.zoho_record_id)) {
    return caches.existingByZohoId.get(normalized.zoho_record_id);
  }
  if (normalized.contract_id && caches.existingByContractId.has(normalized.contract_id)) {
    return caches.existingByContractId.get(normalized.contract_id);
  }
  return null;
};

const updateCachesFromNormalized = (normalized, caches) => {
  const existingInfo = buildExistingInfoFromNormalized(normalized);
  if (normalized.contract_id) {
    caches.existingByContractId.set(normalized.contract_id, existingInfo);
  }
  if (normalized.zoho_record_id) {
    caches.existingByZohoId.set(normalized.zoho_record_id, existingInfo);
  }
  if (normalized.row_hash) {
    caches.fingerprintByHash.set(normalized.row_hash, {
      contract_id: normalized.contract_id,
      modified_time: normalized.modified_time,
      added_time: normalized.added_time
    });
  }
};

export const buildBackfillBatchCache = async (client, entries) => {
  const rowHashes = new Set();
  const contractIds = new Set();
  const zohoRecordIds = new Set();

  entries.forEach(({ normalized }) => {
    if (normalized.row_hash) rowHashes.add(normalized.row_hash);
    if (normalized.contract_id) contractIds.add(normalized.contract_id);
    if (normalized.zoho_record_id) zohoRecordIds.add(normalized.zoho_record_id);
  });

  const [fingerprintByHash, existingInfo] = await Promise.all([
    getLatestByRowHashBatch(client, [...rowHashes]),
    getExistingRowInfoBatch(client, {
      contractIds: [...contractIds],
      zohoRecordIds: [...zohoRecordIds]
    })
  ]);

  return {
    fingerprintByHash,
    existingByContractId: existingInfo.byContractId,
    existingByZohoId: existingInfo.byZohoRecordId
  };
};

/**
 * @typedef {Object} BackfillPersistResult
 * @property {number} insertedNorm
 * @property {number} updatedNorm
 * @property {number} duplicates
 */

export const persistNormalizedRecord = async ({ client, normalized, caches }) => {
  const result = {
    insertedNorm: 0,
    updatedNorm: 0,
    duplicates: 0
  };

  const fingerprint = normalized.row_hash
    ? caches.fingerprintByHash.get(normalized.row_hash)
    : null;
  if (fingerprint && fingerprint.contract_id !== normalized.contract_id) {
    const incomingNewer = isIncomingNewer(normalized, fingerprint);
    if (!incomingNewer) {
      result.duplicates += 1;
      return result;
    }
  }

  const existing = resolveExistingFromCache(normalized, caches);
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

  updateCachesFromNormalized(normalized, caches);

  return result;
};
