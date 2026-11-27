// Ladder view (Lewis diagram as graphic score). Study No. 2 spec, "Ladder".
// Every mark is derived from event ids. Delay is read from event times, never from geometry.
import {
  PALETTE, TURN, clamp, mergePalette, lowerBound, memoByEvents, applyDpr,
  glowLine, pearl, openRing, fillCircle, strokeCircle, serifItalic, sans,
} from './common.js';
import { indexEvents, classifyTransits } from './trace.js';

export const PLAYHEAD = 0.72;
export const DEFAULT_WINDOW_MS = 3000;
const BLOCK_END = 0.86; // a block line stops short of the tier and ends in a bar
const FUTURE_ALPHA = 0.5;

// tiers: [{ id?, label?, group?, audible?, sites: [nodeId | { id, audible?, label? }] }] (strings allowed).
export function normalizeTiers(tiers, { siteLabels = {}, silentSites = [] } = {}) {
  if (tiers?.siteIndex) return tiers;
  const silent = new Set(silentSites);
  const siteIndex = new Map();
  const list = tiers.map((raw, tier) => {
    const spec = typeof raw === 'string' ? { sites: [raw] } : raw;
    const sites = (spec.sites ?? spec.nodeIds ?? []).map((site, sub) => {
      const id = typeof site === 'string' ? site : site.id;
      const audible = spec.audible !== false && site.audible !== false && !silent.has(id);
      const entry = { id, audible, label: site.label ?? siteLabels[id] ?? id };
      siteIndex.set(id, { tier, sub, rank: tier + sub / 1000, audible });
      return entry;
    });
    return {
      id: spec.id ?? sites[0]?.id ?? `tier${tier}`,
      label: spec.label ?? siteLabels[sites[0]?.id] ?? sites[0]?.id ?? '',
      group: spec.group ?? null,
      sites,
    };
  });
  return { tiers: list, siteIndex };
}

// Build tiers from a world: display.tiers when present, otherwise one tier per node.
export function tiersFromWorld(world) {
  const declared = world.display?.tiers;
  const silent = world.nodes.filter((n) => n.audible === false).map((n) => n.id);
  return normalizeTiers(declared ?? world.nodes.map((n) => n.id), { silentSites: silent });
}

