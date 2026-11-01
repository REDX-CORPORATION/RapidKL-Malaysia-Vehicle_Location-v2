# Credits and third-party notices

**Built by Red-X Corporation (jitu)**

## Original app

JomNaik demo supplied by the project owner. This package replaces the demo interface and undocumented kiosk data adapter with a new interface and GTFS integrations and myRapid kiosk vehicle integration.

## Transit data

Prasarana Malaysia / Malaysia’s Open Data portal, data.gov.my.

- Static data: https://developer.data.gov.my/realtime-api/gtfs-static
- Vehicle positions: https://developer.data.gov.my/realtime-api/gtfs-realtime
- License: Creative Commons Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/

Changes: GTFS CSV records joined into routes and representative ordered stop sequences; shapes converted into latitude/longitude arrays; live protobuf normalized into vehicle markers with km/h speed and stale-reading labels. No endorsement is implied.

## Reference and inspiration

Mohd Syahid — rapidkl-malaysia: https://github.com/mohdsyahid/rapidkl-malaysia

MIT-licensed project demonstrating a static JSON API of joined RapidKL route/stop data. Referenced for the route-data approach. The runtime does not depend on that GitHub service and no generated datasets from it are bundled. Its MIT notice is retained in licenses/reference-project-MIT.txt as acknowledgement.

Prasarana myRapid Bus Kiosk: https://myrapidbus.prasarana.com.my/kiosk

Reference for bus/route tracking workflow and source of live vehicle positions through its Socket.IO feed. Kiosk data remains subject to its operator’s terms; the government GTFS CC BY license is not assumed to apply to it. No official branding or affiliation is claimed; no kiosk frontend code is bundled.

## Maps, fonts and libraries

- © OpenStreetMap contributors. Map data: Open Database License (ODbL). https://www.openstreetmap.org/copyright
- OpenStreetMap public tile usage policy: https://operations.osmfoundation.org/policies/tiles/
- Leaflet 1.9.4, Vladimir Agafonkin and contributors. BSD-2-Clause notice in licenses/Leaflet-BSD-2-Clause.txt.
- Google / MobilityData GTFS Realtime bindings 1.1.1: unmodified generated JavaScript vendored at lib/vendor/gtfs-realtime.js from the npm package gtfs-realtime-bindings. Apache-2.0, full text in licenses/GTFS-bindings-Apache-2.0.txt. https://github.com/MobilityData/gtfs-realtime-bindings
- protobuf.js, adm-zip, csv-parse, Express and their transitive dependencies: respective upstream licenses retained in npm packages; exact versions in package-lock.json.
- DM Sans and Manrope served through Google Fonts, under SIL Open Font License; system font fallback if unavailable.

Saved routes are local to the visitor’s browser. Opt-in geolocation stays in the browser. Map and font providers receive normal web requests.

## T568 map fallback

© OpenStreetMap contributors — https://www.openstreetmap.org/relation/19200400

The separately distributed data/t568-osm.json is derived from the T568 relation’s ordered platform members and road ways, retrieved on 31 October 2026. This derivative dataset is provided under the Open Data Commons Open Database License (ODbL) 1.0: https://opendatacommons.org/licenses/odbl/1-0/ . The original relation and provenance are recorded in the dataset. Other datasets retain their own licenses.
