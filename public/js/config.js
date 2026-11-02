export const VERSION = '2.2.0';

// ds = which bundled dataset (public/data/<ds>/) describes the network's routes. null = live data only.
export const PROVIDERS = {
  RKL:             { name: 'Klang Valley', operator: 'RapidKL',          center: [3.139, 101.687],   zoom: 11, ds: 'rkl' },
  'RKL-PUTRAJAYA': { name: 'Putrajaya',    operator: 'RapidKL Putrajaya', center: [2.9264, 101.6964], zoom: 13, ds: 'rkl' },
  RPG:             { name: 'Penang',       operator: 'Rapid Penang',      center: [5.39, 100.31],     zoom: 12, ds: 'rpg' },
  RKN:             { name: 'Kuantan',      operator: 'Rapid Kuantan',     center: [3.81, 103.33],     zoom: 12, ds: null },
};

export const POLL_ROUTE_MS = 6000;    // one route: small payload, feels live
export const POLL_NETWORK_MS = 12000; // every bus in the city: bigger payload
export const SIGNAL_STALE_S = 300;    // no GPS update for 5 min -> shown grey
export const MOVING_KMH = 3;

// OpenStreetMap's own tile server. Free, no API key. Please respect the tile usage policy:
// https://operations.osmfoundation.org/policies/tiles/  (fine for a hobby / community project; see README for scaling up)
export const TILES = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: '',
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  },
};

// Waypoints per road-tracing request. MUST match CHUNK in lib/roads.js.
export const LINE_CHUNK = 30;
