#!/usr/bin/env node
// Downloads fresh Prasarana GTFS Static from data.gov.my (CC BY 4.0) into data-src/.
// Then `npm run data` compiles it for the app. data.gov.my allows 4 requests/minute: three feeds fit.
// (t568-osm.json is a hand-kept OpenStreetMap fallback and is not touched.)
const fs = require('node:fs');
const path = require('node:path');
const { compile } = require('../lib/gtfs-compile');

const CATEGORIES = ['rapid-bus-kl', 'rapid-bus-mrtfeeder', 'rapid-bus-penang'];
(async () => {
  for (const c of CATEGORIES) {
    console.log('Refreshing', c);
    const r = await fetch('https://api.data.gov.my/gtfs-static/prasarana?category=' + c, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'jomnaik/2.2' } });
    if (!r.ok) throw new Error('Static feed ' + c + ': HTTP ' + r.status);
    const data = compile(Buffer.from(await r.arrayBuffer()), c);
    if (!data.routes.length) throw new Error('Empty route feed: ' + c);
    fs.writeFileSync(path.join(__dirname, '..', 'data-src', c + '.json'), JSON.stringify(data));
    console.log(' ', data.routes.length, 'routes saved');
  }
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
