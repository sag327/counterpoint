// Map overlay: local activation time per site and link relative to a reference site, over one cycle.
// Ramp: ivory (earliest) through gold and a neutral to cool blue (latest). No rainbow.
// The state is recomputed only when the reference site activates again, so the overlay never flickers.
import { TURN, clamp, mergePalette, memoByEvents, fillCircle, strokeCircle, openRing, sans, serifItalic } from './common.js';

export const RAMP_STOPS = Object.freeze(['#FFF1D1', '#C8A878', '#B9B2A4', '#83A9C8', '#4A6C8E']);
const LUT_SIZE = 64;
const SEGMENTS = 20;

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lut = (() => {
  const rgb = RAMP_STOPS.map(hexToRgb);
  return Array.from({ length: LUT_SIZE }, (_, i) => {
    const pos = (i / (LUT_SIZE - 1)) * (rgb.length - 1);
    const k = Math.min(rgb.length - 2, Math.floor(pos));
    const f = pos - k;
    return `#${rgb[k].map((v, c) => Math.round(v + (rgb[k + 1][c] - v) * f).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  });
})();
// phase in [0, 1) of the cycle -> hex colour
export const rampColor = (phase) => lut[Math.round(clamp(phase) * (LUT_SIZE - 1))];

// Pure derivation. Returns null until the reference site has activated twice by presentedMs.
// latency(n) = time from the reference's previous activation to n's most recent activation, modulo the cycle.
export function deriveCycle(events, { world, referenceNodeId, presentedMs, maxAgeCycles = 2 }) {
  let prev = null; let cur = null;
  const lastAct = new Map();
  for (const e of events) {
    if (e.tMs > presentedMs) break;
    if (e.type !== 'activation') continue;
    lastAct.set(e.nodeId, e);
    if (e.nodeId === referenceNodeId) { prev = cur; cur = e; }
  }
  if (!prev) return null;
  const cycleMs = cur.tMs - prev.tMs;
  const nodes = new Map();
  for (const [id, e] of lastAct) {
    if (e.tMs > cur.tMs || cur.tMs - e.tMs > maxAgeCycles * cycleMs) continue;
    nodes.set(id, { event: e, latencyMs: (((e.tMs - cur.tMs) % cycleMs) + cycleMs) % cycleMs });
  }
  nodes.set(referenceNodeId, { event: cur, latencyMs: 0 });
  const links = [];
  let seam = null;
  for (const link of world.links) {
    const a = nodes.get(link.a); const b = nodes.get(link.b);
    if (!a || !b) continue;
    let from = link.a; let to = link.b; let ta = a.latencyMs; let tb = b.latencyMs;
    let wraps = false;
    if (Math.abs(tb - ta) > cycleMs / 2) { // the wave closes on itself across this link
      wraps = true;
      if (ta < tb) { from = link.b; to = link.a; [ta, tb] = [tb, ta]; }
      tb += cycleMs;
    } else if (tb < ta) { from = link.b; to = link.a; [ta, tb] = [tb, ta]; }
    const entry = { linkId: link.id, from, to, t0: ta, t1: tb, wraps,
      eventIds: [nodes.get(from).event.eventId, nodes.get(to).event.eventId] };
    links.push(entry);
    if (wraps && (!seam || tb - ta > seam.t1 - seam.t0)) seam = entry;
  }
  return { referenceNodeId, cycleMs, startMs: prev.tMs, endMs: cur.tMs, cycleId: cur.eventId, nodes, links, seam };
}

export function createMap({ world, referenceNodeId, silentSites, reducedMotion = false } = {}) {
  const ref = referenceNodeId ?? world.nodes[0].id;
  const silent = new Set(silentSites ?? world.nodes.filter((n) => n.audible === false).map((n) => n.id));
  let reduced = reducedMotion;
  let state = null;
  let cycleChanges = 0;
  const derive = memoByEvents((events, presentedMs) => deriveCycle(events, { world, referenceNodeId: ref, presentedMs }));
  // Sampled link geometry, cached per (cycle, size); bounded to the links of the world.
  let geometryKey = null;
  const samples = new Map();

  function update(events, presentedMs) {
    // Memo key is the presented ms of the latest reference activation: recompute only when it can change.
    const next = derive(events, Math.floor(presentedMs));
    const changed = (next?.cycleId ?? null) !== (state?.cycleId ?? null);
    if (changed) cycleChanges += 1;
    state = next;
    return changed;
  }

  const api = {
    referenceNodeId: ref,
    update,
    get state() { return state; },
    get redraws() { return cycleChanges; },
    setReducedMotion(value) { reduced = value; },
    setReference() { throw new Error('create a new map to change the reference site'); },

    traceMarks() {
      if (!state) return [];
      const marks = [];
      for (const [nodeId, { event, latencyMs }] of state.nodes) {
        marks.push({ id: `mapNode:${nodeId}`, kind: 'mapNode', nodeId, eventIds: [event.eventId], latencyMs });
      }
      for (const l of state.links) {
        marks.push({ id: `mapLink:${l.linkId}`, kind: 'mapLink', linkId: l.linkId, eventIds: l.eventIds, t0: l.t0, t1: l.t1, wraps: l.wraps });
      }
      if (state.seam) marks.push({ id: `seam:${state.seam.linkId}`, kind: 'seam', linkId: state.seam.linkId, eventIds: state.seam.eventIds,
        fraction: (state.cycleMs - state.seam.t0) / (state.seam.t1 - state.seam.t0) });
      return marks;
    },

    // nodePoint(id) -> {x,y}; linkPoint(linkId, u) -> {x,y} with u from link.a to link.b (optional: straight line).
    draw(ctx, { nodePoint, linkPoint, width, height, palette: pal, legend = false, labels = false, alpha = 1, nodeRadius = 3.4, key = '' } = {}) {
      if (!state) return;
      const palette = mergePalette(pal);
      const cycle = state.cycleMs;
      const sampleKey = `${state.cycleId}|${width}x${height}|${key}`;
      if (sampleKey !== geometryKey) {
        samples.clear();
        geometryKey = sampleKey;
      }
      ctx.lineCap = 'round';
      for (const l of state.links) {
        let pts = samples.get(l.linkId);
        if (!pts) {
          const link = world.links.find((x) => x.id === l.linkId);
          const forward = l.from === link.a;
          pts = new Float32Array((SEGMENTS + 1) * 2);
          for (let i = 0; i <= SEGMENTS; i += 1) {
            const u = i / SEGMENTS;
            let p;
            if (linkPoint) p = linkPoint(l.linkId, forward ? u : 1 - u);
            else {
              const a = nodePoint(l.from); const b = nodePoint(l.to);
              p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
            }
            pts[i * 2] = p.x; pts[i * 2 + 1] = p.y;
          }
          samples.set(l.linkId, pts);
        }
        for (let pass = 0; pass < 2; pass += 1) {
          for (let i = 0; i < SEGMENTS; i += 1) {
            const t = l.t0 + (l.t1 - l.t0) * ((i + 0.5) / SEGMENTS);
            ctx.strokeStyle = rampColor((t % cycle) / cycle);
            ctx.globalAlpha = alpha * (pass ? 0.9 : 0.1);
            ctx.lineWidth = pass ? 1.3 : 4.2;
            ctx.beginPath();
            ctx.moveTo(pts[i * 2], pts[i * 2 + 1]);
            ctx.lineTo(pts[i * 2 + 2], pts[i * 2 + 3]);
            ctx.stroke();
          }
        }
        if (l.wraps) { // seam tick where early meets late
          const k = Math.round(((cycle - l.t0) / (l.t1 - l.t0)) * SEGMENTS);
          const j = clamp(k, 1, SEGMENTS - 1);
          const dx = pts[(j + 1) * 2] - pts[(j - 1) * 2]; const dy = pts[(j + 1) * 2 + 1] - pts[(j - 1) * 2 + 1];
          const len = Math.hypot(dx, dy) || 1;
          const x = pts[j * 2]; const y = pts[j * 2 + 1];
          ctx.strokeStyle = palette.text; ctx.globalAlpha = alpha * 0.7; ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(x - (-dy / len) * 6, y - (dx / len) * 6); ctx.lineTo(x + (-dy / len) * 6, y + (dx / len) * 6); ctx.stroke();
          if (labels) {
            ctx.font = serifItalic(12); ctx.fillStyle = palette.text; ctx.globalAlpha = alpha * 0.75; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText('early meets late', x + (dy / len) * 14 + 4, y - (dx / len) * 14);
          }
        }
      }
      for (const [id, { latencyMs }] of state.nodes) {
        const p = nodePoint(id);
        if (!p) continue;
        const color = rampColor(latencyMs / cycle);
        if (silent.has(id)) openRing(ctx, p.x, p.y, nodeRadius, palette.ground, color, alpha);
        else {
          fillCircle(ctx, p.x, p.y, nodeRadius * 3.2, color, alpha * 0.07);
          fillCircle(ctx, p.x, p.y, nodeRadius * 1.7, color, alpha * 0.14);
          fillCircle(ctx, p.x, p.y, nodeRadius, color, alpha);
          fillCircle(ctx, p.x, p.y, nodeRadius * 0.4, '#FFFFFF', alpha * 0.9);
        }
      }
      if (legend) {
        const box = typeof legend === 'object' ? legend : { x: width - 190, y: 26, w: 150 };
        for (let i = 0; i < LUT_SIZE; i += 1) {
          ctx.fillStyle = lut[i]; ctx.globalAlpha = alpha;
          ctx.fillRect(box.x + (box.w * i) / LUT_SIZE, box.y, box.w / LUT_SIZE + 0.6, 3);
        }
        ctx.fillStyle = palette.text2; ctx.font = sans(10); ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left'; ctx.fillText('earliest', box.x, box.y - 6);
        ctx.textAlign = 'right'; ctx.fillText('latest', box.x + box.w, box.y - 6);
        ctx.textAlign = 'center'; ctx.fillText(`one cycle · ${Math.round(cycle)} ms`, box.x + box.w / 2, box.y + 18);
      }
      ctx.globalAlpha = 1;
    },
  };
  return api;
}
export { TURN, strokeCircle };
