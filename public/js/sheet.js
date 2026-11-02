/**
 * Bottom sheet for phones/tablets (< 900px). On desktop the panel is a fixed card and this does nothing.
 * Three snap points: peek (search + LED board), half, full. Drag the handle or header, or tap the handle.
 */
export function createSheet(panel, { grab, dragZones, anchor, onChange }) {
  const desktop = matchMedia('(min-width: 900px)');
  const root = document.documentElement;
  let state = 'peek', vis = 0, drag = null;

  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;bottom:0;left:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
  document.body.append(probe);

  const snapPx = (name) => {
    const full = panel.offsetHeight;
    if (name === 'full') return full;
    const a = anchor();
    const peek = a ? a.getBoundingClientRect().bottom - panel.getBoundingClientRect().top + 14 + probe.offsetHeight : 176;
    if (name === 'half') return Math.max(peek + 120, Math.min(full, Math.round(window.innerHeight * 0.6)));
    return Math.round(peek);
  };

  function apply(px, animate) {
    vis = px;
    panel.classList.toggle('dragging', !animate);
    root.classList.toggle('dragging-sheet', !animate);
    root.style.setProperty('--vis', px + 'px');
  }

  function snap(name, { silent = false } = {}) {
    if (desktop.matches) return;
    state = name;
    panel.dataset.state = name;
    root.dataset.sheet = name;
    apply(snapPx(name), true);
    if (!silent && onChange) onChange(name);
  }

  function nearest(px) {
    const s = { peek: snapPx('peek'), half: snapPx('half'), full: snapPx('full') };
    return Object.keys(s).reduce((a, b) => (Math.abs(s[a] - px) < Math.abs(s[b] - px) ? a : b));
  }

  function onDown(e) {
    if (desktop.matches || (e.target.closest && e.target.closest('button, a, input') && !e.target.closest('#grab'))) return;
    drag = { y: e.clientY, vis, t: performance.now(), moved: false, id: e.pointerId, el: e.currentTarget };
    drag.el.setPointerCapture?.(e.pointerId);
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = drag.y - e.clientY;
    if (Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    apply(Math.max(snapPx('peek') - 20, Math.min(panel.offsetHeight, drag.vis + dy)), false);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (!d.moved) { if (d.el === grab) snap(state === 'peek' ? 'half' : 'peek'); return; }
    const v = (d.y - e.clientY) / Math.max(1, performance.now() - d.t); // px/ms, + = upward
    let target = nearest(vis);
    if (Math.abs(v) > 0.6) { // flick: continue to the next snap point in that direction, from where the finger is
      const pts = [['peek', snapPx('peek')], ['half', snapPx('half')], ['full', snapPx('full')]];
      const next = v > 0 ? pts.find(([, px]) => px > vis + 12) : [...pts].reverse().find(([, px]) => px < vis - 12);
      if (next) target = next[0];
    }
    snap(target);
  }

  for (const z of dragZones) {
    z.addEventListener('pointerdown', onDown);
    z.addEventListener('pointermove', onMove);
    z.addEventListener('pointerup', onUp);
    z.addEventListener('pointercancel', onUp);
  }
  // Keyboard / assistive-tech activation fires click with detail === 0 (pointer clicks are handled in onUp)
  grab.addEventListener('click', (e) => { if (e.detail === 0) snap(state === 'peek' ? 'half' : 'peek'); });
  grab.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); snap(state === 'peek' ? 'half' : 'full'); }
    if (e.key === 'ArrowDown') { e.preventDefault(); snap(state === 'full' ? 'half' : 'peek'); }
  });

  function refresh() {
    if (desktop.matches) { root.style.removeProperty('--vis'); delete root.dataset.sheet; panel.classList.remove('dragging'); return; }
    snap(state, { silent: true });
  }
  desktop.addEventListener('change', refresh);
  addEventListener('resize', refresh);
  addEventListener('orientationchange', refresh);

  return {
    snap, refresh,
    get state() { return state; },
    get visible() { return desktop.matches ? 0 : vis; },
    isDesktop: () => desktop.matches,
  };
}
