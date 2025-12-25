export const getDedupKey = (normalized) =>
  normalized.zoho_record_id || normalized.contract_id || null;

export const classifyNormalizedRecord = (normalized) => {
  if (!normalized.month_ref) {
    return {
      skip: true,
      invalidCount: 1,
      incompleteCount: 0
    };
  }

  return {
    skip: false,
    invalidCount: normalized.is_invalid ? 1 : 0,
    incompleteCount: normalized.is_incomplete ? 1 : 0
  };
};

export const markDeduped = (seenIds, dedupKey) => {
  if (!dedupKey) return false;
  if (seenIds.has(dedupKey)) return true;
  seenIds.add(dedupKey);
  return false;
};
