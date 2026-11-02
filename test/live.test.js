const test = require('node:test');
const assert = require('node:assert/strict');
const { gzipSync } = require('node:zlib');
const { resolveRoute, publicNumber, datasetFor } = require('../lib/dataset');
const { normalizeKiosk, parseTime, readKiosk } = require('../lib/kiosk-live');
const { mergeBuses, normalizeGtfs } = require('../lib/live');
const { transit_realtime: rt } = require('../lib/vendor/gtfs-realtime');

const rkl = datasetFor('RKL'), rpg = datasetFor('RPG');

test('feed codes resolve to public route numbers (the T568 bug)', () => {
  for (const [code, want] of [['T5680', 'T568'], ['T5681', 'T568'], ['t5680', 'T568'], ['U3000', '300'], ['U7500', '750'], ['B1000', 'SUNWAY LINE']]) {
    assert.equal(resolveRoute(code, rkl).name, want, code);
    assert.equal(resolveRoute(code, rkl).known, true, code + ' known');
  }
});
test('T7568 is route T756, never T568', () => assert.equal(resolveRoute('T7568', rkl).name, 'T756'));
test('feeder routes: GTFS id and public code both work', () => {
  assert.equal(resolveRoute('30000143', rkl).name, 'T117');
  assert.equal(resolveRoute('T1170', rkl).name, 'T117');
});
test('plain public numbers still resolve', () => { assert.equal(resolveRoute('750', rkl).name, '750'); assert.equal(resolveRoute('T568', rkl).name, 'T568'); });
test('Penang: ids and code+digit', () => { assert.equal(resolveRoute('30000019', rpg).name, '401'); assert.equal(resolveRoute('4010', rpg).name, '401'); assert.equal(resolveRoute('401E', rpg).name, '401E'); });
test('route numbers that contain digits: GP020 -> GP02', () => { assert.equal(resolveRoute('GP020', rkl).name, 'GP02'); assert.equal(resolveRoute('GP021', rkl).name, 'GP02'); });
test('unknown routes are kept (best guess), never dropped', () => {
  const r = resolveRoute('T9999', rkl); assert.equal(r.known, false); assert.equal(r.name, 'T999');
  assert.equal(resolveRoute('T5680', null).name, 'T568'); // network with no bundled data
});
test('publicNumber', () => { assert.equal(publicNumber('U3000'), '300'); assert.equal(publicNumber('T5680'), 'T568'); assert.equal(publicNumber('SUNWAY LINE'), 'SUNWAYLINE'); });

test('kiosk time is Malaysia time', () => assert.equal(new Date(parseTime('2026-10-31 17:18:18')).toISOString(), '2026-10-31T09:18:18.000Z'));

const kioskRaw = {
  a: { bus_no: 'WYV1234', route: 'T5680', provider: 'RKL', latitude: '3.0086', longitude: '101.7062', speed: '22', angle: '90', dt_gps: '2026-10-31 17:18:18', captain_id: 'SECRET' },
  b: { bus_no: 'WYV1235', route: 'T5681', provider: 'RKL', latitude: 3.0046, longitude: 101.7059, speed: 0, dt_gps: '2026-10-31 17:18:00' },
  c: { bus_no: 'PNG1', route: '401', provider: 'RPG', latitude: 5.4, longitude: 100.3 },
  d: { bus_no: 'ODD1', route: 'T1170', provider: 'MRT-FEEDER', latitude: 3.1, longitude: 101.7 },
  e: { bus_no: 'ZERO', route: 'U3000', provider: 'RKL', latitude: 0, longitude: 0 },
  f: { route: 'U3000', provider: 'RKL', latitude: 3.1, longitude: 101.6 },
};
test('kiosk normalisation: routes resolved, other networks dropped, driver id never forwarded', () => {
  const out = normalizeKiosk(kioskRaw, rkl, 'RKL');
  assert.deepEqual(out.map((b) => [b.id, b.route]).sort(), [['ODD1', 'T117'], ['WYV1234', 'T568'], ['WYV1235', 'T568'], ['f', '300']].sort());
  assert.ok(!JSON.stringify(out).includes('SECRET'));
  const a = out.find((b) => b.id === 'WYV1234'); assert.equal(a.brg, 90); assert.equal(a.speed, 22); assert.equal(a.code, 'T5680');
  assert.equal(normalizeKiosk(kioskRaw, rpg, 'RPG').length, 1);
});

