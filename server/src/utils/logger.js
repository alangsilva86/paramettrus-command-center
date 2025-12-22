const scopeEmojis = {
  server: '🚀',
  ingest: '🛰️',
  zoho: '🔗',
  snapshot: '📸',
  ledger: '🧮',
  renewal: '🚦',
  cross: '🧲',
  rules: '📜',
  db: '🧱',
  admin: '🛡️'
};

const levelEmojis = {
  info: 'ℹ️',
  success: '✅',
  warn: '⚠️',
  error: '💥'
};

const buildPrefix = (scope, level) => {
  const scopeEmoji = scopeEmojis[scope] || '🧩';
  const levelEmoji = levelEmojis[level] || 'ℹ️';
  const tag = scope ? `[${scope.toUpperCase()}]` : '';
  return `${scopeEmoji} ${levelEmoji} ${tag}`.trim();
};

const formatPayload = (payload) => {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  try {
    return JSON.stringify(payload);
  } catch (error) {
    return String(payload);
  }
};

export const logInfo = (scope, message, payload) => {
  const extra = formatPayload(payload);
  console.log(`${buildPrefix(scope, 'info')} ${message}${extra ? ` → ${extra}` : ''}`);
};

export const logSuccess = (scope, message, payload) => {
  const extra = formatPayload(payload);
  console.log(`${buildPrefix(scope, 'success')} ${message}${extra ? ` → ${extra}` : ''}`);
};

export const logWarn = (scope, message, payload) => {
  const extra = formatPayload(payload);
  console.warn(`${buildPrefix(scope, 'warn')} ${message}${extra ? ` → ${extra}` : ''}`);
};

export const logError = (scope, message, payload) => {
  const extra = formatPayload(payload);
  console.error(`${buildPrefix(scope, 'error')} ${message}${extra ? ` → ${extra}` : ''}`);
};
