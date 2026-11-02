// myRapid live feed ("kiosk"), read over Engine.IO *HTTP polling* with plain fetch.
// Polling works on serverless platforms where a long-lived websocket would not, and needs no socket.io client.
const { gunzipSync } = require('node:zlib');
const { randomUUID } = require('node:crypto');
const { remember } = require('./cache');
const { resolveRoute } = require('./dataset');

const BASE = process.env.KIOSK_SOCKET_BASE || 'https://rapidbus-socketio-avl.prasarana.com.my/socket.io/';
const UA = 'jomnaik/2.2';

/** Kiosk timestamps are Malaysia time ("2026-10-31 17:18:18"). */
function parseTime(value) {
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const s = String(value || '').trim();
  if (!s) return 0;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') + '+08:00' : s;
  return Date.parse(iso) || 0;
}

function decode(payload) {
  if (typeof payload !== 'string') throw new Error('Invalid kiosk payload');
  return JSON.parse(gunzipSync(Buffer.from(payload, 'base64'), { maxOutputLength: 12 * 1024 * 1024 }).toString('utf8'));
}

const OTHER = new Set(['RPG', 'RKN', 'RKL-PUTRAJAYA']);
/** Same provider, or no tag. For RKL also tags we don't recognise: feeder/shuttle fleets may carry their own. */
function belongs(b, provider) {
  const p = b.provider == null ? '' : String(b.provider);
  if (!p || p === provider) return true;
  return provider === 'RKL' && !OTHER.has(p);
}

function normalizeKiosk(raw, d, provider, now = Date.now()) {
  const entries = Array.isArray(raw) ? raw.map((b, i) => [String(i), b]) : Object.entries(raw || {});
  const out = [];
  for (const [k, b] of entries) {
    if (!b || typeof b !== 'object' || !belongs(b, provider)) continue;
    const lat = Number(b.latitude), lng = Number(b.longitude);
    if (b.latitude == null || b.longitude == null || !isFinite(lat) || !isFinite(lng) || lat < 0 || lat > 8 || lng < 98 || lng > 120) continue;
    const label = String(b.bus_no || b.vehicle_no || k || '').trim();
    if (!label) continue;
    const { name, known } = resolveRoute(b.route, d);
    const t = parseTime(b.dt_gps);
    out.push({
      id: label, label, route: name, code: String(b.route == null ? '' : b.route), known,
      lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5,
      speed: b.speed != null && isFinite(Number(b.speed)) ? Number(b.speed) : null,
      brg: b.angle != null && isFinite(Number(b.angle)) ? Number(b.angle) : null,
      t, acc: !!b.accessibility, src: 'kiosk',
    });
  }
  return out;
}

async function readKiosk(provider, fetcher = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let sid;

  async function request(body) {
    const params = new URLSearchParams({ EIO: '4', transport: 'polling', t: randomUUID() });
    if (sid) params.set('sid', sid);
    const r = await fetcher(BASE + '?' + params, {
      method: body === undefined ? 'GET' : 'POST', body, signal: controller.signal,
      headers: { 'User-Agent': UA, 'Content-Type': 'text/plain;charset=UTF-8' },
    });
    if (!r.ok) throw new Error('Kiosk feed HTTP ' + r.status);
    return r.text();
  }

  try {
    const open = await request();
    if (!open.startsWith('0')) throw new Error('Unexpected kiosk handshake');
    sid = JSON.parse(open.slice(1)).sid;
    if (typeof sid !== 'string') throw new Error('Missing kiosk session');
    await request('40');
    const ack = await request();
    if (!ack.split('\x1e').some((f) => f.startsWith('40'))) throw new Error('Kiosk did not acknowledge session');
    await request('42' + JSON.stringify(['onFts-reload', { sid: randomUUID().replace(/-/g, ''), uid: '', provider, route: '' }]));
    for (let i = 0; i < 4; i++) {
      const frames = (await request()).split('\x1e');
      for (const frame of frames) {
        if (frame === '2') { await request('3'); continue; } // answer the server's ping
        if (frame.startsWith('42')) {
          const event = JSON.parse(frame.slice(2));
          if (event[0] === 'onFts-client') return decode(event[1]);
        }
      }
    }
    throw new Error('No kiosk vehicle snapshot');
  } finally {
    clearTimeout(timer);
    controller.abort();
    // politely close the Engine.IO session, even on failure
    if (sid) {
      try {
        await fetcher(BASE + '?' + new URLSearchParams({ EIO: '4', transport: 'polling', sid }), {
          method: 'POST', body: '1', signal: AbortSignal.timeout(1000), headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'User-Agent': UA },
        });
      } catch { /* best effort */ }
    }
  }
}

/** Shared snapshot: one upstream session per provider every 4 s, however many people are watching. */
const kioskSnapshot = (provider) => remember('kiosk:' + provider, 4000, () => readKiosk(provider), 90000).then((r) => r.value);

module.exports = { parseTime, decode, normalizeKiosk, readKiosk, kioskSnapshot, belongs };
