const { fetchRoutes } = require('../lib/kiosk');
const { remember } = require('../lib/cache');
const v = require('../lib/validate');

module.exports = async function handler(req, res) {
  const provider = v.provider(req.query.provider);
  if (!provider) return res.status(400).json({ error: 'unknown provider' });
  try {
    const { value } = await remember('routes:' + provider, 3600000, () => fetchRoutes(provider), 24 * 3600000);
    res.setHeader('cache-control', 's-maxage=3600, stale-while-revalidate=600');
    res.status(200).json({ provider, routes: value });
  } catch (e) {
    // Never let the CDN cache a failure. The app falls back to its bundled route index.
    res.setHeader('cache-control', 'no-store');
    res.status(502).json({ error: e.message });
  }
};
