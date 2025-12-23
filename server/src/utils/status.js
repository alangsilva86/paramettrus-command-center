export const normalizeStatusList = (value) => {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
};

export const buildStatusFilter = (params, statusConfig) => {
  if (!statusConfig) return null;
  const include = statusConfig.include || [];
  const exclude = statusConfig.exclude || [];
  if (include.length > 0) {
    params.push(include);
    return `status = ANY($${params.length})`;
  }
  if (exclude.length > 0) {
    params.push(exclude);
    return `status <> ALL($${params.length})`;
  }
  return null;
};
