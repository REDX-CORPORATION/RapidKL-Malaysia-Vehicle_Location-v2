# Credits

**jomnaik** is built by **Red-X Corporation (jitu)**.

## Data
- **Live bus positions**: Prasarana Malaysia Berhad, via (1) the public myRapid bus kiosk feed and (2) the official
  [GTFS Realtime vehicle positions](https://developer.data.gov.my) on data.gov.my.
- **Routes, stops and road shapes**: Prasarana GTFS Static, published on [data.gov.my](https://data.gov.my) under
  [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). The app compiles, renames and simplifies this data
  (`scripts/build-data.mjs`, `lib/gtfs-compile.js`); it is not the original feed.
- The compile pipeline follows [mohdsyahid/rapidkl-malaysia](https://github.com/mohdsyahid/rapidkl-malaysia) (MIT, `licenses/reference-project-MIT.txt`).
- **T568 fallback geometry** (kept in `data-src/t568-osm.json`, used only if the official feed lacks the route): © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL.

## Map
- Map data and tiles © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).
- Fallback road tracing (only for a route with no official shape): [OSRM](https://project-osrm.org) over OpenStreetMap data.
- Map engine: [Leaflet](https://leafletjs.com) 1.9.4 (BSD-2-Clause), `public/vendor/leaflet/LICENSE.txt`.

## Code and fonts
- GTFS Realtime protobuf bindings (`lib/vendor/gtfs-realtime.js`): © Google, MobilityData, Apache-2.0 (`licenses/GTFS-bindings-Apache-2.0.txt`). Decoded with [protobufjs](https://github.com/protobufjs/protobuf.js).
- Fonts (SIL Open Font License 1.1, licences in `public/fonts/`): [Figtree](https://github.com/erikdkennedy/figtree) for text, [Doto](https://github.com/oliverlalan/Doto) for the LED boards.

## Disclaimer
jomnaik is an independent project. It is not affiliated with, or endorsed by, Prasarana Malaysia Berhad, RapidKL, Rapid Penang, Rapid Kuantan or any bus operator.
