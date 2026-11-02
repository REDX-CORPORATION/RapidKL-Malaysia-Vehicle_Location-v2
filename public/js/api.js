const enc = encodeURIComponent;

function withTimeout(signal, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(new DOMException('timeout', 'TimeoutError')), ms);
  if (signal) {
    if (signal.aborted) c.abort(signal.reason);
    else signal.addEventListener('abort', () => c.abort(signal.reason), { once: true });
  }
  return { signal: c.signal, done: () => clearTimeout(t) };
}

async function getJSON(url, { signal, timeout = 9000 } = {}) {
  const k = withTimeout(signal, timeout);
  try {
    const r = await fetch(url, { signal: k.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
    return await r.json();
  } finally { k.done(); }
}

// ---- live (serverless functions) ----
export const buses = (provider, route, signal) =>
  getJSON(`/api/buses?provider=${enc(provider)}&route=${enc(route || '')}`, { signal, timeout: 8000 });
export const kioskRoutes = (provider) => getJSON(`/api/routes?provider=${enc(provider)}`, { timeout: 10000 });
export const kioskShapes = (provider, id) => getJSON(`/api/shapes?provider=${enc(provider)}&route=${enc(id)}`, { timeout: 12000 });

// ---- static, CDN-cached route data (public/data/<ds>/) ----
const indexCache = new Map();
export function routeIndex(ds) {
  if (!indexCache.has(ds)) indexCache.set(ds, getJSON(`/data/${enc(ds)}/index.json`).catch((e) => { indexCache.delete(ds); throw e; }));
  return indexCache.get(ds);
}
const metaCache = new Map();
export function routeMeta(ds, slug) {
  const k = ds + '/' + slug;
  if (!metaCache.has(k)) metaCache.set(k, getJSON(`/data/${enc(ds)}/routes/${enc(slug)}.json`).catch((e) => { metaCache.delete(k); throw e; }));
  return metaCache.get(k);
}

// ---- road-following lines ----
/** One chunk of a traced line (only for routes with no official shape). src = { ds, slug } or { provider, id }. */
export function line(src, dir, part, signal) {
  const q = src.slug ? `ds=${enc(src.ds)}&slug=${enc(src.slug)}` : `provider=${enc(src.provider)}&id=${enc(src.id)}`;
  return getJSON(`/api/line?${q}&dir=${dir}&part=${part}`, { signal, timeout: 12000 });
}
