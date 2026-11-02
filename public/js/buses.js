import { haversine } from './geo.js';
import { MOVING_KMH, SIGNAL_STALE_S } from './config.js';

/**
 * Adds derived fields to API buses (the server sends `t` = GPS time in ms):
 *  age (s) | moving | stale | near { stop, dist, key }   (near only when `stops` given)
 *  stops: [{ lat, lng, name, key }]
 */
export function enrich(list, stops = []) {
  const now = Date.now();
  return list.map((b) => {
    let age = b.t > 0 ? (now - b.t) / 1000 : null;
    if (age != null && age < 0) age = 0;
    if (age != null && age > 30 * 86400) age = null; // nonsense clock
    const moving = b.speed != null && b.speed >= MOVING_KMH;
    const stale = age != null && age > SIGNAL_STALE_S;
    let near = null;
    if (stops.length) {
      let best = null;
      for (const s of stops) {
        const d = haversine(b.lat, b.lng, s.lat, s.lng);
        if (!best || d < best.d) best = { stop: s, d };
      }
      if (best && best.d < 900) near = { stop: best.stop, dist: best.d, key: best.stop.key };
    }
    return { ...b, age, moving, stale, near };
  });
}
