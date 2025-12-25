const createLimiter = (limit) => {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= limit) return;
    const item = queue.shift();
    if (!item) return;
    active += 1;
    Promise.resolve()
      .then(item.fn)
      .then(item.resolve, item.reject)
      .finally(() => {
        active -= 1;
        next();
      });
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
};

export const mapWithConcurrency = async (items, limit, mapper, { keyFn } = {}) => {
  const safeLimit = Math.max(1, Number(limit) || 1);
  if (!items.length) return [];

  const limiter = createLimiter(safeLimit);
  const results = new Array(items.length);
  const keyLocks = new Map();

  const schedule = (fn, key) => {
    if (!key) return limiter(fn);
    const prev = keyLocks.get(key) || Promise.resolve();
    const chained = prev.catch(() => {}).then(() => limiter(fn));
    keyLocks.set(key, chained);
    return chained;
  };

  const tasks = items.map((item, index) =>
    schedule(() => mapper(item, index), keyFn ? keyFn(item, index) : null)
      .then((result) => {
        results[index] = result;
      })
  );

  await Promise.all(tasks);
  return results;
};
