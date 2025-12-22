const pad = (num) => String(num).padStart(2, '0');

export const toDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const raw = String(value).trim();
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }

  const brMatch = raw.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})/);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

export const formatDate = (date) => {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  const d = pad(date.getUTCDate());
  return `${y}-${m}-${d}`;
};

export const formatMonthRef = (date) => {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = pad(date.getUTCMonth() + 1);
  return `${y}-${m}`;
};

export const daysDiff = (targetDate, referenceDate) => {
  if (!targetDate || !referenceDate) return null;
  const t = targetDate.getTime();
  const r = referenceDate.getTime();
  return Math.ceil((t - r) / (1000 * 60 * 60 * 24));
};

export const addDays = (date, days) => {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};

export const startOfMonth = (monthRef) => {
  const [year, month] = monthRef.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
};

export const endOfMonth = (monthRef) => {
  const start = startOfMonth(monthRef);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
};

export const countBusinessDays = (start, end) => {
  let count = 0;
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
};
