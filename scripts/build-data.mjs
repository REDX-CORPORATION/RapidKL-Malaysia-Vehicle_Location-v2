#!/usr/bin/env node
/**
 * Compiles the GTFS-derived JSON in data-src/ into:
 *
 *   public/data/<ds>/index.json            route list (search, labels, kiosk ids)
 *   public/data/<ds>/routes/<slug>.json    stops + OFFICIAL road geometry per direction
 *   data/codes.json                        feed route code -> public route number (server only)
 *   data/trips.json                        GTFS-Realtime trip id -> route (server only)
 *
 *   <ds> = rkl (RapidKL + MRT feeder, also used for Putrajaya)  |  rpg (Rapid Penang)
 *
 * Source data: Prasarana GTFS Static from data.gov.my (CC BY 4.0), compiled with lib/gtfs-compile.js
 * (`npm run refresh-data` downloads fresh copies into data-src/). T568 comes from OpenStreetMap (ODbL)
 * when the official feed doesn't have it yet.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { titleCase, splitStopName, slugify, compareRoutes } from '../public/js/format.js';

const require = createRequire(import.meta.url);
const { simplify } = require('../lib/roads.js');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'data-src');
const OUT = join(ROOT, 'public', 'data');
const load = async (f) => JSON.parse(await readFile(join(SRC, f), 'utf8'));
const r5 = (n) => Math.round(Number(n) * 1e5) / 1e5;

/** Feeder routes have the GTFS id as their "number" and the public code (T117) as their name. */
const displayName = (r) => (r.number === r.id && r.name && r.name !== r.id ? r.name.trim() : String(r.number).trim());
const dash = (s) => titleCase(String(s).replace(/\s+-\s+/g, ' ~ '));

function convert(r, kind) {
  const name = displayName(r);
  const dirs = [];
  for (const d of r.directions || []) {
    const stops = (d.stops || []).filter((s) => isFinite(s.lat) && isFinite(s.lon));
    if (!stops.length) continue;
    const last = stops[stops.length - 1];
    const raw = String(d.name || '').trim();
    // "JETI - TELUK KUMBAR" is a real headsign (we want the destination); a bare stop name is just GTFS's fallback.
    let h = null;
    if (/\s-\s/.test(raw)) h = titleCase(raw.split(/\s-\s/).pop());
    else if (raw && raw.toUpperCase() !== String(last.name).trim().toUpperCase()) h = titleCase(raw);
    let g = [];
    if (Array.isArray(d.segments)) g = d.segments.filter((s) => s.length > 1).map((s) => simplify(s, 1.5)); // OSM way segments
    else if (Array.isArray(d.geometry) && d.geometry.length > 1) g = [simplify(d.geometry, 2.5)];
    dirs.push({
      h, raw,
      s: stops.map((s) => { const { code, name: nm } = splitStopName(s.name); return [code, nm, r5(s.lat), r5(s.lon), s.id]; }),
      g,
    });
  }
  if (!dirs.length) return null;
  let label = r.name && r.name.trim() !== name ? r.name.trim() : '';
  if (!label && dirs[0].raw) label = dash(dirs[0].raw);
  return { name, label, kind, dirs, id: r.id, aliases: r.aliases || [], kid: r.kioskId, osm: r.source === 'OpenStreetMap contributors' };
}

async function buildDataset(ds, groups, extra = []) {
  const routes = new Map();
  const idToName = new Map();
  const trips = [];
  for (const { file, kind } of groups) {
    const d = await load(file);
    for (const r of d.routes) {
      const c = convert(r, typeof kind === 'function' ? kind(r) : kind);
      if (!c) continue;
      if (routes.has(c.name)) { console.warn(`  ${ds}: duplicate route ${c.name} skipped (${file})`); continue; }
      idToName.set(String(r.id), c.name);
      routes.set(c.name, c);
    }
    trips.push(d.tripIndex || {});
  }
  for (const r of extra) { // OSM fallbacks only when the official data lacks the route
    if (routes.has(r.number)) continue;
    const c = convert(r, 'feeder'); if (!c) continue;
    routes.set(c.name, c); idToName.set(String(r.id), c.name);
  }
  const dir = join(OUT, ds);
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, 'routes'), { recursive: true });

  const slugs = new Set();
  const list = [...routes.values()].sort((a, b) => compareRoutes(a.name, b.name));
  const index = [];
  for (const c of list) {
    let slug = slugify(c.name), i = 2;
    while (slugs.has(slug)) slug = slugify(c.name) + '-' + i++;
    slugs.add(slug);
    await writeFile(join(dir, 'routes', slug + '.json'), JSON.stringify({
      n: c.name, l: c.label, ...(c.osm ? { src: 'osm' } : {}),
      d: c.dirs.map((d) => ({ h: d.h, s: d.s, g: d.g })),
    }));
    index.push({
      n: c.name, l: c.label, k: c.kind, f: slug,
      s: c.dirs.reduce((m, d) => Math.max(m, d.s.length), 0),
      ...(c.dirs.some((d) => d.g.length) ? { g: 1 } : {}),
      ...(c.kid ? { kid: String(c.kid) } : {}),
      ...(c.osm ? { src: 'osm' } : {}),
    });
  }
  await writeFile(join(dir, 'index.json'), JSON.stringify({ v: 2, ds, generatedAt: new Date().toISOString(), routes: index }));

  // server tables -------------------------------------------------------------
  const byCode = {};
  for (const [id, name] of idToName) byCode[id.toUpperCase()] = name;
  for (const c of list) for (const a of c.aliases) byCode[String(a).toUpperCase()] = c.name;
  const names = list.map((c) => c.name);
  const nameIdx = new Map(names.map((n, i) => [n, i]));
  const t = {};
  for (const idx of trips) for (const [tripId, [routeId]] of Object.entries(idx)) {
    const n = idToName.get(String(routeId));
    if (n != null) t[tripId] = nameIdx.get(n);
  }
  console.log(`${ds}: ${list.length} routes (${index.filter((r) => r.g).length} with geometry), ${Object.keys(t).length} trips`);
  return { codes: { byCode, names }, trips: t };
}

const osm = await load('t568-osm.json').catch(() => null);
const rkl = await buildDataset('rkl', [
  { file: 'rapid-bus-kl.json', kind: (r) => (/^B\d/.test(r.id) ? 'brt' : 'city') },
  { file: 'rapid-bus-mrtfeeder.json', kind: 'feeder' },
], osm ? [osm] : []);
if (osm) for (const a of osm.aliases || []) rkl.codes.byCode[String(a).toUpperCase()] = osm.number; // T5680 / T5681 -> T568, even if the official data gains T568
const rpg = await buildDataset('rpg', [{ file: 'rapid-bus-penang.json', kind: undefined }]);

await mkdir(join(ROOT, 'data'), { recursive: true });
await writeFile(join(ROOT, 'data', 'codes.json'), JSON.stringify({ rkl: rkl.codes, rpg: rpg.codes }));
await writeFile(join(ROOT, 'data', 'trips.json'), JSON.stringify({ rkl: rkl.trips, rpg: rpg.trips }));
await rm(join(OUT, 'index.json'), { force: true });
await rm(join(OUT, 'routes'), { recursive: true, force: true });
await rm(join(OUT, 'lines'), { recursive: true, force: true });
console.log('done.');
