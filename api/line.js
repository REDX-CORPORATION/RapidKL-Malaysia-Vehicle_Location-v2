// GET /api/line?ds=rkl&slug=750&dir=0&part=0             stops from the bundled GTFS data (only needed for routes with no official shape)
// GET /api/line?provider=RKL&id=1039&dir=0&part=0        stops from the myRapid kiosk (routes not in the bundle)
// Returns one chunk of a road-following line (OSRM over OpenStreetMap). The browser walks part=0..parts-1.
const { remember } = require('../lib/cache');
const { getShapes } = require('../lib/kiosk');
const roads = require('../lib/roads');
const v = require('../lib/validate');

module.exports = async function handler(req, res) {
  const dir = parseInt(req.query.dir || '0', 10);
  const part = parseInt(req.query.part || '0', 10);
  if (!(dir >= 0 && dir < 4 && part >= 0 && part < 40)) return res.status(400).json({ error: 'bad dir/part' });

  let stops = null, id;
  try {
    if (req.query.slug) {
      const slug = String(req.query.slug), ds = String(req.query.ds || 'rkl');
      if (!/^[a-z0-9-]{1,60}$/.test(slug) || !/^[a-z]{2,6}$/.test(ds)) return res.status(400).json({ error: 'bad slug' });
      id = `slug:${ds}:${slug}`;
      stops = roads.bundledStops(ds, slug, dir);
    } else if (req.query.id) {
      const provider = v.provider(req.query.provider), rid = v.routeId(req.query.id);
      if (!provider || !rid) return res.status(400).json({ error: 'bad provider/id' });
      id = provider + ':' + rid;
      const { value } = await getShapes(provider, rid);
      stops = roads.kioskStops(value.stops, dir);
    } else return res.status(400).json({ error: 'slug or id required' });
  } catch (e) {
    res.setHeader('cache-control', 'no-store');
    return res.status(200).json({ ok: false, parts: 0, part, line: [], error: e.message });
  }
  if (!stops || stops.length < 2) { res.setHeader('cache-control', 'public, s-maxage=300'); return res.status(404).json({ ok: false, parts: 0, part, line: [], error: 'no stops' }); }

  const parts = roads.partCount(stops.length);
  if (part >= parts) return res.status(200).json({ ok: true, parts, part, line: [] });
  try {
    const { value } = await remember(`line:${id}:${dir}:${part}`, 7 * 864e5, async () => (await roads.snap(roads.partStops(stops, part))) || false);
    res.setHeader('cache-control', 'public, s-maxage=2592000, stale-while-revalidate=86400');
    res.status(200).json({ ok: !!value, parts, part, line: value || [] });
  } catch (e) {
    res.setHeader('cache-control', 'no-store');
    res.status(200).json({ ok: false, parts, part, line: [], error: e.message });
  }
};