// The mark list. Pure: same events and tiers give the same marks. y values are tier indices.
export function traceMarks(events, tiersConfig) {
  const { siteIndex } = normalizeTiers(tiersConfig);
  const index = indexEvents(events);
  const audible = (id) => siteIndex.get(id)?.audible ?? true;
  const transits = classifyTransits(index, audible);
  const marks = [];

  for (const event of events) {
    const site = siteIndex.get(event.nodeId);
    if (event.type === 'activation' && site) {
      marks.push({ id: `activation:${event.eventId}`, kind: 'activation', eventIds: [event.eventId],
        tMs: event.tMs, t0: event.tMs, t1: event.tMs, y0: site.tier, y1: site.tier,
        nodeId: event.nodeId, audible: site.audible, source: event.source });
    } else if (event.type === 'stimulus_attempted' && event.source === 'stimulus' && site) {
      marks.push({ id: `stimulus:${event.eventId}`, kind: 'stimulus', eventIds: [event.eventId],
        tMs: event.tMs, t0: event.tMs, t1: event.tMs, y0: -1, y1: -1, nodeId: event.nodeId });
    } else if (event.type === 'activation_blocked' && site) {
      const hasArrival = event.causeIds.some((id) => index.byId.get(id)?.type === 'conduction_arrived');
      if (!hasArrival) {
        marks.push({ id: `block:${event.eventId}`, kind: 'block', eventIds: [event.eventId, ...event.causeIds],
          tMs: event.tMs, t0: event.tMs, t1: event.tMs, y0: site.tier, y1: site.tier,
          nodeId: event.nodeId, onLine: false });
      }
    } else if (event.type === 'conduction_launched') {
      const a = siteIndex.get(event.fromNodeId);
      const b = siteIndex.get(event.toNodeId);
      if (!a || !b) continue;
      const info = transits.get(event.transitId);
      const base = {
        t0: event.departureMs, y0: a.tier, from: event.fromNodeId, to: event.toNodeId, linkId: event.linkId,
        direction: b.rank > a.rank ? 'antegrade' : 'retrograde',
        delayMs: event.arrivalMs - event.departureMs, transitId: event.transitId,
        concealed: info.concealed, end: info.end,
      };
      const ids = [event.eventId];
      if (info.arrival) ids.push(info.arrival.eventId);
      if (info.terminal) ids.push(info.terminal.eventId);
      let t1 = event.arrivalMs;
      let y1 = b.tier;
      let kind = 'conduction';
      if (info.end === 'collision' || info.end === 'canceled') {
        const frac = (info.terminal.tMs - event.departureMs) / (event.arrivalMs - event.departureMs);
        t1 = info.terminal.tMs;
        y1 = a.tier + clamp(frac) * (b.tier - a.tier);
        kind = info.end === 'collision' ? 'collision' : 'canceled';
      } else if (info.end === 'blocked') kind = 'block';
      if (info.concealed) kind = 'concealed';
      marks.push({ ...base, id: `${kind}:${event.eventId}`, kind, eventIds: ids, tMs: event.departureMs, t1, y1,
        onLine: true, pending: info.end === 'pending' });
    } else if (event.type === 'conduction_collision') {
      let sumY = 0;
      let n = 0;
      for (const transitId of event.transitIds) {
        const launch = index.launches.get(transitId);
        const a = launch && siteIndex.get(launch.fromNodeId);
        const b = launch && siteIndex.get(launch.toNodeId);
        if (!a || !b) continue;
        const frac = clamp((event.tMs - launch.departureMs) / (launch.arrivalMs - launch.departureMs));
        sumY += a.tier + frac * (b.tier - a.tier);
        n += 1;
      }
      if (n) {
        marks.push({ id: `collisionPoint:${event.eventId}`, kind: 'collisionPoint',
          eventIds: [event.eventId, ...event.transitIds.map((t) => index.launches.get(t)?.eventId).filter(Boolean)],
          tMs: event.tMs, t0: event.tMs, t1: event.tMs, y0: sumY / n, y1: sumY / n, position: event.position,
          concealed: event.transitIds.every((t) => transits.get(t)?.concealed) });
      }
    }
  }
  marks.sort((x, y) => x.t0 - y.t0 || (x.id < y.id ? -1 : 1));
  return marks;
}

