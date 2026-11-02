const { snapshot } = require('../lib/live');
const v = require('../lib/validate');

module.exports = async function handler(req, res) {
  const provider = v.provider(req.query.provider);
  const route = v.routeName(req.query.route);
  if (!provider) return res.status(400).json({ error: 'unknown provider' });
  if (route === null) return res.status(400).json({ error: 'invalid route' });

  let snap;
  try { snap = await snapshot(provider); }
  catch (e) {
    res.setHeader('cache-control', 'no-store');
    return res.status(502).json({ error: e.message });
  }
  const { ts, buses: all, sources, partial } = snap.value;
  // `route` is the public number the app uses ("T568"); the raw feed code ("T5680") also matches.
  const want = v.normRoute(route);
  const buses = route ? all.filter((b) => v.normRoute(b.route) === want || v.normRoute(b.code) === want) : all;
  res.setHeader('cache-control', snap.stale ? 'no-store' : 'public, s-maxage=5, stale-while-revalidate=10');
  res.status(200).json({ ts, provider, route, count: buses.length, stale: snap.stale, partial, sources, buses });
};
