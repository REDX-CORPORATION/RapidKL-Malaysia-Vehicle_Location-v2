const { getShapes } = require('../lib/kiosk');
const v = require('../lib/validate');

module.exports = async function handler(req, res) {
  const provider = v.provider(req.query.provider);
  const route = v.routeId(req.query.route);
  if (!provider) return res.status(400).json({ error: 'unknown provider' });
  if (!route) return res.status(400).json({ error: 'route (numeric kiosk id) required' });
  try {
    const { value } = await getShapes(provider, route);
    const empty = !Object.keys(value.shapes || {}).length && !(value.stops || []).length;
    // An "empty" parse usually means a challenge page or a layout change: don't let it stick for an hour.
    res.setHeader('cache-control', empty ? 'public, s-maxage=60' : 's-maxage=3600, stale-while-revalidate=600');
    res.status(200).json(value);
  } catch (e) {
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({ shapes: {}, latlngs: {}, stops: [], error: e.message });
  }
};
