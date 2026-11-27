// Staves view: intracardiac-style channels as a score. Study No. 2 spec, "Staves".
// Electrograms are SYNTHETIC kernels aligned to activation onsets. They are not recordings.
import {
  TURN, clamp, mergePalette, lowerBound, memoByEvents, applyDpr, glowLine, serifItalic, sans,
} from './common.js';
import { PLAYHEAD, DEFAULT_WINDOW_MS } from './ladder.js';

export const SYNTHETIC_LABEL = 'synthetic';

// Kernel shapes follow design/plates/src/staves.py. x is ms relative to the onset.
const KERNELS = {
  atrial: { support: 24, nominalMs: 40, gain: 0.75, f: (x) => Math.exp(-((x / 12) ** 2)) * Math.sin(x / 5.5) },
  hisPurkinje: { support: 10, nominalMs: 12, gain: 0.35, f: (x) => Math.exp(-((x / 6) ** 2)) * Math.sin(x / 3) },
  ventricular: { support: 56, nominalMs: 80, gain: 1.25, f: (x) => -Math.exp(-(((x - 6) / 26) ** 2)) * Math.sin((x - 6) / 11) },
};
const TISSUE_KERNEL = { sinus: 'atrial', atrial: 'atrial', nodal: 'atrial', accessory: 'hisPurkinje', hisPurkinje: 'hisPurkinje', ventricular: 'ventricular' };
const STEP_MS = 0.5;
const tables = new Map(); // bounded: one lookup table per kernel shape

export function kernelFor(tissue) {
  return TISSUE_KERNEL[tissue] ?? 'atrial';
}
export function kernelSupportMs(tissue) { return KERNELS[kernelFor(tissue)].support; }
export const kernelNominalMs = (tissue) => KERNELS[kernelFor(tissue)].nominalMs;

function table(name) {
  let t = tables.get(name);
  if (!t) {
    const k = KERNELS[name];
    const n = Math.round(2 * k.support / STEP_MS) + 1;
    t = new Float64Array(n);
    for (let i = 0; i < n; i += 1) t[i] = k.gain * k.f(-k.support + i * STEP_MS);
    tables.set(name, t);
  }
  return t;
}

// Unit-free amplitude of the synthetic electrogram at dtMs from an onset (0 outside the support).
export function kernelAt(tissue, dtMs) {
  const name = kernelFor(tissue);
  const { support } = KERNELS[name];
  if (dtMs <= -support || dtMs >= support) return 0;
  const t = table(name);
  const pos = (dtMs + support) / STEP_MS;
  const i = Math.floor(pos);
  const frac = pos - i;
  return t[i] + (t[i + 1] - t[i]) * frac;
}

// Nearest simple ratio interval:reference with numerator and denominator up to maxTerm, reduced.
export function nearestSimpleRatio(intervalMs, referenceMs, { maxTerm = 5 } = {}) {
  if (!(intervalMs > 0) || !(referenceMs > 0)) return null;
  const target = intervalMs / referenceMs;
  let best = null;
  for (let q = 1; q <= maxTerm; q += 1) {
    for (let p = 1; p <= maxTerm; p += 1) {
      if (gcd(p, q) !== 1) continue;
      const error = Math.abs(target - p / q);
      if (!best || error < best.error - 1e-12 || (Math.abs(error - best.error) <= 1e-12 && p + q < best.p + best.q)) {
        best = { p, q, error };
      }
    }
  }
  return { p: best.p, q: best.q, text: `${best.p}:${best.q}`, value: best.p / best.q,
    errorMs: intervalMs - referenceMs * best.p / best.q };
}
function gcd(a, b) { return b ? gcd(b, a % b) : a; }

export function traceStaveMarks(events, staves) {
  const tissue = new Map(staves.map((s) => [s.nodeId, s.tissue ?? 'atrial']));
  const marks = [];
  for (const event of events) {
    if (event.type !== 'activation' || !tissue.has(event.nodeId)) continue;
    const t = tissue.get(event.nodeId);
    marks.push({ id: `notehead:${event.eventId}`, kind: 'notehead', eventIds: [event.eventId], nodeId: event.nodeId, tMs: event.tMs },
      { id: `kernel:${event.eventId}`, kind: 'kernel', eventIds: [event.eventId], nodeId: event.nodeId, tMs: event.tMs,
        tissue: t, supportMs: kernelSupportMs(t) });
  }
  return marks;
}

