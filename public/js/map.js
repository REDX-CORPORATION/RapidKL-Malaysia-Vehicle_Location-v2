import { TILES } from './config.js';
import { bearing, haversine } from './geo.js';
import { h, icon } from './dom.js';
import { ago } from './time.js';

const L = window.L;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/**
 * Everything that touches Leaflet lives here. main.js only talks to this controller.
 *  - getInsets(): {top,right,bottom,left} of map area hidden behind the panel / sheet
 */
export function createMap(el, { getInsets, onBusTap, onStopTap, onTrackRoute, onFollowEnd }) {
  const map = L.map(el, {
    zoomControl: false, attributionControl: false, preferCanvas: true,
    zoomSnap: 0.5, zoomDelta: 1, minZoom: 7, maxZoom: 19,
    maxBounds: [[-0.5, 98], [8.5, 106]], maxBoundsViscosity: 0.6,
    center: [3.139, 101.687], zoom: 11,
  });

  const attribution = L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);
  attribution.addAttribution('Built by Red-X Corporation (jitu)');

  // ── palette (vector layers can't read CSS variables, so mirror them) ──
  let pal = {};
  function refreshPalette() {
    pal = {
      route: cssVar('--route'), casing: cssVar('--casing'), stopFill: cssVar('--stop-fill'),
      dotStroke: cssVar('--dot-stroke'), live: cssVar('--live'), trail: cssVar('--trail'),
    };
  }
  refreshPalette();

  // ── basemap ──
  let tile = null, tileKey = null;
  function setBase(key) {
    if (!TILES[key] || key === tileKey) return;
    if (tile) { map.removeLayer(tile); attribution.removeAttribution(TILES[tileKey].attribution); }
    const t = TILES[key];
    tile = L.tileLayer(t.url, { subdomains: t.subdomains || 'abc', maxZoom: 19, keepBuffer: 3 }).addTo(map);
    attribution.addAttribution(t.attribution);
    tileKey = key;
  }

  // ── layers ──
  const netLayer = L.layerGroup().addTo(map);
  const routeLayer = L.layerGroup().addTo(map);
  const trailLayer = L.layerGroup().addTo(map);
  const busLayer = L.layerGroup().addTo(map);
  const focusLayer = L.layerGroup().addTo(map);
  const meLayer = L.layerGroup().addTo(map);

  // ── camera helpers (aware of the panel covering part of the map) ──
  const insets = () => ({ top: 70, right: 12, bottom: 12, left: 12, ...(getInsets ? getInsets() : {}) });

  function fit(bounds, { maxZoom = 17 } = {}) {
    if (!bounds || !bounds.isValid()) return;
    const i = insets();
    map.fitBounds(bounds, {
      paddingTopLeft: [i.left + 24, i.top + 14], paddingBottomRight: [i.right + 24, i.bottom + 14],
      maxZoom, animate: !reduceMotion.matches,
    });
  }

  function goTo(latlng, zoom, { animate = true } = {}) {
    const z = zoom == null ? map.getZoom() : zoom;
    const i = insets();
    const off = L.point((i.left - i.right) / 2, (i.top - i.bottom) / 2);
    const center = map.unproject(map.project(L.latLng(latlng), z).subtract(off), z);
    if (animate && !reduceMotion.matches) map.flyTo(center, z, { duration: 0.85 });
    else map.setView(center, z, { animate: false });
  }

  // ── network view: every live bus as a dot ──
  const dots = new Map();
  const dotStyle = (b) => ({
    fillColor: b.stale ? '#a3acbf' : pal.live,
    fillOpacity: b.stale ? 0.9 : b.moving ? 1 : 0.55,
    color: pal.dotStroke, weight: 1.3,
  });
  const dotRadius = () => (map.getZoom() >= 15 ? 7 : map.getZoom() >= 13 ? 5.5 : 4.3);

  function setNetwork(list) {
    const seen = new Set();
    const r = dotRadius();
    for (const b of list) {
      seen.add(b.id);
      const key = (b.stale ? 's' : b.moving ? 'm' : 'p') + pal.live + pal.dotStroke;
      let m = dots.get(b.id);
      if (!m) {
        m = L.circleMarker([b.lat, b.lng], { radius: r, ...dotStyle(b), bubblingMouseEvents: false });
        m.on('click', () => showNetPopup(m._bus, m.getLatLng()));
        m.addTo(netLayer);
        dots.set(b.id, m);
      } else {
        m.setLatLng([b.lat, b.lng]);
        if (m._k !== key) m.setStyle(dotStyle(b));
      }
      m._k = key;
      m._bus = b;
    }
    for (const [id, m] of dots) if (!seen.has(id)) { netLayer.removeLayer(m); dots.delete(id); }
  }
  function clearNetwork() { netLayer.clearLayers(); dots.clear(); map.closePopup(); }

  function showNetPopup(b, latlng) {
    const speed = b.speed != null && b.speed >= 3 ? `${Math.round(b.speed)} km/h` : 'Not moving';
    const when = b.age != null ? ` · ${ago(b.age)}` : '';
    const node = h('div', null,
      h('div', { class: 'pop-title' }, h('span', { class: 'rt sm' + (String(b.route).length > 5 ? ' long' : '') }, b.route || '?'), h('span', null, b.id)),
      h('div', { class: 'pop-sub' }, speed + when),
      b.route ? h('button', { class: 'pop-btn', type: 'button', onclick: () => { map.closePopup(); onTrackRoute && onTrackRoute(b.route); } }, `Track route ${b.route}`) : null,
    );
    L.popup({ closeButton: false, offset: [0, -3], autoPanPaddingTopLeft: [insets().left + 20, 80], autoPanPaddingBottomRight: [20, insets().bottom + 20] })
      .setLatLng(latlng).setContent(node).openOn(map);
  }

  // ── route view: line + stops ──
  let lineLayers = [], stopLayers = [];
  const stopScale = () => (map.getZoom() < 12.5 ? 0.72 : map.getZoom() >= 15 ? 1.3 : 1);
  const stopStyle = (s) => ({
    radius: (s.end ? 7.5 : s.extra ? 3.2 : 4.8) * stopScale(),
    color: pal.route, weight: s.end ? 3.5 : 2.5,
    fillColor: s.end ? pal.route : pal.stopFill, fillOpacity: s.extra ? 0.85 : 1,
  });

  function clearRoute() {
    routeLayer.clearLayers(); lineLayers = []; stopLayers = []; clearFocus();
  }

  function drawLines(lines) {
    lineLayers.forEach(({ l }) => routeLayer.removeLayer(l));
    const casings = lines.map((pts) => L.polyline(pts, { color: pal.casing, weight: 10, opacity: 0.92, lineCap: 'round', lineJoin: 'round', interactive: false }));
    const strokes = lines.map((pts) => L.polyline(pts, { color: pal.route, weight: 5.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }));
    casings.forEach((l) => l.addTo(routeLayer)); strokes.forEach((l) => l.addTo(routeLayer));
    lineLayers = [...casings.map((l) => ({ l, kind: 'casing' })), ...strokes.map((l) => ({ l, kind: 'line' }))];
    // keep stops drawn on top of the line (matters when the line is replaced after the stops exist)
    lineLayers.slice().reverse().forEach(({ l }) => l.bringToBack());
  }
  /** Swap the route line in place (used when a road-traced line replaces the first straight one). */
  function setLines(lines) { drawLines(lines); }

  /** lines: [[ [lat,lng], ... ], ...]  stops: [{name, code, lat, lng, end?, extra?}] */
  function showRoute({ lines, stops }) {
    clearRoute();
    const all = [];
    drawLines(lines);
    lines.forEach((pts) => all.push(...pts));

    // extras first so the real stops draw on top
    [...stops].sort((a, b) => (b.extra ? 1 : 0) - (a.extra ? 1 : 0)).forEach((s) => {
      const m = L.circleMarker([s.lat, s.lng], stopStyle(s)).addTo(routeLayer);
      m._stop = s;
      m.bindTooltip(s.name, { direction: 'top', offset: [0, -6], className: 'stop-tip' + (s.end ? ' term-tip' : ''), permanent: false, sticky: false });
      m.on('click', () => onStopTap && onStopTap(s));
      stopLayers.push(m);
      if (!s.extra) all.push([s.lat, s.lng]);
    });
    return all.length ? L.latLngBounds(all) : null;
  }

  function restyle() {
    refreshPalette();
    lineLayers.forEach(({ l, kind }) => l.setStyle({ color: kind === 'casing' ? pal.casing : pal.route }));
    stopLayers.forEach((m) => m.setStyle(stopStyle(m._stop)));
    for (const e of buses.values()) if (e.trailLine) e.trailLine.setStyle({ color: pal.trail });
    for (const m of dots.values()) m.setStyle(dotStyle(m._bus));
  }

  // ── focus ring / popup on a stop ──
  function clearFocus() { focusLayer.clearLayers(); }
  function focusStop(s) {
    clearFocus();
    L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'focus-ring', html: '<i></i>', iconSize: [30, 30] }), interactive: false, keyboard: false }).addTo(focusLayer);
    const node = h('div', null, h('div', { class: 'pop-title' }, s.name), s.code ? h('div', { class: 'pop-sub' }, 'Stop ' + s.code) : null);
    L.popup({ closeButton: false, offset: [0, -14], autoPan: false }).setLatLng([s.lat, s.lng]).setContent(node).openOn(map);
    goTo([s.lat, s.lng], Math.max(map.getZoom(), 16));
  }

  // ── live buses (selected route): DOM markers that glide between fixes ──
  const buses = new Map(); // id -> { marker, root, rot, anim, hasBearing }
  let selectedId = null, followId = null, followAfter = 0, raf = 0, showTrails = false;

  function makeBus(b) {
    const root = h('div', { class: 'bus' }, h('span', { class: 'bus-arrow' }), h('span', { class: 'bus-disc' }, icon('bus')), h('span', { class: 'bus-tag' }, b.label || b.id));
    const marker = L.marker([b.lat, b.lng], {
      icon: L.divIcon({ className: 'bus-icon', html: root, iconSize: [44, 44], iconAnchor: [22, 22] }),
      keyboard: false, riseOnHover: true,
    });
    marker.on('click', () => onBusTap && onBusTap(b.id));
    marker.addTo(busLayer);
    return { marker, root, rot: 0, anim: null, hasBearing: false, trail: [[b.lat, b.lng]], trailLine: null };
  }

  function paintBus(e, b) {
    const sel = b.id === selectedId;
    e.root.classList.toggle('is-stale', !!b.stale);
    e.root.classList.toggle('is-stopped', !b.moving && !b.stale);
    e.root.classList.toggle('is-sel', sel);
    e.root.classList.toggle('has-dir', e.hasBearing && b.moving);
    e.marker.setZIndexOffset(sel ? 1000 : b.stale ? -200 : 0);
  }

  function updateBuses(list) {
    const seen = new Set();
    const now = performance.now();
    for (const b of list) {
      seen.add(b.id);
      let e = buses.get(b.id);
      if (!e) { e = makeBus(b); buses.set(b.id, e); }
      if (b.brg != null && isFinite(b.brg)) { // the feed's own heading beats guessing from movement
        e.rot += ((b.brg - e.rot + 540) % 360) - 180; e.hasBearing = true;
        e.root.style.setProperty('--rot', e.rot.toFixed(0) + 'deg');
      }
      if (e.marker) {
        const from = e.marker.getLatLng();
        const moved = haversine(from.lat, from.lng, b.lat, b.lng);
        if (moved > 12 && !(b.brg != null && isFinite(b.brg))) {
          const target = bearing(from.lat, from.lng, b.lat, b.lng);
          const delta = ((target - e.rot + 540) % 360) - 180; // shortest turn
          e.rot += delta; e.hasBearing = true;
          e.root.style.setProperty('--rot', e.rot.toFixed(0) + 'deg');
        }
        if (moved > 8) { e.trail.push([b.lat, b.lng]); if (e.trail.length > 80) e.trail.shift(); }
        if (moved > 1) {
          if (reduceMotion.matches || moved > 3000) e.marker.setLatLng([b.lat, b.lng]);
          else e.anim = { from, to: L.latLng(b.lat, b.lng), t0: now, dur: 2200 };
        }
      }
      paintBus(e, b);
      drawTrail(e, b);
    }
    for (const [id, e] of buses) if (!seen.has(id)) { busLayer.removeLayer(e.marker); if (e.trailLine) trailLayer.removeLayer(e.trailLine); buses.delete(id); if (followId === id) stopFollow(); }
    if (!raf) raf = requestAnimationFrame(step);
  }

  /** A short breadcrumb behind each bus. Shown only when a route has no road-accurate line, so the path still reads. */
  function drawTrail(e, b) {
    const on = showTrails && !b.stale && e.trail.length >= 3;
    if (!on) { if (e.trailLine) { trailLayer.removeLayer(e.trailLine); e.trailLine = null; } return; }
    if (!e.trailLine) e.trailLine = L.polyline(e.trail, { color: pal.trail, weight: 3.5, opacity: 0.85, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(trailLayer);
    else e.trailLine.setLatLngs(e.trail);
  }
  function setTrails(on) {
    showTrails = !!on;
    for (const e of buses.values()) drawTrail(e, { stale: false });
  }

  function step(now) {
    let active = false;
    for (const [id, e] of buses) {
      const a = e.anim;
      if (!a) continue;
      const p = Math.min(1, (now - a.t0) / a.dur);
      const k = 1 - Math.pow(1 - p, 3);
      const pos = [a.from.lat + (a.to.lat - a.from.lat) * k, a.from.lng + (a.to.lng - a.from.lng) * k];
      e.marker.setLatLng(pos);
      if (p >= 1) e.anim = null; else active = true;
      if (followId === id && now > followAfter) goTo(pos, undefined, { animate: false });
    }
    raf = active ? requestAnimationFrame(step) : 0;
  }

  function clearBuses() {
    busLayer.clearLayers(); trailLayer.clearLayers(); buses.clear(); selectedId = null; stopFollow();
  }
  function setSelected(id) {
    selectedId = id;
    for (const [bid, e] of buses) { e.root.classList.toggle('is-sel', bid === id); e.marker.setZIndexOffset(bid === id ? 1000 : 0); }
  }
  function flyToBus(id, { follow = true } = {}) {
    const e = buses.get(id);
    if (!e) return;
    setSelected(id);
    goTo(e.marker.getLatLng(), Math.max(map.getZoom(), 16));
    if (follow) { followId = id; followAfter = performance.now() + 1100; }
  }
  function stopFollow() { if (followId != null) { followId = null; onFollowEnd && onFollowEnd(); } }
  const isFollowing = () => followId;
  map.on('dragstart', () => { if (followId != null) stopFollow(); });

  // ── you are here ──
  function showMe(lat, lng, acc) {
    meLayer.clearLayers();
    L.circle([lat, lng], { radius: Math.min(acc || 60, 500), weight: 1, color: '#1a73e8', fillColor: '#1a73e8', fillOpacity: 0.12, interactive: false }).addTo(meLayer);
    L.marker([lat, lng], { icon: L.divIcon({ className: 'me-icon', html: '<div class="me"></div>', iconSize: [22, 22] }), interactive: false, keyboard: false, zIndexOffset: -500 }).addTo(meLayer);
  }
  function locate() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(Object.assign(new Error('unsupported'), { code: 0 }));
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        showMe(lat, lng, accuracy);
        resolve({ lat, lng, accuracy });
      }, reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 });
    });
  }

  // ── zoom-dependent tweaks ──
  const container = map.getContainer();
  function onZoom() {
    container.classList.toggle('z-high', map.getZoom() >= 16);
    const r = dotRadius();
    for (const m of dots.values()) m.setRadius(r);
    for (const m of stopLayers) m.setRadius(stopStyle(m._stop).radius);
  }
  map.on('zoomend', onZoom);
  onZoom();

  return {
    map, setBase, restyle, fit, goTo,
    setNetwork, clearNetwork,
    showRoute, setLines, setTrails, clearRoute, focusStop, clearFocus,
    updateBuses, clearBuses, setSelected, flyToBus, stopFollow, isFollowing,
    locate, zoomIn: () => map.zoomIn(), zoomOut: () => map.zoomOut(),
    closePopups: () => map.closePopup(),
  };
}
