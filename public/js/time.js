/**
 * GPS timestamps from the feed are strings like "2026-10-31 16:09:12" with no zone.
 * Treat them as Malaysia time (UTC+8). main.js also self-calibrates (see buses.js) in case
 * the feed turns out to be UTC, so a wrong guess never shows nonsense like "8 h ago".
 */
export function parseGps(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (m) {
    const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`);
    return isNaN(t) ? null : t;
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : t;
}

export function ago(sec) {
  if (sec == null) return '';
  if (sec < 10) return 'just now';
  if (sec < 60) return Math.round(sec) + 's ago';
  if (sec < 3600) return Math.round(sec / 60) + ' min ago';
  if (sec < 86400) return Math.round(sec / 3600) + ' h ago';
  return Math.round(sec / 86400) + ' d ago';
}
