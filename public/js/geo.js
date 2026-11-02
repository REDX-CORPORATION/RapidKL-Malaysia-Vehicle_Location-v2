const R = 6371000;
const rad = Math.PI / 180;

export function haversine(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Compass bearing in degrees (0 = north) from point 1 to point 2. */
export function bearing(lat1, lng1, lat2, lng2) {
  const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
  const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

export function fmtDist(m) {
  if (m < 950) return Math.max(10, Math.round(m / 10) * 10) + ' m';
  return (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
}

/** Nearest of `points` ({lat,lng}) to a location. Returns { i, d } or null. */
export function nearest(points, lat, lng) {
  let best = null;
  for (let i = 0; i < points.length; i++) {
    const d = haversine(lat, lng, points[i].lat, points[i].lng);
    if (!best || d < best.d) best = { i, d };
  }
  return best;
}
