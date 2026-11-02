// Combines every live source for one network into a single list of vehicles:
//   1. myRapid kiosk  (fresh, ~seconds; undocumented)
//   2. data.gov.my GTFS-Realtime vehicle positions (official; updates about every 30 s; limited to 4 requests/minute)
const { remember } = require('./cache');
const { kioskSnapshot, normalizeKiosk } = require('./kiosk-live');
const { datasetFor, tripsFor, resolveRoute, token } = require('./dataset');
const { transit_realtime } = require('./vendor/gtfs-realtime');

const GTFS_BASE = process.env.GTFS_RT_BASE || 'https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana';
const FEEDS = { RKL: ['rapid-bus-kl', 'rapid-bus-mrtfeeder'], RPG: ['rapid-bus-penang'] };
const GTFS_TTL = 45000;   // data.gov.my allows 4 requests per minute: one request per feed per 45 s keeps two feeds under it
const SNAP_TTL = 4000;

async function fetchGtfs(category) {
  const r = await fetch(`${GTFS_BASE}?category=${encodeURIComponent(category)}`, { signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'jomnaik/2.2' } });
  if (r.status === 429) throw new Error('rate limited by data.gov.my (429)');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const feed = transit_realtime.FeedMessage.toObject(transit_realtime.FeedMessage.decode(Buffer.from(await r.arrayBuffer())), { longs: Number, enums: String });
  const stamp = Number(feed.header && feed.header.timestamp || 0) * 1000;
  const vehicles = [];
  for (const e of feed.entity || []) {
    const v = e.vehicle, p = v && v.position;
    if (!p || !isFinite(p.latitude) || !isFinite(p.longitude) || p.latitude < 0 || p.latitude > 8 || p.longitude < 98 || p.longitude > 120) continue;
    vehicles.push({
      id: String((v.vehicle && v.vehicle.id) || e.id),
      label: String((v.vehicle && (v.vehicle.licensePlate || v.vehicle.label || v.vehicle.id)) || e.id),
      routeId: (v.trip && v.trip.routeId) || '', tripId: (v.trip && v.trip.tripId) || '',
      lat: p.latitude, lng: p.longitude,
      speed: p.speed != null ? Math.round(p.speed * 3.6) : null,
      brg: p.bearing != null ? p.bearing : null,
      t: Number(v.timestamp || 0) * 1000 || stamp,
    });
  }
  return vehicles;
}
const gtfsRaw = (category) => remember('gtfs:' + category, GTFS_TTL, () => fetchGtfs(category), 10 * 60000);

function normalizeGtfs(vehicles, d, ds) {
  const trips = ds ? tripsFor(ds) : {};
  return vehicles.map((v) => {
    let name = '', known = false;
    const direct = d && v.routeId ? resolveRoute(v.routeId, d) : null;
    if (direct && direct.known) { name = direct.name; known = true; }
    else if (d && trips[v.tripId] != null) { name = d.names[trips[v.tripId]]; known = true; }
    else { name = resolveRoute(v.routeId, d).name; }
    return {
      id: v.label, label: v.label, route: name, code: v.routeId, known,
      lat: Math.round(v.lat * 1e5) / 1e5, lng: Math.round(v.lng * 1e5) / 1e5,
      speed: v.speed, brg: v.brg, t: v.t, acc: false, src: 'gtfs',
    };
  });
}

const vehicleKey = (b) => token(b.label || b.id).replace(/[^A-Z0-9]/g, '');
const dist = (a, b) => { const x = (a.lat - b.lat) * 111000, y = (a.lng - b.lng) * 111000 * Math.cos(a.lat * Math.PI / 180); return Math.hypot(x, y); };

/**
 * Same plate in two feeds -> keep the newest fix (kiosk wins ties).
 * Different labels but the same route at the same spot (< 40 m, within 2 min) -> still one bus: keep the kiosk one.
 */
function mergeBuses(groups) {
  const byKey = new Map();
  for (const buses of groups) for (const b of buses) {
    const key = vehicleKey(b);
    const old = byKey.get(key);
    if (!old || b.t > old.t || (b.t === old.t && b.src === 'kiosk')) byKey.set(key, { ...b, id: key });
  }
  const all = [...byKey.values()];
  const kiosk = new Map();
  for (const b of all) if (b.src === 'kiosk') { if (!kiosk.has(b.route)) kiosk.set(b.route, []); kiosk.get(b.route).push(b); }
  return all.filter((b) => b.src === 'kiosk' || !(kiosk.get(b.route) || []).some((k) => Math.abs(k.t - b.t) < 120000 && dist(k, b) < 40));
}

async function build(provider) {
  const d = datasetFor(provider);
  const ds = d && d.ds;
  const jobs = [{ name: 'myRapid kiosk', run: async () => normalizeKiosk(await kioskSnapshot(provider), d, provider) }];
  for (const c of FEEDS[provider] || []) jobs.push({ name: c, run: async () => normalizeGtfs((await gtfsRaw(c)).value, d, ds) });

  const results = await Promise.allSettled(jobs.map((j) => j.run()));
  const groups = [], sources = [];
  results.forEach((r, i) => {
    sources.push(r.status === 'fulfilled' ? { name: jobs[i].name, ok: true, count: r.value.length } : { name: jobs[i].name, ok: false, error: String(r.reason && r.reason.message || r.reason).slice(0, 120) });
    if (r.status === 'fulfilled') groups.push(r.value);
  });
  if (!groups.length) throw new Error('All vehicle feeds unavailable: ' + sources.map((s) => s.name + ': ' + s.error).join('; '));
  return { ts: Date.now(), buses: mergeBuses(groups), sources, partial: sources.some((s) => !s.ok) };
}

/** { value: {ts, buses, sources, partial}, stale } */
const snapshot = (provider) => remember('live:' + provider, SNAP_TTL, () => build(provider), 90000);

module.exports = { snapshot, mergeBuses, normalizeGtfs, fetchGtfs, vehicleKey, FEEDS };
