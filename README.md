# jomnaik · live bus tracker

**Built by Red-X Corporation (jitu)**

Type a bus number → see where every bus on that route is right now, the route drawn on its **official road shape**, and every stop.
Live **RapidKL** (Klang Valley, Putrajaya), **Rapid Penang** and **Rapid Kuantan** buses on **OpenStreetMap**. No API keys anywhere.

> *Jom naik* = "let's board".

---

## Deploy to Vercel (direct upload, no Git needed)

```bash
npm i -g vercel          # once
cd jomnaik-vercel        # this folder
vercel login             # once
vercel --prod            # uploads the folder and deploys
```

No build step: `public/` is static, `api/*.js` are serverless functions. `vercel.json` sets the Singapore region (`sin1`), security headers,
CSP and caching; `package.json` pins `node 24.x`. `api/buses` and `api/health` are configured for up to 30 s; if your plan rejects that,
lower `maxDuration` in `vercel.json` (a normal request takes 1-3 s).

### Right after deploying, open `/api/health`

It shows which live sources your Vercel region can reach (kiosk, each GTFS-Realtime feed, kiosk route page) and what the live feed really looks like.
Add `?route=T568` (any route) to see the raw feed codes for that route and what they resolve to.

## Why a route's buses can look "missing" (fixed in 2.2)

The live feeds don't use public route numbers. They use **operational codes**, usually the number plus one digit
(`T5680`/`T5681` = route **T568**, `U3000` = **300**, `T7568` = **T756**, `B1000` = **SUNWAY LINE**).
`lib/dataset.js` translates codes to public numbers using the GTFS route ids, aliases, the GTFS trip index and the
"number + trailing digit" rule, and it never drops a bus it can't place (it shows it under a best-guess number).
Plates are unrelated to routes, and the same bus can appear in both feeds under different labels; `lib/live.js` merges those.

## Live sources

| source | notes |
| --- | --- |
| **myRapid kiosk** (Engine.IO polling) | freshest (seconds); undocumented, can change or block without notice |
| **GTFS Realtime** (data.gov.my) | official; updates about every 30 s; limited to **4 requests per minute**, so each feed is cached 45 s and stale data is served on errors |

If one source is down, the status chip says **partial** and the other keeps the map alive.

## Route data and shapes

`data-src/` holds Prasarana GTFS Static compiled to JSON (279 routes, with official road shapes). `npm run data` turns it into
`public/data/<rkl|rpg>/` (stops + shapes, served from the CDN) and `data/` (server lookup tables).

```bash
npm run refresh-data     # downloads fresh GTFS Static from data.gov.my, then rebuilds (needs internet; 3 requests)
npm run data             # rebuild only
npm test                 # unit tests: code matching, merging, kiosk protocol
```

Route lines, in order: **bundled official shape** → the kiosk's shape → a line traced along roads with OSRM (`/api/line`, only for routes with no shape at all) → straight between stops (flagged in the Stops tab). Kuantan has no bundled data, so it shows live buses and builds its route list from them.

## Run locally

```bash
npm install
npm run dev              # http://localhost:4040
```

## What's in the box

```
public/                 static site (CDN)
  js/                   main.js (state), map.js (Leaflet), ui.js, sheet.js, buses.js, api.js ...
  data/rkl, data/rpg    routes index + per-route stops and official shapes
api/
  buses.js              GET /api/buses?provider=RKL&route=T568   (route optional)
  routes.js, shapes.js  kiosk route list / shapes (optional extras, may be blocked)
  line.js               road tracing fallback
  health.js             GET /api/health[?route=T568]
lib/
  live.js               merges all live sources, de-duplicates
  kiosk-live.js         kiosk over Engine.IO polling
  dataset.js            feed code -> public route number
  vendor/gtfs-realtime.js   GTFS-Realtime protobuf bindings (Apache-2.0)
data/                   server lookup tables (generated)   data-src/  source GTFS JSON
scripts/                build-data.mjs, refresh-data.js     test/  unit tests
```

## Features

- **Network view** of every live bus; tap a dot → "Track route". **Search** by bus number, place or vehicle plate; "Live" filter.
- **LED destination board**, a buses tab and a **stops timeline with live bus pips**; buses glide and use the feed's heading.
- Closest stop to you (location only on tap), shareable `/?r=T568` links, light/dark, phone bottom sheet.
- Polling pauses in background tabs and backs off on errors.

## Map tiles: please read

Tiles come from OpenStreetMap's own server: free, no key, but run by volunteers; its
[usage policy](https://operations.osmfoundation.org/policies/tiles/) allows light use, **not heavy or commercial-scale traffic**.
If the site gets popular, change `TILES` in `public/js/config.js` (and `img-src` in `vercel.json`) to a host you pay for or run.

## About the data

The kiosk feed is **unofficial and undocumented**. Keep polling modest (the defaults are) and don't present this as an official Prasarana service.
Attribution for data.gov.my (CC BY 4.0) is in the app (ⓘ) and `CREDITS.md`.

## Credits

See [CREDITS.md](CREDITS.md).
