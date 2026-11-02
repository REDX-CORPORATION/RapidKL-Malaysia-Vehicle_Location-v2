import { $, h, icon, clear, put } from './dom.js';
import { compareRoutes } from './format.js';
import { fmtDist } from './geo.js';
import { ago } from './time.js';
import { PROVIDERS, VERSION } from './config.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const KIND_LABEL = { city: 'City bus', brt: 'BRT', feeder: 'MRT feeder' };
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '');

function highlight(text, q) {
  const raw = String(text);
  const i = q ? raw.toLowerCase().indexOf(q.trim().toLowerCase()) : -1;
  if (i < 0 || !q.trim()) return raw;
  return [raw.slice(0, i), h('mark', null, raw.slice(i, i + q.trim().length)), raw.slice(i + q.trim().length)];
}

function rank(routes, raw) {
  const q = norm(raw);
  if (!q) return [];
  const lq = raw.trim().toLowerCase();
  const out = [];
  for (const r of routes) {
    const n = norm(r.name);
    let sc = 0;
    if (n === q) sc = 1000;
    else if (n.startsWith(q)) sc = 800 - (n.length - q.length);
    else if (n.includes(q)) sc = 500;
    else if (r.label && r.label.toLowerCase().includes(lq)) sc = 300 + (r.label.toLowerCase().startsWith(lq) ? 50 : 0);
    if (sc) out.push({ r, sc });
  }
  out.sort((a, b) => b.sc - a.sc || compareRoutes(a.r.name, b.r.name));
  return out.slice(0, 60).map((x) => x.r);
}

