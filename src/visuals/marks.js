// New Network marks for Study No. 2 (spec "New semantic marks in Network").
// Every mark is derived from events (never invented) and is a pure function of event times.
// The existing renderer calls createNetworkMarks(...).draw(ctx, tMs, events) once per frame.
import {
  TURN, PALETTE, clamp, ease, mergePalette, memoByEvents, fillCircle, strokeCircle, strokeArc,
} from './common.js';
import { indexEvents, classifyTransits } from './trace.js';

export const PHASE_ARC_MS = 200;
export const FUSION_MS = 260;
export const DOUBLE_POTENTIAL_MS = 360;
export const DOUBLE_POTENTIAL_MAX_GAP_MS = 1500;
export const ENTRAINMENT_WINDOW_MS = 20;
export const ENTRAINMENT_MS = 900;

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Ring separation in px for a double potential of the given interval: monotone and bounded (3..14 px).
export const doublePotentialGapPx = (intervalMs) => 3 + 11 * (1 - Math.exp(-Math.max(0, intervalMs) / 200));

// Entrainment report for one finished train, or null when the maneuver does not qualify.
// TCL: median of up to 5 cycles at the paced site before pacing. Capture: the last 3 pulses each captured the site.
// PPI: last pulse to the next activation at that site (spec "Entrainment and the return").
function entrainmentFor(events, index, completed) {
  const prefix = `${completed.commandId}#`;
  const pulses = events.filter((e) => e.type === 'stimulus_attempted' && e.triggerId.startsWith(prefix));
  if (pulses.length < 3) return null;
  const nodeId = pulses[0].nodeId;
  const acts = events.filter((e) => e.type === 'activation' && e.nodeId === nodeId);
  const before = acts.filter((a) => a.tMs < pulses[0].tMs).slice(-6);
  if (before.length < 3) return null;
  const tclMs = median(before.slice(1).map((a, i) => a.tMs - before[i].tMs));
  const last = pulses.at(-1);
  const captured = pulses.slice(-3).map((p) => acts.find((a) => a.tMs === p.tMs && a.causeIds.includes(p.eventId)));
  if (captured.some((a) => !a)) return null;
  const pacingMs = (last.tMs - pulses.at(-3).tMs) / 2;
  const ret = acts.find((a) => a.tMs > last.tMs);
  if (!ret) return null;
  return { nodeId, tclMs, pacingMs, ppiMs: ret.tMs - last.tMs, deltaMs: ret.tMs - last.tMs - tclMs,
    eventIds: [completed.eventId, last.eventId, ret.eventId], tMs: ret.tMs };
}

export function traceNetworkMarks(events, world) {
  const nodes = new Map(world.nodes.map((n) => [n.id, n]));
  const linkById = new Map(world.links.map((l) => [l.id, l]));
  const index = indexEvents(events);
  const transits = classifyTransits(index, (id) => nodes.get(id)?.audible !== false);
  const marks = [];
  const concealedBlockIds = new Set();

  for (const info of transits.values()) {
    if (!info.concealed) continue;
    const { launch } = info;
    const link = linkById.get(launch.linkId);
    marks.push({ id: `concealedPenetration:${launch.eventId}`, kind: 'concealedPenetration',
      eventIds: [launch.eventId, ...(info.terminal ? [info.terminal.eventId] : [])],
      transitId: launch.transitId, linkId: launch.linkId, tMs: launch.departureMs, endMs: launch.arrivalMs,
      forward: link ? launch.fromNodeId === link.a : true, end: info.end });
    if (info.end === 'blocked') concealedBlockIds.add(info.terminal.eventId);
  }

  const lessionLines = [];
  const lastAct = new Map();
  for (const e of events) {
    switch (e.type) {
      case 'lesion_changed':
        marks.push({ id: `lesion:${e.eventId}`, kind: 'lesion', eventIds: [e.eventId], linkId: e.linkId, tMs: e.tMs,
          progress: e.progress, completeness: e.completeness });
        break;
      case 'phase_modulated': {
        const source = index.byId.get(e.sourceActivationId);
        marks.push({ id: `phaseArc:${e.eventId}`, kind: 'phaseArc', eventIds: [e.eventId, e.sourceActivationId].filter((id) => index.byId.has(id)),
          fromNodeId: source?.nodeId ?? null, toNodeId: e.nodeId, tMs: e.tMs, shiftMs: e.shiftMs });
        break;
      }
      case 'activation': {
        if (e.source === 'mixed' && e.causeIds.length >= 2) {
          const categories = [];
          for (const id of e.causeIds) {
            const c = index.byId.get(id);
            if (!c) continue;
            const cat = c.type === 'conduction_arrived' ? `link:${c.linkId}` : c.source;
            if (!categories.includes(cat)) categories.push(cat);
          }
          if (categories.length >= 2) {
            marks.push({ id: `fusion:${e.eventId}`, kind: 'fusion', eventIds: [e.eventId, ...e.causeIds], nodeId: e.nodeId,
              tMs: e.tMs, categories: categories.slice(0, 2) });
          }
        }
        // Double potentials at a completed lesion line.
        for (const line of lessionLines) {
          const link = linkById.get(line.linkId);
          if (e.nodeId !== link.a && e.nodeId !== link.b) { continue; }
          const other = e.nodeId === link.a ? link.b : link.a;
          const prior = lastAct.get(`${line.linkId}|${other}`);
          const own = lastAct.get(`${line.linkId}|${e.nodeId}`);
          if (prior && (!own || own.tMs < prior.tMs) && e.tMs - prior.tMs <= DOUBLE_POTENTIAL_MAX_GAP_MS && e.tMs > prior.tMs) {
            marks.push({ id: `doublePotential:${e.eventId}`, kind: 'doublePotential', nodeId: prior.nodeId,
              eventIds: [prior.eventId, e.eventId, line.eventId], tMs: e.tMs, intervalMs: e.tMs - prior.tMs, linkId: line.linkId });
            lastAct.delete(`${line.linkId}|${other}`);
          }
          lastAct.set(`${line.linkId}|${e.nodeId}`, e);
        }
        break;
      }
      case 'link_changed':
        if (e.cause === 'lesion' && e.value === false) lessionLines.push({ linkId: e.linkId, eventId: e.eventId });
        break;
      case 'train_completed': {
        const report = entrainmentFor(events, index, e);
        if (report && Math.abs(report.deltaMs) <= ENTRAINMENT_WINDOW_MS) {
          marks.push({ id: `entrainment:${e.eventId}`, kind: 'entrainment', ...report });
        }
        break;
      }
      default:
    }
  }
  marks.sort((a, b) => a.tMs - b.tMs || (a.id < b.id ? -1 : 1));
  return { marks, concealedBlockIds, transits };
}

