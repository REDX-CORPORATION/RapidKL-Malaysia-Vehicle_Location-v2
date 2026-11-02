// Open /api/health after deploying to see which live sources this Vercel region can reach.
// Add ?route=T568 to see how a route appears in the feeds (raw codes -> public numbers).
const { kioskSnapshot } = require('../lib/kiosk-live');
const { fetchGtfs, FEEDS } = require('../lib/live');
const { fetchRoutes } = require('../lib/kiosk');
const { datasetFor, resolveRoute } = require('../lib/dataset');
const { remember } = require('../lib/cache');
const v = require('../lib/validate');

const count = (arr) => arr.reduce((m, k) => (m.set(k, (m.get(k) || 0) + 1), m), new Map());
const top = (m, n) => Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n));

async function probe(route) {
  const t0 = Date.now();
  const out = { time: new Date().toISOString(), region: process.env.VERCEL_REGION || 'local', node: process.version };
  const d = datasetFor('RKL');
  const want = v.normRoute(route);
  try {
    const raw = await kioskSnapshot('RKL');
    const list = Array.isArray(raw) ? raw : Object.values(raw || {});
    const buses = list.filter((b) => b && typeof b === 'object');
    out.kiosk = { ok: true, count: buses.length, providers: top(count(buses.map((b) => String(b.provider))), 10), fields: buses[0] ? Object.keys(buses[0]) : [] };
    if (route) {
      const core = want.replace(/^[A-Z]+/, '') || want;
      const similar = buses.filter((b) => String(b.route).toUpperCase().includes(core));
      out.routeCheck = {
        asked: route,
        feedCodesContaining: Object.fromEntries([...count(similar.map((b) => String(b.route))).entries()].map(([code, n]) => [code, { buses: n, resolvesTo: resolveRoute(code, d).name }])),
        busesResolvingToRoute: buses.filter((b) => v.normRoute(resolveRoute(b.route, d).name) === want).length,
      };
    }
  } catch (e) { out.kiosk = { ok: false, error: e.message }; }
  out.gtfsRealtime = [];
  for (const c of FEEDS.RKL) {
    try { const vs = await fetchGtfs(c); out.gtfsRealtime.push({ category: c, ok: true, count: vs.length, sampleRouteIds: Object.keys(top(count(vs.map((x) => x.routeId)), 6)) }); }
    catch (e) { out.gtfsRealtime.push({ category: c, ok: false, error: e.message }); }
  }
  try { const r = await fetchRoutes('RKL'); out.kioskRoutePage = { ok: true, count: r.length }; }
  catch (e) { out.kioskRoutePage = { ok: false, error: e.message }; }
  out.ms = Date.now() - t0;
  return out;
}

module.exports = async function handler(req, res) {
  const route = v.routeName(req.query.route);
  if (route === null) return res.status(400).json({ error: 'invalid route' });
  const { value } = await remember('health:' + v.normRoute(route), 60000, () => probe(route));
  res.setHeader('cache-control', 'no-store');
  res.status(200).json(value);
};