test('GTFS-Realtime: route from route_id, or from trip_id when route_id is unusable', () => {
  const trips = require('../data/trips.json').rkl, names = rkl.names;
  const tripId = Object.keys(trips).find((t) => names[trips[t]] === '300');
  const out = normalizeGtfs([
    { id: 'v1', label: 'AAA1', routeId: 'U3000', tripId: '', lat: 3.1, lng: 101.7, speed: 10, brg: 5, t: 1 },
    { id: 'v2', label: 'AAA2', routeId: 'weird', tripId, lat: 3.1, lng: 101.7, speed: 10, brg: 5, t: 1 },
  ], rkl, 'rkl');
  assert.deepEqual(out.map((b) => b.route), ['300', '300']);
});
test('GTFS-Realtime protobuf round trip', () => {
  const buf = rt.FeedMessage.encode(rt.FeedMessage.create({ header: { gtfsRealtimeVersion: '2.0', timestamp: 1000 }, entity: [{ id: 'x', vehicle: { position: { latitude: 3.1, longitude: 101.6, speed: 5 }, vehicle: { id: 'V' } } }] })).finish();
  assert.equal(rt.FeedMessage.toObject(rt.FeedMessage.decode(buf)).entity[0].vehicle.position.speed, 5);
});

test('merge: same plate keeps newest; same route+place under a different label counts once; kiosk preferred', () => {
  const k = { id: 'WYV1234', label: 'WYV1234', route: 'T568', lat: 3.0, lng: 101.7, t: 2000, src: 'kiosk' };
  const g1 = { id: 'WYV 1234', label: 'WYV 1234', route: 'T568', lat: 3.0, lng: 101.7, t: 1000, src: 'gtfs' };   // same plate, older
  const g2 = { id: 'OTHER9', label: 'OTHER9', route: 'T568', lat: 3.00010, lng: 101.7, t: 1500, src: 'gtfs' };   // ~11 m away, same route
  const g3 = { id: 'FAR1', label: 'FAR1', route: 'T568', lat: 3.01, lng: 101.7, t: 1500, src: 'gtfs' };          // different bus
  const out = mergeBuses([[k], [g1, g2, g3]]);
  assert.deepEqual(out.map((b) => b.id).sort(), ['FAR1', 'WYV1234']);
});

test('kiosk Engine.IO polling handshake', async () => {
  const payload = gzipSync(JSON.stringify(kioskRaw)).toString('base64');
  const seen = [];
  const fetcher = async (url, init = {}) => {
    const u = new URL(url); const method = init.method || 'GET'; seen.push(method + ' ' + (init.body || ''));
    const ok = (t) => ({ ok: true, status: 200, text: async () => t });
    if (method === 'GET' && !u.searchParams.has('sid')) return ok('0{"sid":"s1"}');
    if (method === 'POST') return ok('ok');
    const gets = seen.filter((x) => x.startsWith('GET')).length;
    return ok(gets === 2 ? '40{"sid":"x"}' : gets === 3 ? '2' : '42' + JSON.stringify(['onFts-client', payload]));
  };
  const raw = await readKiosk('RKL', fetcher);
  assert.equal(Object.keys(raw).length, 6);
  assert.ok(seen.some((x) => x.startsWith('POST 40')) && seen.some((x) => x.includes('onFts-reload')) && seen.includes('POST 3'));
});
