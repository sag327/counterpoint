// Ladder and Staves views for the app. Both draw the retained event history
// (committed events, including the lookahead beyond the presentation cursor,
// so concealed conduction settles before it reaches the playhead) against the
// presented time. Switching views never touches the simulation.
import { createLadder } from '../visuals/ladder.js';
import { createStaves } from '../visuals/staves.js';
import { ladderTiers, staveSpecs } from './studies.js';

const DPR_CAP = 2.5;
const LADDER_WINDOW_MS = 1500;

export function createViews(canvas, { reducedMotion = false } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let ladder = null;
  let staves = null;
  let view = 'network';
  let width = 1;
  let height = 1;
  let ratio = 1;
  let reduced = reducedMotion;
  let drag = null;
  let lastEvents = [];

  function configure(scene, world, { lab = false } = {}) {
    const calipers = staves?.getCalipers?.() ?? null;
    const silentSites = world.nodes.filter(node => node.audible === false).map(node => node.id);
    ladder = createLadder({ tiers: ladderTiers(scene, world, { lab }), silentSites, reducedMotion: reduced });
    staves = createStaves({ staves: staveSpecs(scene, world, { lab }), reducedMotion: reduced });
    if (calipers) staves.setCalipers(calipers.a, calipers.b);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextRatio = Math.min(DPR_CAP, Math.max(1, globalThis.devicePixelRatio || 1));
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    ratio = nextRatio;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }

  function draw({ events, presentedMs, lab = false }) {
    if (view === 'network' || !ladder) return null;
    lastEvents = events;
    const args = { events, presentedMs, width, height, dpr: ratio, reducedMotion: reduced };
    if (view === 'ladder') return ladder.draw(ctx, { ...args, windowMs: LADDER_WINDOW_MS });
    return staves.draw(ctx, { ...args, showSyntheticLabel: lab });
  }

  // Calipers: drag horizontally on the staves. A tap without a drag clears them.
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return event.clientX - rect.left;
  }
  function snapped(x) {
    const t = staves.timeAtX(x);
    return t === null ? null : staves.snapToOnset(lastEvents, t, 10);
  }
  canvas.addEventListener('pointerdown', event => {
    if (view !== 'staves' || !staves || !event.isPrimary) return;
    const a = snapped(point(event));
    if (a === null) return;
    drag = { pointerId: event.pointerId, a, x: point(event), moved: false };
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    if (drag?.pointerId !== event.pointerId) return;
    if (Math.abs(point(event) - drag.x) > 4) drag.moved = true;
    if (!drag.moved) return;
    const b = staves.timeAtX(point(event));
    if (b !== null) staves.setCalipers(drag.a, b);
  });
  const finish = event => {
    if (drag?.pointerId !== event.pointerId) return;
    if (drag.moved) {
      const b = snapped(point(event));
      if (b !== null && Math.abs(b - drag.a) > 0) staves.setCalipers(drag.a, b);
    } else {
      staves.clearCalipers();
    }
    drag = null;
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', () => { drag = null; });

  return {
    configure,
    resize,
    draw,
    get view() { return view; },
    set view(next) { view = next; },
    get staves() { return staves; },
    get ladder() { return ladder; },
    calipers: () => staves?.readout() ?? null,
    setCalipers: (a, b) => staves?.setCalipers(a, b),
    setReducedMotion(value) {
      reduced = value;
      ladder?.setReducedMotion?.(value);
      staves?.setReducedMotion(value);
    },
  };
}
