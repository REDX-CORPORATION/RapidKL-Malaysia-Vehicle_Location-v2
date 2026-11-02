// Traces a bus stop sequence along real roads using OSRM, which routes over OpenStreetMap data.
// Stop sequences are cut into chunks (CHUNK waypoints each) so every request is small and cacheable.
const fs = require('fs');
const path = require('path');

const OSRM = (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const UA = 'jomnaik/2.0 (bus tracker; +https://github.com/mohdsyahid/rapidkl-malaysia)';
const CHUNK = 30;      // waypoints per OSRM request. MUST match LINE_CHUNK in public/js/config.js
const GAP_MS = 700;    // the public OSRM demo asks for <= 1 request/second: space calls out per instance

const rad = Math.PI / 180;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hav(a, b) {
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(x)));
}
const pathLen = (pts) => { let t = 0; for (let i = 1; i < pts.length; i++) t += hav(pts[i - 1], pts[i]); return t; };

/** Douglas-Peucker in metres. Keeps responses small without visibly changing the line. */
function simplify(pts, tolM = 3) {
  if (pts.length < 3) return pts;
  const kx = 111320 * Math.cos(pts[0][0] * rad), ky = 110540;
  const P = pts.map((p) => [p[1] * kx, p[0] * ky]);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = P[a], [bx, by] = P[b];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      let t = len2 ? ((P[i][0] - ax) * dx + (P[i][1] - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(ax + t * dx - P[i][0], ay + t * dy - P[i][1]);
      if (d > max) { max = d; idx = i; }
    }
    if (idx > 0 && max > tolM) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]).map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]);
}

let chain = Promise.resolve();
let lastAt = 0;
function throttled(fn) {
  const run = chain.then(async () => {
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

/** coords: [[lat,lng],...] -> road-following [[lat,lng],...], or null if the result looks wrong. */
async function snap(coords) {
  const q = coords.map((c) => c[1].toFixed(5) + ',' + c[0].toFixed(5)).join(';');
  const url = `${OSRM}/route/v1/driving/${q}?overview=full&geometries=geojson&steps=false&alternatives=false&continue_straight=true`;
  const r = await throttled(() => fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': UA, accept: 'application/json' } }));
  if (!r.ok) throw new Error('osrm http ' + r.status);
  const j = await r.json();
  if (j.code !== 'Ok' || !j.routes || !j.routes[0]) throw new Error('osrm ' + (j.code || 'no route'));
  const line = j.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  // Bus stops sit on kerbs and dual carriageways; a snapped path wildly longer than the stop chain means
  // OSRM picked a silly detour. Better to draw nothing fancy than something wrong.
  if (pathLen(line) > pathLen(coords) * 4 + 400) return null;
  return simplify(line);
}

const partCount = (n) => (n < 2 ? 0 : Math.ceil((n - 1) / (CHUNK - 1)));
const partStops = (stops, p) => stops.slice(p * (CHUNK - 1), p * (CHUNK - 1) + CHUNK);

/** Stops of one direction from the bundled GTFS data: [[lat,lng],...] or null. */
function bundledStops(ds, slug, dir) {
  try {
    const f = path.join(__dirname, '..', 'public', 'data', ds, 'routes', slug + '.json');
    const d = JSON.parse(fs.readFileSync(f, 'utf8')).d[dir];
    return d ? d.s.map((s) => [s[2], s[3]]) : null;
  } catch { return null; }
}

/** Same grouping the browser does for kiosk stops (by `dr`, in order of appearance). */
function kioskStops(stops, dir) {
  const groups = new Map();
  for (const s of Array.isArray(stops) ? stops : []) {
    const lat = +(s.lat ?? s.latitude), lng = +(s.lng ?? s.lon ?? s.longitude);
    if (!isFinite(lat) || !isFinite(lng)) continue;
    const k = s.dr == null ? '' : String(s.dr);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push([lat, lng]);
  }
  return [...groups.values()][dir] || null;
}

module.exports = { snap, simplify, partCount, partStops, bundledStops, kioskStops, CHUNK, pathLen };