export function createUI(hd) {
  const el = {
    panel: $('#panel'), grab: $('#grab'), body: $('#body'),
    headHome: $('#head-home'), headRoute: $('#head-route'), routeTitle: $('#route-title'),
    q: $('#q'), qClear: $('#q-clear'), led: $('#led'), ledNo: $('#led-no'), ledTrack: $('#led-track'),
    vHome: $('#v-home'), vRoute: $('#v-route'),
    recent: $('#recent'), recentChips: $('#recent-chips'), results: $('#results'), browse: $('#browse'),
    routeList: $('#route-list'), routeCount: $('#route-count'), kindSeg: $('#kind-seg'), listNote: $('#route-list-note'),
    routeSub: $('#route-sub'), tabBuses: $('#tab-buses'), tabStops: $('#tab-stops'), nBuses: $('#n-buses'), nStops: $('#n-stops'),
    paneBuses: $('#pane-buses'), paneStops: $('#pane-stops'), busList: $('#bus-list'), busEmpty: $('#bus-empty'),
    nearYou: $('#near-you'), dirSeg: $('#dir-seg'), stopList: $('#stop-list'), stopsNote: $('#stops-note'),
    status: $('#status'), statusText: $('#status-text'), toast: $('#toast'),
    regionBtn: $('#region-btn'), regionName: $('#region-name'), regionMenu: $('#region-menu'),
    styleBtn: $('#style-btn'), styleMenu: $('#style-menu'), about: $('#about'),
  };
  $('#app-version').textContent = VERSION;

  const S = { routes: [], inRoute: false, focused: false, q: '', matches: [], active: -1, kind: 'all', tab: 'buses', live: new Map(), liveSig: '' };
  const liveTags = new Set();

  // ───────────── LED board ─────────────
  let ledText = null, ledSource = '';
  function setLed({ no, text, label, off = false, wide = false }) {
    el.ledNo.textContent = no;
    el.led.classList.toggle('wide', wide); // long names: no number block, the whole sign scrolls
    el.led.classList.toggle('off', off);
    el.led.setAttribute('aria-label', label || '');
    setLedText(text);
  }
  function setLedText(text) {
    const t = String(text || '').toUpperCase();
    if (t === ledText) return;
    ledText = t; ledSource = t;
    layoutLed();
  }
  function layoutLed() {
    const t = ledSource;
    el.led.classList.remove('scroll');
    el.ledTrack.textContent = t;
    if (reduceMotion.matches) return;
    requestAnimationFrame(() => {
      const win = el.ledTrack.parentElement;
      if (win.clientWidth > 0 && el.ledTrack.scrollWidth > win.clientWidth + 2) {
        const unit = t + '\u2003\u2003\u2003';
        el.ledTrack.textContent = unit + unit;
        el.led.style.setProperty('--dur', Math.max(9, t.length * 0.55) + 's');
        el.led.classList.add('scroll');
      }
    });
  }
  addEventListener('resize', () => { if (ledSource) layoutLed(); });
  document.fonts?.ready.then(() => { if (ledSource) layoutLed(); });

  // ───────────── view switching ─────────────
  function updateView() {
    const searching = !!S.q || (S.focused && S.inRoute);
    const showHome = !S.inRoute || searching;
    el.vHome.hidden = !showHome;
    el.vRoute.hidden = showHome;
    el.headHome.hidden = S.inRoute;
    el.headRoute.hidden = !S.inRoute;
    el.results.hidden = !S.q;
    el.recent.hidden = !!S.q || !el.recentChips.childElementCount;
    el.browse.hidden = !!S.q;
    el.qClear.hidden = !S.q;
    el.q.setAttribute('aria-expanded', String(!!S.q && S.matches.length > 0));
    el.body.scrollTop = 0;
  }

  function setMode(inRoute) { S.inRoute = inRoute; S.q = ''; el.q.value = ''; S.matches = []; updateView(); }

  // ───────────── route rows / lists ─────────────
  function chip(name, cls = '') {
    return h('span', { class: ('rt ' + cls + (String(name).length > 5 ? ' long' : '')).trim() }, name);
  }
  function liveTag(name) {
    const el = h('span', { class: 'live-tag' });
    const n = S.live.get(name) || 0;
    el.hidden = !n;
    el.textContent = n + ' live';
    liveTags.add({ el, name });
    return el;
  }
  function routeRow(r, q = '', idx = -1) {
    const title = r.label || `Route ${r.name}`;
    const sub = [KIND_LABEL[r.kind], r.s ? `${r.s} stops` : null].filter(Boolean).join(' · ');
    const row = h('button', { class: 'row', type: 'button', role: idx >= 0 ? 'option' : null, id: idx >= 0 ? 'opt-' + idx : null, 'aria-selected': idx >= 0 ? 'false' : null, tabindex: idx >= 0 ? '-1' : null },
      chip(r.name),
      h('span', null, h('span', { class: 't' }, highlight(title, q)), h('span', { class: 's' }, liveTag(r.name), sub)));
    row.addEventListener('mousedown', (e) => e.preventDefault()); // keep input focus until click lands
    row.addEventListener('click', () => pick(r));
    return row;
  }
  function busRow(b, q, idx) {
    const row = h('button', { class: 'row veh', type: 'button', role: 'option', id: 'opt-' + idx, 'aria-selected': 'false', tabindex: '-1' },
      chip(b.route || '?'),
      h('span', null, h('span', { class: 't' }, 'Bus ', highlight(b.label || b.id, q)), h('span', { class: 's' }, `Route ${b.route || '?'} · live now · tap to track`)));
    row.addEventListener('mousedown', (e) => e.preventDefault());
    row.addEventListener('click', () => choose({ type: 'bus', b }));
    return row;
  }

  /** Called every poll with { routeName -> live bus count }. Cheap: only touches the small count labels. */
  function setLiveCounts(map) {
    S.live = map;
    for (const t of [...liveTags]) {
      if (!t.el.isConnected) { liveTags.delete(t); continue; }
      const n = map.get(t.name) || 0;
      t.el.hidden = !n;
      t.el.textContent = n + ' live';
    }
    const sig = [...map.keys()].sort().join('|');
    if (sig !== S.liveSig) { S.liveSig = sig; if (S.routes.length) setRoutes(S.routes, { note: S.note }); }
  }

  function setRoutes(routes, { note } = {}) {
    S.routes = routes;
    S.note = note;
    const kinds = [...new Set(routes.map((r) => r.kind).filter(Boolean))];
    const hasLive = S.live.size > 0;
    if (kinds.length > 1 || hasLive) {
      clear(el.kindSeg).hidden = false;
      const opts = [['all', 'All'], ...(hasLive ? [['live', 'Live']] : []), ...kinds.map((k) => [k, k === 'feeder' ? 'Feeder' : k === 'brt' ? 'BRT' : 'City'])];
      if (!opts.some(([k]) => k === S.kind)) S.kind = 'all';
      for (const [k, label] of opts) {
        el.kindSeg.append(h('button', { type: 'button', 'aria-pressed': String(S.kind === k), onclick: () => { S.kind = k; setRoutes(S.routes, { note }); } }, label));
      }
    } else { el.kindSeg.hidden = true; S.kind = 'all'; }
    const shown = S.kind === 'all' ? routes : S.kind === 'live' ? routes.filter((r) => S.live.get(r.name) > 0) : routes.filter((r) => r.kind === S.kind);
    el.routeCount.textContent = shown.length;
    const frag = document.createDocumentFragment();
    for (const r of shown) frag.append(routeRow(r));
    clear(el.routeList).append(frag);
    el.listNote.hidden = !note;
    el.listNote.textContent = note || '';
    if (S.q) renderResults();
  }

  function setRoutesLoading() {
    el.routeCount.textContent = '';
    clear(el.routeList).append(h('p', { class: 'note' }, 'Loading routes…'));
    el.kindSeg.hidden = true;
  }

  function renderRecent(items) {
    clear(el.recentChips);
    for (const r of items) {
      const b = h('button', { type: 'button', 'aria-label': 'Route ' + r.name }, chip(r.name));
      b.addEventListener('click', () => pick(r));
      el.recentChips.append(b);
    }
    updateView();
  }

  // ───────────── search (combobox) ─────────────
  function renderResults() {
    const routes = rank(S.routes, S.q).map((r) => ({ type: 'route', r }));
    const vq = norm(S.q);
    const buses = vq.length >= 3 && hd.findBuses ? hd.findBuses(vq).map((b) => ({ type: 'bus', b })) : [];
    S.matches = [...routes, ...buses];
    S.active = S.matches.length ? 0 : -1;
    clear(el.results);
    if (!S.matches.length) {
      el.results.append(h('li', { role: 'presentation', class: 'empty' },
        h('span', { class: 'badge' }, icon('bus')),
        h('strong', null, `No route or bus matches “${S.q.trim()}”`),
        h('span', null, 'Check the number on the front of the bus. Press Enter to look it up anyway; new routes can take a moment to appear.')));
    } else {
      let i = 0;
      routes.forEach((m) => el.results.append(h('li', { role: 'presentation' }, routeRow(m.r, S.q, i++))));
      if (buses.length) {
        el.results.append(h('li', { role: 'presentation', class: 'list-label' }, 'Vehicles'));
        buses.forEach((m) => el.results.append(h('li', { role: 'presentation' }, busRow(m.b, S.q, i++))));
      }
      markActive();
    }
    el.q.setAttribute('aria-expanded', String(S.matches.length > 0));
  }
  function markActive() {
    el.results.querySelectorAll('[role=option]').forEach((o, i) => {
      const on = i === S.active;
      o.setAttribute('aria-selected', String(on));
      o.classList.toggle('active', on);
      if (on) { el.q.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); }
    });
    if (S.active < 0) el.q.removeAttribute('aria-activedescendant');
  }
  function choose(item) {
    S.q = ''; el.q.value = ''; S.matches = [];
    el.q.blur(); S.focused = false;
    updateView();
    if (item.type === 'bus') hd.onPickBus(item.b); else hd.onPick(item.r || item);
  }
  const pick = (r) => choose({ type: 'route', r });

  el.q.addEventListener('input', () => {
    S.q = el.q.value.trim() ? el.q.value : '';
    if (S.q) renderResults();
    updateView();
  });
  el.q.addEventListener('focus', () => { S.focused = true; updateView(); hd.onSearchFocus && hd.onSearchFocus(); });
  el.q.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement === el.q) return;
    S.focused = false; updateView(); hd.onSearchBlur && hd.onSearchBlur(!!S.q);
  }, 160));
  el.q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && S.matches.length) { e.preventDefault(); S.active = (S.active + 1) % S.matches.length; markActive(); }
    else if (e.key === 'ArrowUp' && S.matches.length) { e.preventDefault(); S.active = (S.active - 1 + S.matches.length) % S.matches.length; markActive(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (S.matches[S.active]) choose(S.matches[S.active]);
      else if (/^[\w .()&-]{1,40}$/.test(S.q.trim())) pick({ name: S.q.trim().toUpperCase(), adhoc: true });
    } else if (e.key === 'Escape') { el.q.value = ''; S.q = ''; el.q.blur(); updateView(); }
  });
  el.qClear.addEventListener('click', () => { el.q.value = ''; S.q = ''; updateView(); el.q.focus(); });

  // ───────────── route view ─────────────
  function setRouteHeader(r, { dest, buses, stopCount }) {
    el.routeTitle.textContent = `Route ${r.name}`;
    const parts = [KIND_LABEL[r.kind], stopCount ? `${stopCount} stops` : null].filter(Boolean).join(' · ');
    put(clear(el.routeSub), r.label ? r.label : `Route ${r.name}`, parts ? h('span', { class: 'dim' }, '  ·  ' + parts) : null);
    const wide = String(r.name).length > 6;
    const status = dest || (buses == null ? 'LOOKING FOR BUSES' : buses === 0 ? 'NO BUSES RIGHT NOW' : `${buses} ${buses === 1 ? 'BUS' : 'BUSES'} LIVE`);
    setLed({
      no: r.name, text: wide ? `${r.name}  -  ${status}` : status, wide,
      label: `Route ${r.name}${dest ? ' to ' + dest : ''}`, off: buses === 0,
    });
  }
  function setCounts({ buses, stops }) {
    if (buses != null) el.nBuses.textContent = buses;
    if (stops != null) el.nStops.textContent = stops;
  }
  function setTab(t) {
    S.tab = t;
    for (const [name, btn, pane] of [['buses', el.tabBuses, el.paneBuses], ['stops', el.tabStops, el.paneStops]]) {
      btn.setAttribute('aria-selected', String(t === name));
      btn.tabIndex = t === name ? 0 : -1;
      pane.hidden = t !== name;
    }
    hd.onTab && hd.onTab(t);
  }
  el.tabBuses.addEventListener('click', () => setTab('buses'));
  el.tabStops.addEventListener('click', () => setTab('stops'));
  [el.tabBuses, el.tabStops].forEach((b) => b.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const t = S.tab === 'buses' ? 'stops' : 'buses'; setTab(t); (t === 'buses' ? el.tabBuses : el.tabStops).focus(); }
  }));

  // — buses —
  const busRows = new Map();
  let busOrder = '';
  function buildBusRow(b) {
    const badge = h('span', { class: 'badge-bus' }, icon('bus'));
    const plate = h('span', { class: 'plate' });
    const sub = h('span', { class: 'sub' });
    const when = h('span', { class: 'when' });
    const row = h('button', { class: 'bus-row', type: 'button' }, badge, h('span', { style: 'min-width:0;display:grid' }, plate, sub), when);
    row.addEventListener('click', () => hd.onBusPick(b.id));
    return { row, badge, plate, sub, when };
  }
  function renderBuses(list, { selectedId, following }) {
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    const ids = sorted.map((b) => b.id).join('|');
    const seen = new Set();
    for (const b of sorted) {
      seen.add(b.id);
      let r = busRows.get(b.id);
      if (!r) { r = buildBusRow(b); busRows.set(b.id, r); }
      r.badge.className = 'badge-bus' + (b.stale ? ' is-stale' : !b.moving ? ' is-stopped' : '');
      put(clear(r.plate), b.label || b.id, b.acc ? h('span', { class: 'tag', title: 'Wheelchair accessible' }, 'Accessible') : null);
      const lost = b.age != null && b.age > 600;
      const status = lost ? 'Signal lost' : b.moving ? `Moving · ${Math.round(b.speed)} km/h` : 'Stopped';
      r.sub.textContent = status + (b.near && !lost ? ` · near ${b.near.stop.name}` : '');
      r.sub.classList.toggle('warn', lost);
      clear(r.when);
      if (following === b.id) r.when.append(h('b', null, 'Following'));
      r.when.append(b.age != null ? ago(b.age) : '');
      if (b.id === selectedId) r.row.setAttribute('aria-current', 'true'); else r.row.removeAttribute('aria-current');
    }
    for (const [id, r] of busRows) if (!seen.has(id)) { r.row.remove(); busRows.delete(id); }
    if (ids !== busOrder) {
      busOrder = ids;
      const frag = document.createDocumentFragment();
      sorted.forEach((b) => frag.append(busRows.get(b.id).row));
      el.busList.append(frag);
    }
    setCounts({ buses: sorted.length });
  }
  function clearBuses() { busRows.clear(); busOrder = ''; clear(el.busList); }
  function showBusEmpty(kind, route, kioskUrl) {
    el.busEmpty.hidden = !kind;
    if (!kind) return;
    clear(el.busEmpty);
    const msgs = {
      loading: ['Looking for buses…', 'Checking live positions for route ' + route + '.'],
      none: [`No ${route} buses are broadcasting right now`, 'Buses only appear while they’re on a trip. It may be outside service hours, or the bus is between trips. Try again in a few minutes.'],
      error: ['Can’t reach live data', 'We’ll keep retrying. Meanwhile, the stops tab still works.'],
    };
    const [t, s] = msgs[kind];
    put(el.busEmpty, h('span', { class: 'badge' }, icon('bus')), h('strong', null, t), h('span', null, s),
      kind === 'none' ? h('button', { type: 'button', class: 'ghost', onclick: () => { el.q.focus(); } }, 'Try another route') : null,
      kind === 'none' && kioskUrl ? h('a', { class: 'btn-link', href: kioskUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Check this route on the myRapid kiosk ↗') : null);
  }

  // — stops —
  const pipHosts = new Map(); // key -> {host, sig}
  let stopRows = new Map();
  function renderStops(dirs, activeDir, { note } = {}) {
    clear(el.stopList); pipHosts.clear(); stopRows.clear();
    el.dirSeg.hidden = dirs.length < 2;
    if (dirs.length > 1) {
      clear(el.dirSeg);
      dirs.forEach((d, i) => el.dirSeg.append(h('button', { type: 'button', 'aria-pressed': String(i === activeDir), onclick: () => hd.onDir(i) }, d.label)));
    }
    const d = dirs[activeDir];
    if (!d) { baseNote = note || 'Stop list isn’t available for this route yet.'; applyStopsNote(); return; }
    d.stops.forEach((s, i) => {
      const host = h('span', { class: 'pips' });
      const text = h('span', null, h('span', { class: 'nm' }, s.name), s.code ? h('span', { class: 'cd' }, '  ' + s.code) : null);
      const btn = h('button', { type: 'button' }, text, host);
      btn.addEventListener('click', () => hd.onStopPick(s));
      const li = h('li', { class: 'stop' + (i === 0 || i === d.stops.length - 1 ? ' end' : '') }, btn);
      el.stopList.append(li);
      pipHosts.set(s.key, { host, sig: '' });
      stopRows.set(s.key, li);
    });
    baseNote = note || ''; applyStopsNote();
  }
  function updatePips(byKey) {
    for (const [key, p] of pipHosts) {
      const list = byKey.get(key) || [];
      const sig = list.map((b) => b.id + (b.stale ? 's' : '')).join(',');
      if (sig === p.sig) continue;
      p.sig = sig;
      clear(p.host);
      if (!list.length) continue;
      const stale = list.every((b) => b.stale);
      p.host.append(h('span', { class: 'pip' + (stale ? ' is-stale' : ''), title: list.map((b) => b.id).join(', ') }, icon('bus'), list.length > 1 ? String(list.length) : null));
    }
  }
  function setNearYou(info) {
    stopRows.forEach((li) => li.classList.remove('near-me'));
    if (!info) { el.nearYou.hidden = true; return; }
    stopRows.get(info.stop.key)?.classList.add('near-me');
    clear(el.nearYou).append(icon('person'),
      h('span', null, 'Closest stop to you: ', h('b', null, info.stop.name), ` · ${fmtDist(info.dist)}`),
      h('button', { type: 'button', onclick: () => hd.onStopPick(info.stop) }, 'Show'));
    el.nearYou.hidden = false;
  }
  function setLineNote(t) { S.lineNote = t || ''; applyStopsNote(); }
  let baseNote = '';
  function applyStopsNote() { el.stopsNote.textContent = [baseNote, S.lineNote].filter(Boolean).join(' '); }
  function scrollToStop(key) { stopRows.get(key)?.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' }); }

  // ───────────── status / toast ─────────────
  function setStatus(state, text) {
    el.status.dataset.state = state;
    if (el.statusText.textContent !== text) el.statusText.textContent = text;
  }
  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg; el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3200);
  }

  // ───────────── menus & dialog ─────────────
  function popMenu(btn, menu, build) {
    const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    const open = () => { build(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); (menu.querySelector('[aria-checked="true"],[aria-selected="true"]') || menu.querySelector('button'))?.focus(); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) { hd.onMenuOpen && hd.onMenuOpen(); open(); } else close(); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) close(); });
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); btn.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...menu.querySelectorAll('button')];
        const i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    });
    return close;
  }
  let region = 'RKL';
  const closeRegion = popMenu(el.regionBtn, el.regionMenu, () => {
    clear(el.regionMenu);
    for (const [code, p] of Object.entries(PROVIDERS)) {
      el.regionMenu.append(h('button', { type: 'button', role: 'option', 'aria-selected': String(code === region), onclick: () => { closeRegion(); hd.onRegion(code); } },
        icon('check'), h('span', null, p.name, h('span', { class: 'sub' }, p.operator))));
    }
  });
  function setRegion(code) { region = code; el.regionName.textContent = PROVIDERS[code].name; }

  let styleKey = 'auto';
  const STYLES = [['auto', 'Automatic', 'Follows your device'], ['light', 'Light', 'OpenStreetMap standard'], ['dark', 'Dark', 'OpenStreetMap, dimmed']];
  const closeStyle = popMenu(el.styleBtn, el.styleMenu, () => {
    clear(el.styleMenu);
    for (const [k, label, sub] of STYLES) {
      el.styleMenu.append(h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(k === styleKey), onclick: () => { closeStyle(); hd.onStyle(k); } },
        icon('check'), h('span', null, label, h('span', { class: 'sub' }, sub))));
    }
  });
  function setStyleKey(k) { styleKey = k; }

  function openAbout() { el.about.showModal(); }
  $('#about-close').addEventListener('click', () => el.about.close());
  el.about.addEventListener('click', (e) => { if (e.target === el.about) el.about.close(); });

  // static wiring
  $('#about-btn').addEventListener('click', openAbout);
  $('#credit-btn').addEventListener('click', openAbout);
  $('#back-btn').addEventListener('click', () => hd.onBack());
  $('#share-btn').addEventListener('click', () => hd.onShare());
  $('#locate-btn').addEventListener('click', () => hd.onLocate());
  $('#zoom-in').addEventListener('click', () => hd.onZoom(1));
  $('#zoom-out').addEventListener('click', () => hd.onZoom(-1));
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); el.q.focus(); }
  });

  return {
    el, setRoutes, setLiveCounts, setRoutesLoading, renderRecent, setMode, setLed, setLedText, setRouteHeader, setCounts, setTab,
    renderBuses, clearBuses, showBusEmpty, renderStops, updatePips, setNearYou, scrollToStop,
    setLineNote, setStatus, toast, setRegion, setStyleKey, closeRegion, focusSearch: () => el.q.focus(),
    get tab() { return S.tab; }, get inRoute() { return S.inRoute; },
  };
}