export function createLadder({ tiers, siteLabels = {}, silentSites = [], reducedMotion = false } = {}) {
  const config = normalizeTiers(tiers, { siteLabels, silentSites });
  const count = config.tiers.length;
  let reduced = reducedMotion;
  const cache = memoByEvents((events) => {
    const marks = traceMarks(events, config);
    let maxSpan = 0;
    for (const m of marks) maxSpan = Math.max(maxSpan, m.t1 - m.t0);
    return { marks, maxSpan, byEvent: new Map(marks.filter((m) => m.kind === 'activation').map((m) => [m.eventIds[0], m])) };
  });

  function layout({ width, height, windowMs = DEFAULT_WINDOW_MS, presentedMs = 0, reducedMotion: rm = reduced }) {
    const compact = width < 520;
    const left = Math.round(clamp(width * 0.14, compact ? 62 : 90, 150));
    const right = compact ? 12 : 24;
    const top = compact ? 40 : 52;
    const bottom = compact ? 34 : 46;
    const plotWidth = Math.max(1, width - left - right);
    const pxPerMs = plotWidth / windowMs;
    let t0;
    let playheadX;
    if (rm) { // paged: the playhead crosses a stationary page, then the page turns
      t0 = Math.floor(presentedMs / windowMs) * windowMs;
      playheadX = left + (presentedMs - t0) * pxPerMs;
    } else {
      t0 = presentedMs - PLAYHEAD * windowMs;
      playheadX = left + PLAYHEAD * plotWidth;
    }
    const step = count > 1 ? (height - top - bottom) / (count - 1) : 0;
    return {
      width, height, left, right, top, bottom, plotWidth, pxPerMs, t0, t1: t0 + windowMs, windowMs, playheadX, compact,
      tierStep: step,
      x: (t) => left + (t - t0) * pxPerMs,
      y: (tier) => (tier < 0 ? top - (compact ? 16 : 22)
        : count > 1 ? top + tier * step : (top + height - bottom) / 2),
    };
  }

  function draw(ctx, args) {
    const { events = [], presentedMs = 0, windowMs = DEFAULT_WINDOW_MS, width, height, dpr, intervals, clear = true } = args;
    const rm = args.reducedMotion ?? reduced;
    const palette = mergePalette(args.palette);
    applyDpr(ctx, dpr);
    const L = layout({ width, height, windowMs, presentedMs, reducedMotion: rm });
    const { marks, maxSpan, byEvent } = cache(events, config);
    if (clear) { ctx.globalAlpha = 1; ctx.fillStyle = palette.ground; ctx.fillRect(0, 0, width, height); }

    // Group bands (e.g. the AV region) and tier rules with labels.
    let i = 0;
    while (i < count) {
      const group = config.tiers[i].group;
      let j = i;
      while (group && j + 1 < count && config.tiers[j + 1].group === group) j += 1;
      if (group && j > i) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = palette.band;
        ctx.fillRect(L.left, L.y(i) - L.tierStep * 0.3, L.plotWidth, L.y(j) - L.y(i) + L.tierStep * 0.6);
      }
      i = j + 1;
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = serifItalic(L.compact ? 11 : 14);
    ctx.lineWidth = 1;
    for (let k = 0; k < count; k += 1) {
      const y = L.y(k);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = palette.rule;
      ctx.beginPath(); ctx.moveTo(L.left, y); ctx.lineTo(L.left + L.plotWidth, y); ctx.stroke();
      ctx.fillStyle = palette.text2;
      ctx.fillText(config.tiers[k].label, L.left - 10, y);
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(L.left, 0, L.plotWidth, height); ctx.clip();
    const lw = L.compact ? 0.9 : 1.1;
    const dot = L.compact ? 3.2 : 4.2;
    const first = lowerBound(marks, L.t0 - maxSpan - 20, (m) => m.t0);
    for (let m = first; m < marks.length; m += 1) {
      const mark = marks[m];
      if (mark.t0 > L.t1 + 20) break;
      if (mark.t1 < L.t0 - 20) continue;
      const future = !rm && mark.t0 > presentedMs;
      const a = future ? FUTURE_ALPHA : 1;
      const x0 = L.x(mark.t0);
      const y0 = L.y(mark.y0);
      switch (mark.kind) {
        case 'conduction': case 'concealed': case 'block': case 'collision': case 'canceled': {
          const gold = mark.direction === 'antegrade';
          const color = gold ? palette.gold : palette.blue;
          let x1 = L.x(mark.t1);
          let y1 = L.y(mark.y1);
          if (mark.kind === 'block') { x1 = x0 + (x1 - x0) * BLOCK_END; y1 = y0 + (y1 - y0) * BLOCK_END; }
          if (mark.concealed) {
            ctx.setLineDash([3, 4]);
            ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
            ctx.globalAlpha = a * 0.55;
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            ctx.setLineDash([]);
          } else {
            glowLine(ctx, x0, y0, x1, y1, color, lw, a);
          }
          if (mark.kind === 'block') { // short bar, perpendicular to the line
            const dx = x1 - x0; const dy = y1 - y0; const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len; const ny = dx / len; const h = L.compact ? 5 : 7;
            ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = lw * 1.5;
            ctx.beginPath(); ctx.moveTo(x1 - nx * h, y1 - ny * h); ctx.lineTo(x1 + nx * h, y1 + ny * h); ctx.stroke();
          }
          break;
        }
        case 'collisionPoint': {
          const y = L.y(mark.y0);
          const c = mark.concealed ? 0.5 : 1;
          fillCircle(ctx, x0, y, 6, palette.text, a * 0.1 * c);
          fillCircle(ctx, x0, y, 3, palette.text, a * 0.25 * c);
          fillCircle(ctx, x0, y, 1.3, palette.text, a * 0.75 * c);
          break;
        }
        case 'activation': {
          if (mark.audible) {
            ctx.globalAlpha = a * 0.3; ctx.strokeStyle = palette.text; ctx.lineWidth = 0.7;
            ctx.beginPath(); ctx.moveTo(x0 + dot * 0.9, y0 - dot); ctx.lineTo(x0 + dot * 0.9, y0 - dot - 12); ctx.stroke();
            pearl(ctx, x0, y0, dot, palette.gold, palette.goldCore, a);
            if (!rm && presentedMs >= mark.t0 && presentedMs - mark.t0 < 70) {
              fillCircle(ctx, x0, y0, dot * 3.4, palette.goldCore, 0.18 * (1 - (presentedMs - mark.t0) / 70));
            }
          } else openRing(ctx, x0, y0, dot, palette.ground, palette.text, a);
          break;
        }
        case 'stimulus': {
          const y = L.y(-1);
          ctx.globalAlpha = a * 0.85; ctx.strokeStyle = palette.text2; ctx.lineWidth = 0.9; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(x0 - 4.5, y - 4); ctx.lineTo(x0 + 4.5, y - 4); ctx.lineTo(x0, y + 4); ctx.closePath(); ctx.stroke();
          break;
        }
        case 'block': default: break;
      }
      if (mark.kind === 'block' && !mark.onLine) { // refused stimulus or arrival with no line: bar on the tier
        ctx.globalAlpha = a * 0.9; ctx.strokeStyle = palette.blueCore; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x0, y0 - 7); ctx.lineTo(x0, y0 + 7); ctx.stroke();
      }
    }
    ctx.restore();

    // Optional Lab interval brackets between two activation events.
    if (intervals?.length) {
      ctx.font = sans(L.compact ? 10 : 11);
      ctx.textAlign = 'center';
      const yb = height - bottomPad(L) + 10;
      for (const { fromEventId, toEventId } of intervals) {
        const a = byEvent.get(fromEventId); const b = byEvent.get(toEventId);
        if (!a || !b) continue;
        const xa = L.x(a.tMs); const xb = L.x(b.tMs);
        ctx.globalAlpha = 0.85; ctx.strokeStyle = palette.blueCore; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(xa, yb); ctx.lineTo(xb, yb);
        ctx.moveTo(xa, yb - 4); ctx.lineTo(xa, yb + 4); ctx.moveTo(xb, yb - 4); ctx.lineTo(xb, yb + 4); ctx.stroke();
        ctx.fillStyle = palette.blueCore;
        ctx.fillText(`${Math.round(Math.abs(b.tMs - a.tMs))} ms`, (xa + xb) / 2, yb + 13);
      }
    }

    // Playhead: a hairline, no label.
    ctx.globalAlpha = 0.2; ctx.strokeStyle = palette.text; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(L.playheadX, L.top - 28); ctx.lineTo(L.playheadX, height - L.bottom + 14); ctx.stroke();
    ctx.globalAlpha = 1;
    return L;
  }

  const bottomPad = (L) => L.bottom;

  return {
    draw, layout, traceMarks: (events) => cache(events, config).marks, tiers: config.tiers, siteIndex: config.siteIndex,
    setReducedMotion(value) { reduced = value; },
    // Pixel endpoints of a mark under a layout (tests and hit testing).
    markGeometry(mark, L) { return { x0: L.x(mark.t0), y0: L.y(mark.y0), x1: L.x(mark.t1), y1: L.y(mark.y1) }; },
  };
}

export { PALETTE, TURN };