export function createStaves({ staves, reducedMotion = false } = {}) {
  const lanes = staves.map((s) => ({ ...s, tissue: s.tissue ?? 'atrial' }));
  let reduced = reducedMotion;
  let calipers = null;
  let reference = null;
  let last = null; // layout of the previous draw, for pointer mapping
  const cache = memoByEvents((events) => {
    const onsets = lanes.map(() => []);
    const lane = new Map(lanes.map((s, i) => [s.nodeId, i]));
    for (const e of events) if (e.type === 'activation' && lane.has(e.nodeId)) onsets[lane.get(e.nodeId)].push(e.tMs);
    return onsets;
  });

  function layout({ width, height, windowMs = DEFAULT_WINDOW_MS, presentedMs = 0, reducedMotion: rm = reduced }) {
    const compact = width < 520;
    const left = Math.round(clamp(width * 0.15, compact ? 78 : 100, 170));
    const right = compact ? 12 : 24;
    const top = compact ? 18 : 24;
    const bottom = compact ? 40 : 52;
    const plotWidth = Math.max(1, width - left - right);
    const pxPerMs = plotWidth / windowMs;
    const t0 = rm ? Math.floor(presentedMs / windowMs) * windowMs : presentedMs - PLAYHEAD * windowMs;
    const playheadX = rm ? left + (presentedMs - t0) * pxPerMs : left + PLAYHEAD * plotWidth;
    const laneH = (height - top - bottom) / lanes.length;
    return { width, height, left, right, top, bottom, plotWidth, pxPerMs, t0, t1: t0 + windowMs, windowMs, playheadX,
      laneH, compact, x: (t) => left + (t - t0) * pxPerMs, baseline: (i) => top + laneH * (i + 0.62) };
  }

  const api = {
    meta: { synthetic: true, label: SYNTHETIC_LABEL, staves: lanes },
    layout,
    traceMarks: (events) => traceStaveMarks(events, lanes),
    setReducedMotion(value) { reduced = value; },

    // Calipers, in absolute sim ms. Order is normalised so a <= b.
    setCalipers(a, b) {
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new TypeError('calipers need finite times');
      calipers = a <= b ? { a, b } : { a: b, b: a };
      return api.readout();
    },
    clearCalipers() { calipers = null; },
    getCalipers() { return calipers && { ...calipers }; },
    setReference(ms) { reference = ms > 0 ? ms : null; },
    // { a, b, intervalMs, referenceMs, ratio } or null. A reference interval argument overrides the stored one.
    readout(referenceMs = reference, options) {
      if (!calipers) return null;
      const intervalMs = calipers.b - calipers.a;
      return { a: calipers.a, b: calipers.b, intervalMs, referenceMs: referenceMs ?? null,
        ratio: referenceMs ? nearestSimpleRatio(intervalMs, referenceMs, options) : null };
    },
    // Pointer mapping from the last draw. Snap to the nearest onset on any stave within tolerancePx.
    timeAtX(x) { return last ? last.t0 + (x - last.left) / last.pxPerMs : null; },
    xAtTime(t) { return last ? last.x(t) : null; },
    snapToOnset(events, tMs, tolerancePx = 8) {
      const tolerance = last ? tolerancePx / last.pxPerMs : 8;
      let best = null;
      for (const onsets of cache(events, null)) {
        const i = lowerBound(onsets, tMs - tolerance, (v) => v);
        for (let k = i; k < onsets.length && onsets[k] <= tMs + tolerance; k += 1) {
          if (best === null || Math.abs(onsets[k] - tMs) < Math.abs(best - tMs)) best = onsets[k];
        }
      }
      return best ?? tMs;
    },

    draw(ctx, args) {
      const { events = [], presentedMs = 0, windowMs = DEFAULT_WINDOW_MS, width, height, dpr, clear = true,
        showSyntheticLabel = false } = args;
      const rm = args.reducedMotion ?? reduced;
      const palette = mergePalette(args.palette);
      applyDpr(ctx, dpr);
      const L = layout({ width, height, windowMs, presentedMs, reducedMotion: rm });
      last = L;
      const onsets = cache(events, null);
      if (clear) { ctx.globalAlpha = 1; ctx.fillStyle = palette.ground; ctx.fillRect(0, 0, width, height); }
      const unit = Math.min(L.laneH * 0.3, 52);
      const spacing = L.laneH * 0.08;

      for (let i = 0; i < lanes.length; i += 1) {
        const lane = lanes[i];
        const y0 = L.baseline(i);
        // Five staff lines around the baseline, labels left.
        ctx.globalAlpha = 1; ctx.strokeStyle = palette.rule; ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (let k = -2; k <= 2; k += 1) { ctx.moveTo(L.left, y0 + k * spacing); ctx.lineTo(L.left + L.plotWidth, y0 + k * spacing); }
        ctx.stroke();
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = palette.text2;
        ctx.font = serifItalic(L.compact ? 11 : 14);
        ctx.fillText(lane.label ?? lane.nodeId, L.left - 10, y0, L.left - 18);
        if (lane.pitch) {
          ctx.font = sans(L.compact ? 8 : 9); ctx.globalAlpha = 0.8;
          ctx.fillText(lane.pitch, L.left - 10, y0 + (L.compact ? 14 : 18), L.left - 18);
          ctx.globalAlpha = 1;
        }

        const color = lane.tissue === 'hisPurkinje' ? palette.blue : palette.gold;
        const support = kernelSupportMs(lane.tissue);
        const list = onsets[i];
        ctx.save();
        ctx.beginPath(); ctx.rect(L.left, 0, L.plotWidth, height); ctx.clip();
        // Baseline: the quiet channel.
        glowLine(ctx, L.left, y0, L.left + L.plotWidth, y0, color, 0.9, 0.85);
        // Clusters of overlapping kernels are summed exactly and drawn as one trace.
        let a = lowerBound(list, L.t0 - support - 400, (v) => v);
        while (a < list.length && list[a] <= L.t1 + support) {
          let b = a;
          while (b + 1 < list.length && list[b + 1] - list[b] < 2 * support) b += 1;
          if (list[b] >= L.t0 - support) {
            const start = list[a] - support;
            const end = list[b] + support;
            const step = 0.5 / L.pxPerMs;
            ctx.strokeStyle = color; ctx.lineWidth = 0.9; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ctx.globalAlpha = 0.95;
            ctx.beginPath();
            // Cover the baseline exactly at the ends so the blip joins it.
            for (let t = start; t <= end + step; t += step) {
              let v = 0;
              for (let k = a; k <= b; k += 1) v += kernelAt(lane.tissue, t - list[k]);
              const px = L.x(t); const py = y0 - v * unit;
              if (t === start) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.stroke();
          }
          a = b + 1;
        }
        // Note heads and stems at onsets.
        const first = lowerBound(list, L.t0 - 40, (v) => v);
        for (let k = first; k < list.length && list[k] <= L.t1 + 40; k += 1) {
          const x = L.x(list[k]);
          const future = !rm && list[k] > presentedMs;
          const hy = y0 - spacing * 1.9;
          ctx.globalAlpha = future ? 0.45 : 0.92;
          ctx.fillStyle = palette.text;
          ctx.beginPath(); ctx.ellipse(x, hy, spacing * 0.95, spacing * 0.62, -0.38, 0, TURN); ctx.fill();
          ctx.globalAlpha = future ? 0.35 : 0.7; ctx.strokeStyle = palette.text; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(x + spacing * 0.9, hy - 1); ctx.lineTo(x + spacing * 0.9, hy - spacing * 4.2); ctx.stroke();
        }
        ctx.restore();
      }

      // Calipers: two hairlines through every stave, a bracket and the readout.
      if (calipers) {
        const xa = L.x(calipers.a); const xb = L.x(calipers.b);
        const yTop = L.top - 6; const yBr = height - L.bottom + 18;
        ctx.save();
        ctx.beginPath(); ctx.rect(L.left - 2, 0, L.plotWidth + 4, height); ctx.clip();
        ctx.setLineDash([2, 3]); ctx.strokeStyle = palette.blueCore; ctx.lineWidth = 0.7; ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.moveTo(xa, yTop); ctx.lineTo(xa, yBr); ctx.moveTo(xb, yTop); ctx.lineTo(xb, yBr); ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 0.85; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(xa, yBr); ctx.lineTo(xb, yBr);
        ctx.moveTo(xa, yBr - 4); ctx.lineTo(xa, yBr + 4); ctx.moveTo(xb, yBr - 4); ctx.lineTo(xb, yBr + 4); ctx.stroke();
        ctx.restore();
        const r = api.readout();
        ctx.font = sans(L.compact ? 10 : 12); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = 1; ctx.fillStyle = palette.blueCore;
        const text = `${Math.round(r.intervalMs)} ms${r.ratio ? `  ·  ${r.ratio.p} : ${r.ratio.q}` : ''}`;
        ctx.fillText(text, Math.min(Math.max((xa + xb) / 2, L.left + 50), L.left + L.plotWidth - 50), yBr + 16);
      }

      ctx.globalAlpha = 0.2; ctx.strokeStyle = palette.text; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(L.playheadX, L.top - 6); ctx.lineTo(L.playheadX, height - L.bottom + 8); ctx.stroke();
      if (showSyntheticLabel) {
        ctx.globalAlpha = 0.7; ctx.fillStyle = palette.text2; ctx.font = sans(9); ctx.textAlign = 'right';
        ctx.fillText(`${SYNTHETIC_LABEL} electrograms`, width - 10, 10);
      }
      ctx.globalAlpha = 1;
      return L;
    },
  };
  return api;
}
