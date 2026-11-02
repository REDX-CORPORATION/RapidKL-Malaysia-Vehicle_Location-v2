const KIOSK = process.env.KIOSK_BASE || 'https://myrapidbus.prasarana.com.my/kiosk';
const UA = 'jomnaik-tracker/2.0 (+https://github.com/mohdsyahid/rapidkl-malaysia)';

async function fetchKioskOnce(url) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(4000),
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-MY,en;q=0.9',
      referer: 'https://myrapidbus.prasarana.com.my/',
    },
  });
  if (!r.ok) throw new Error('kiosk responded ' + r.status);
  const html = await r.text();
  // Bot-protection interstitials come back as 200 + a tiny HTML page. Say so, instead of "no routes".
  if (/_Incapsula_Resource|Incapsula incident|hcaptcha|Request unsuccessful/i.test(html) && html.length < 20000) {
    throw new Error('kiosk bot protection blocked this server');
  }
  return html;
}

// The kiosk's bot protection is flaky rather than a hard block, so one quick retry often succeeds.
async function fetchKiosk(url) {
  try { return await fetchKioskOnce(url); }
  catch (e) { await new Promise((r) => setTimeout(r, 600)); return fetchKioskOnce(url); }
}

function parseRouteOptions(html) {
  const out = [];
  const re = /<option value="(\d+)">([^<]+)<\/option>/g;
  let m;
  while ((m = re.exec(html))) { if (m[1]) out.push({ id: m[1], name: m[2].trim() }); }
  const seen = new Set();
  return out.filter((rt) => !seen.has(rt.name) && seen.add(rt.name));
}

function extractGrouped(pattern, html, group = 1) {
  const m = html.match(new RegExp(pattern, 's'));
  return m ? m[group] : null;
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

async function fetchRoutes(provider) {
  const params = new URLSearchParams();
  if (provider === 'RKL-PUTRAJAYA') params.set('provider', 'RKL-PUTRAJAYA');
  const url = KIOSK + (params.toString() ? '?' + params : '');
  const routes = parseRouteOptions(await fetchKiosk(url));
  if (!routes.length) throw new Error('kiosk returned no routes (layout changed or request blocked)');
  return routes;
}

async function fetchShapes(provider, routeId) {
  const url = KIOSK + '?route=' + encodeURIComponent(routeId) + '&provider=' + encodeURIComponent(provider);
  const html = await fetchKiosk(url);
  const shapesRaw = extractGrouped('\\$\\.parseJSON\\(`(.*?)`\\)', html);
  const latlngsRaw = extractGrouped('var latlngs = \\$\\.parseJSON\\(`(.*?)`\\)', html);
  const bstpRaw = extractGrouped('var bstp = (\\[.*?\\]);', html);
  return {
    shapes: shapesRaw ? safeParse(shapesRaw) || {} : {},
    latlngs: latlngsRaw ? safeParse(latlngsRaw) || {} : {},
    stops: bstpRaw ? safeParse(bstpRaw) || [] : [],
  };
}

const { remember } = require('./cache');
/** Shared, cached shapes lookup (used by /api/shapes and /api/line so the kiosk is hit once per route per hour). */
function getShapes(provider, routeId) {
  return remember('shapes:' + provider + ':' + routeId, 3600000, () => fetchShapes(provider, routeId), 24 * 3600000);
}

module.exports = { fetchRoutes, fetchShapes, getShapes, KIOSK };
