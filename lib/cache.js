// Tiny in-memory TTL cache with in-flight de-duplication and stale-on-error.
// Serverless instances are short-lived and not shared, so this is a best-effort shield in front of
// upstream; the CDN (s-maxage headers) does the heavy lifting across instances.
const store = new Map();
const inflight = new Map();
const MAX_ENTRIES = 400;

function prune() {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, e] of store) if (e.staleUntil < now) store.delete(k);
  while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
}

/**
 * Returns { value, stale }.
 *  - fresh hit              -> cached value
 *  - concurrent callers     -> share ONE loader() call
 *  - loader throws          -> falls back to a stale value if one is still within staleMs, else rethrows
 */
function remember(key, ttlMs, loader, staleMs = 0) {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve({ value: hit.value, stale: false });
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const value = await loader();
      const t = Date.now();
      store.set(key, { value, expires: t + ttlMs, staleUntil: t + ttlMs + staleMs });
      prune();
      return { value, stale: false };
    } catch (err) {
      if (hit && hit.staleUntil > Date.now()) return { value: hit.value, stale: true };
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

module.exports = { remember };