// geometry: { nodePoint(id) -> {x,y}|null, linkColor(id) -> hex, linkPoint(id, u) -> {x,y}, strokeLink(ctx, id, u0, u1, color, width) }
export function createNetworkMarks({ world, geometry, palette: pal, reducedMotion = false }) {
  const palette = mergePalette(pal);
  let reduced = reducedMotion;
  const derive = memoByEvents((events) => {
    const trace = traceNetworkMarks(events, world);
    const lesionsByLink = new Map();
    for (const m of trace.marks) if (m.kind === 'lesion') {
      const list = lesionsByLink.get(m.linkId);
      if (list) list.push(m); else lesionsByLink.set(m.linkId, [m]);
    }
    return { ...trace, lesionsByLink };
  });

  function latestLesion(list, tMs) {
    let lo = 0; let hi = list.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (list[mid].tMs <= tMs) lo = mid + 1; else hi = mid; }
    return lo ? list[lo - 1] : null;
  }

  function drawLesions(ctx, tMs, lesionsByLink) {
    for (const [linkId, list] of lesionsByLink) {
      const m = latestLesion(list, tMs);
      if (!m || m.progress <= 0) continue;
      const p = clamp(m.progress);
      const half = 0.1 + 0.32 * p;
      // Break the filament, then leave small darker beads along it.
      geometry.strokeLink(ctx, linkId, 0.5 - half, 0.5 + half, palette.ground, 2.4, 0.78 * p);
      const beads = 3 + Math.round(5 * p);
      for (let i = 0; i < beads; i += 1) {
        const u = 0.5 - half + (2 * half * (i + 0.5)) / beads;
        const pt = geometry.linkPoint(linkId, u);
        if (!pt) continue;
        fillCircle(ctx, pt.x, pt.y, 1.5, '#05080D', 0.95);
        strokeCircle(ctx, pt.x, pt.y, 1.5, palette.gold, 0.6, 0.35 * p);
      }
      const age = tMs - m.tMs;
      if (age < 650) { // faint warm glow while the lesion is forming (steps arrive every 250 ms)
        const pt = geometry.linkPoint(linkId, 0.5);
        if (pt) {
          const glow = 0.16 * (1 - clamp((age - 250) / 400)) * (0.4 + 0.6 * p);
          fillCircle(ctx, pt.x, pt.y, 14, palette.gold, glow * 0.5);
          fillCircle(ctx, pt.x, pt.y, 7, palette.goldCore, glow);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  const api = {
    trace: (events) => derive(events, null).marks,
    isConcealedBlock: (events, eventId) => derive(events, null).concealedBlockIds.has(eventId),
    isConcealedTransit: (events, transitId) => derive(events, null).transits.get(transitId)?.concealed === true,
    setReducedMotion(value) { reduced = value; },

    // Concealed penetration: a dim dashed point that fades out mid-link. No ripple at a site.
    // Returns true when the transit was drawn here so the caller skips its normal drawing.
    drawConcealedTransit(ctx, transit, tMs, events) {
      if (!derive(events, null).transits.get(transit.transitId)?.concealed) return false;
      const progress = (tMs - transit.departureMs) / (transit.arrivalMs - transit.departureMs);
      if (progress < 0 || progress >= 1) return true;
      const link = world.links.find((l) => l.id === transit.linkId);
      const forward = !link || transit.fromNodeId === link.a;
      const color = geometry.linkColor(transit.linkId);
      const fade = 1 - ease(progress);
      ctx.setLineDash([1.2, 3.2]);
      if (reduced) {
        geometry.strokeLink(ctx, transit.linkId, 0, 1, color, 1, 0.32);
      } else {
        const tail = Math.max(0, progress - 0.2);
        geometry.strokeLink(ctx, transit.linkId, forward ? tail : 1 - progress, forward ? progress : 1 - tail, color, 1, 0.5 * fade);
      }
      ctx.setLineDash([]);
      const head = geometry.linkPoint(transit.linkId, forward ? progress : 1 - progress);
      if (head && !reduced) fillCircle(ctx, head.x, head.y, 1.7, color, 0.6 * fade);
      return true;
    },

    draw(ctx, tMs, events) {
      const { marks, lesionsByLink } = derive(events, null);
      drawLesions(ctx, tMs, lesionsByLink);
      // Marks are sorted by tMs; scan back from the last one not after tMs until nothing can still be alive.
      let hi = marks.length;
      { let lo = 0; while (lo < hi) { const mid = (lo + hi) >>> 1; if (marks[mid].tMs <= tMs) lo = mid + 1; else hi = mid; } hi = lo; }
      for (let i = hi - 1; i >= 0; i -= 1) {
        const m = marks[i];
        const age = tMs - m.tMs;
        if (age > ENTRAINMENT_MS) break;
        switch (m.kind) {
          case 'phaseArc': {
            if (age >= PHASE_ARC_MS || !m.fromNodeId) break;
            const a = geometry.nodePoint(m.fromNodeId); const b = geometry.nodePoint(m.toNodeId);
            if (!a || !b) break;
            const dx = b.x - a.x; const dy = b.y - a.y;
            const bulge = 0.28;
            const level = reduced ? 0.8 : Math.min(1, age / 30) * (1 - age / PHASE_ARC_MS) ** 1.3;
            ctx.globalAlpha = 0.85 * level; ctx.strokeStyle = palette.input; ctx.lineWidth = 0.9;
            ctx.beginPath(); ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo((a.x + b.x) / 2 - dy * bulge, (a.y + b.y) / 2 + dx * bulge, b.x, b.y);
            ctx.stroke(); ctx.globalAlpha = 1;
            break;
          }
          case 'fusion': {
            if (age >= FUSION_MS) break;
            const p = geometry.nodePoint(m.nodeId);
            if (!p) break;
            const level = reduced ? 0.9 : (1 - age / FUSION_MS) ** 1.2;
            const colorOf = (cat) => (cat.startsWith('link:') ? geometry.linkColor(cat.slice(5)) : palette.input);
            strokeArc(ctx, p.x, p.y, 9.5, Math.PI / 2, Math.PI * 1.5, colorOf(m.categories[0]), 1.3, 0.9 * level);
            strokeArc(ctx, p.x, p.y, 9.5, -Math.PI / 2, Math.PI / 2, colorOf(m.categories[1]), 1.3, 0.9 * level);
            ctx.globalAlpha = 1;
            break;
          }
          case 'doublePotential': {
            if (age >= DOUBLE_POTENTIAL_MS) break;
            const p = geometry.nodePoint(m.nodeId);
            if (!p) break;
            const level = reduced ? 0.9 : (1 - age / DOUBLE_POTENTIAL_MS) ** 1.4;
            const gap = doublePotentialGapPx(m.intervalMs);
            strokeCircle(ctx, p.x, p.y, 8, palette.blueCore, 1, 0.85 * level);
            strokeCircle(ctx, p.x, p.y, 8 + gap, palette.blueCore, 1, 0.65 * level);
            ctx.globalAlpha = 1;
            break;
          }
          case 'entrainment': {
            if (age >= ENTRAINMENT_MS) break;
            const p = geometry.nodePoint(m.nodeId);
            if (!p) break;
            const close = reduced ? 1 : ease(clamp(age / 240));
            const fade = age < ENTRAINMENT_MS - 400 ? 1 : (ENTRAINMENT_MS - age) / 400;
            if (close === 1) {
              strokeCircle(ctx, p.x, p.y, 14, palette.gold, 0.9, 0.9 * fade);
            } else {
              strokeArc(ctx, p.x, p.y, 14, -Math.PI / 2, -Math.PI / 2 + TURN * close, palette.gold, 0.9, 0.9 * fade);
            }
            ctx.globalAlpha = 1;
            break;
          }
          default:
        }
      }
    },
  };
  return api;
}

export { PALETTE };
