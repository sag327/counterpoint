// Lab plot catalog (ticket 14f). Canvas 2D, in the plates' dark style.
//
// Each catalog entry is { id, title, build(input) -> model, draw(ctx, model, rect, options),
// table(model) -> { caption, columns, rows }, summary(model) -> string }.
// A model is plain data: domains, layers, handles, a data table and a
// one-sentence summary. One renderer (drawPlot) draws every model, so the
// look stays consistent and models can be built in a Worker or a test.
//
// rect is { x, y, width, height } in canvas units; the caller scales the
// context for devicePixelRatio. Handle geometry (handlePoints, valueAtPixel)
// uses the same layout as the renderer, so DOM handles sit exactly on the curve.

import { decrementExtra, median, restitutionSlope, round3, simpleFraction } from './measure.js';

export const LAB_STYLE = Object.freeze({
  background: '#070B12',
  panel: '#0D1520',
  gold: '#C8A878',
  goldCore: '#FFF1D1',
  blue: '#83A9C8',
  blueCore: '#D9F1FF',
  text: '#E3DED5',
  text2: '#9CA9B8',
  rule: '#1B2736',
  serif: "'EB Garamond', Georgia, 'Times New Roman', serif",
  sans: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
});

const S = LAB_STYLE;
const E = Math.E;

// ---------------------------------------------------------------------------
// Layout and scales

function niceStep(span, target) {
  const raw = span / Math.max(1, target);
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit < 1.5 ? 1 : unit < 3 ? 2 : unit < 7 ? 5 : 10) * power;
}

export function ticks([lo, hi], target = 6) {
  const step = niceStep(hi - lo, target);
  const values = [];
  for (let value = Math.ceil(lo / step - 1e-9) * step; value <= hi + step * 1e-9; value += step) values.push(round3(value));
  return { values, step };
}

function format(value, step) {
  const digits = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9));
  return value.toFixed(digits);
}

const HEADER = 50;
const COMPACT_HEADER = 26;
const FOOTER_LINE = 16;

// Pixel layout of a model inside rect.
export function plotLayout(model, rect) {
  const footer = (model.footer?.length ?? 0) * FOOTER_LINE + (model.footer?.length ? 6 : 0);
  const left = rect.x + 48;
  const right = rect.x + rect.width - (model.rightMargin ?? 14);
  const top = rect.y + (model.compact ? COMPACT_HEADER : HEADER);
  const bottom = rect.y + rect.height - 38 - footer;
  let box = { left, top, width: Math.max(10, right - left), height: Math.max(10, bottom - top) };
  if (model.square) {
    const side = Math.min(box.width, box.height);
    box = { left, top, width: side, height: side };
  }
  const [x0, x1] = model.invertX ? [model.xDomain[1], model.xDomain[0]] : model.xDomain;
  const [y0, y1] = model.yDomain;
  const px = value => box.left + ((value - x0) / (x1 - x0)) * box.width;
  const py = value => box.top + box.height - ((value - y0) / (y1 - y0)) * box.height;
  const fromPx = p => x0 + ((p - box.left) / box.width) * (x1 - x0);
  const fromPy = p => y0 + ((box.top + box.height - p) / box.height) * (y1 - y0);
  return { box, px, py, fromPx, fromPy, footerTop: box.top + box.height + 38 };
}

// Handle centres in canvas units, for hit testing and DOM overlays.
export function handlePoints(model, rect) {
  const layout = plotLayout(model, rect);
  return (model.handles ?? []).map(handle => ({ ...handle, px: layout.px(handle.x), py: layout.py(handle.y) }));
}

// The data value a handle would take with the pointer at (px, py).
export function valueAtPixel(model, rect, handle, px, py) {
  const layout = plotLayout(model, rect);
  return handle.axis === 'x' ? layout.fromPx(px) : layout.fromPy(py);
}

// ---------------------------------------------------------------------------
// Renderer

function font(ctx, size, { italic = false, serif = false, weight = 300 } = {}) {
  ctx.font = `${italic ? 'italic ' : ''}${serif ? 400 : weight} ${size}px ${serif ? S.serif : S.sans}`;
}

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function strokePath(ctx, points, layout, { color, width = 1, alpha = 1, dash = null, glow = false }) {
  const path = () => {
    ctx.beginPath();
    let pen = false;
    for (const point of points) {
      if (point === null || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        pen = false;
        continue;
      }
      const x = layout.px(point[0]);
      const y = layout.py(point[1]);
      if (pen) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      pen = true;
    }
  };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash ?? []);
  if (glow) {
    for (const [k, a] of [[7, 0.03], [4.5, 0.06], [2.6, 0.12]]) {
      path();
      ctx.strokeStyle = withAlpha(color, a * alpha);
      ctx.lineWidth = width * k;
      ctx.stroke();
    }
  }
  path();
  ctx.strokeStyle = withAlpha(color, 0.95 * alpha);
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}

function dot(ctx, x, y, radius, color, alpha = 1) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = withAlpha(color, alpha);
  ctx.fill();
}

function pearl(ctx, x, y, color, core, radius = 3) {
  for (const [k, a] of [[4, 0.06], [2.6, 0.12], [1.7, 0.22]]) dot(ctx, x, y, radius * k, color, a);
  dot(ctx, x, y, radius, color, 1);
  dot(ctx, x, y, radius * 0.55, core, 0.95);
}

function label(ctx, text, x, y, { color = S.text, size = 12, italic = true, serif = true, align = 'left', baseline = 'middle', alpha = 0.9 } = {}) {
  font(ctx, size, { italic, serif });
  ctx.fillStyle = withAlpha(color, alpha);
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}

function drawAxes(ctx, model, layout) {
  const { box } = layout;
  ctx.save();
  ctx.strokeStyle = S.rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(box.left + 0.5, box.top + 0.5, box.width, box.height);
  font(ctx, 9.5);
  ctx.fillStyle = S.text2;
  const xt = model.xTicks ? { values: model.xTicks, step: 1 } : ticks(model.xDomain, model.xTickTarget ?? Math.max(3, Math.round(box.width / 70)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const value of xt.values) {
    const x = layout.px(value);
    if (x < box.left - 0.5 || x > box.left + box.width + 0.5) continue;
    ctx.fillRect(x, box.top + box.height, 0.6, 3);
    ctx.fillText(model.xTickLabel ? model.xTickLabel(value) : format(value, xt.step), x, box.top + box.height + 6);
  }
  const yt = ticks(model.yDomain, Math.max(3, Math.round(box.height / 45)));
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const value of yt.values) {
    const y = layout.py(value);
    if (y < box.top - 0.5 || y > box.top + box.height + 0.5) continue;
    ctx.fillRect(box.left - 3, y, 3, 0.6);
    ctx.fillText(format(value, yt.step), box.left - 6, y);
  }
  font(ctx, 10.5);
  if (model.xLabel) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(model.xLabel, box.left + box.width / 2, box.top + box.height + 21);
  }
  if (model.yLabel) {
    ctx.save();
    ctx.translate(box.left - 38, box.top + box.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(model.yLabel, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

const LAYER = {
  line(ctx, layer, layout) {
    strokePath(ctx, layer.points, layout, layer);
  },
  dots(ctx, layer, layout) {
    const n = layer.points.length;
    for (const [index, point] of layer.points.entries()) {
      const floor = layer.fadeFloor ?? 0.12;
      const alpha = layer.fade ? floor + (1 - floor) * ((index + 1) / n) : layer.alpha ?? 1;
      const x = layout.px(point[0]);
      const y = layout.py(point[1]);
      if (layer.halo) dot(ctx, x, y, (layer.radius ?? 2.2) * 2.6, layer.color, (layer.haloAlpha ?? 0.05) * alpha);
      if (layer.hollow) {
        ctx.beginPath();
        ctx.arc(x, y, layer.radius ?? 2.2, 0, Math.PI * 2);
        ctx.strokeStyle = withAlpha(layer.color, alpha);
        ctx.lineWidth = layer.lineWidth ?? 1;
        ctx.stroke();
      } else {
        dot(ctx, x, y, layer.radius ?? 2.2, layer.color, alpha);
        if (layer.outline) {
          // A dark rim keeps a dot readable where it sits on a curve of the same colour.
          ctx.beginPath();
          ctx.arc(x, y, (layer.radius ?? 2.2) + 0.6, 0, Math.PI * 2);
          ctx.strokeStyle = withAlpha(S.background, 0.9 * alpha);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }
  },
  pearl(ctx, layer, layout) {
    const x = layout.px(layer.point[0]);
    const y = layout.py(layer.point[1]);
    pearl(ctx, x, y, layer.color ?? S.goldCore, layer.core ?? '#FFFFFF', layer.radius ?? 3.2);
    if (layer.label) label(ctx, layer.label, x + 10, y + 12, { color: layer.color ?? S.goldCore, size: 12.5 });
  },
  vline(ctx, layer, layout) {
    const x = layout.px(layer.x);
    const { box } = layout;
    if (x < box.left || x > box.left + box.width) return;
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = withAlpha(S.text2, 0.7);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, box.top);
    ctx.lineTo(x, box.top + box.height);
    ctx.stroke();
    ctx.restore();
    if (layer.label) {
      const y = layer.labelOffset < 0 ? box.top + box.height + layer.labelOffset
        : layer.labelY === undefined ? box.top + (layer.labelOffset ?? 12) : layout.py(layer.labelY);
      layout.deferred.push(() => {
        const size = 12.5;
        font(ctx, size, { italic: true, serif: true });
        const width = ctx.measureText(layer.label).width;
        const right = box.left + box.width;
        const rightOfLine = x + 4;
        const leftOfLine = x - 4 - width;
        const start = rightOfLine + width > right && leftOfLine >= box.left
          ? leftOfLine : Math.max(box.left, Math.min(rightOfLine, right - width));
        label(ctx, layer.label, start, y, { size, alpha: 0.85 });
      });
    }
  },
  hline(ctx, layer, layout) {
    const y = layout.py(layer.y);
    const { box } = layout;
    if (y < box.top || y > box.top + box.height) return;
    ctx.save();
    ctx.setLineDash(layer.dash ?? []);
    ctx.strokeStyle = withAlpha(layer.color ?? S.text2, layer.alpha ?? 0.45);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(box.left, y);
    ctx.lineTo(box.left + box.width, y);
    ctx.stroke();
    ctx.restore();
    if (layer.label) label(ctx, layer.label, box.left + box.width + 5, y, { size: 12.5 });
  },
  band(ctx, layer, layout) {
    const a = layout.px(layer.x0);
    const b = layout.px(layer.x1);
    const { box } = layout;
    ctx.fillStyle = withAlpha(layer.color ?? S.blue, layer.alpha ?? 0.08);
    ctx.fillRect(Math.min(a, b), box.top, Math.abs(b - a), box.height);
    if (layer.label) label(ctx, layer.label, (a + b) / 2, box.top + box.height - 12, { size: 12, align: 'center', alpha: 0.8 });
  },
  text(ctx, layer, layout) {
    label(ctx, layer.text, layout.px(layer.x), layout.py(layer.y), { color: layer.color ?? S.text, size: layer.size ?? 13, align: layer.align ?? 'left', italic: layer.italic ?? true, serif: layer.serif ?? true });
  },
  stems(ctx, layer, layout) {
    for (const stem of layer.stems) {
      const x = layout.px(stem.x);
      ctx.strokeStyle = withAlpha(stem.color, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, layout.py(0));
      ctx.lineTo(x, layout.py(stem.y));
      ctx.stroke();
      pearl(ctx, x, layout.py(stem.y), stem.color, stem.color === S.gold ? S.goldCore : S.blueCore, 2.8);
      layout.deferred.push(() => label(ctx, stem.label, x, layout.box.top + layout.box.height + 8, { color: S.text2, size: 10.5, italic: false, serif: false, baseline: 'top', align: 'center', alpha: 1 }));
    }
  },
};

function drawHandles(ctx, model, layout, active) {
  for (const handle of model.handles ?? []) {
    const x = layout.px(handle.x);
    const y = layout.py(handle.y);
    const on = handle.id === active;
    const color = handle.color ?? S.blueCore;
    if (on) dot(ctx, x, y, 11, color, 0.12);
    ctx.beginPath();
    ctx.arc(x, y, on ? 5.5 : 4.6, 0, Math.PI * 2);
    ctx.fillStyle = S.background;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = on ? 1.8 : 1.2;
    ctx.stroke();
    if (handle.label) {
      const right = x > layout.box.left + layout.box.width * 0.7;
      label(ctx, handle.label, x + (right ? -10 : 10), y + (right ? -13 : 14), { color: handle.labelColor ?? S.text, size: 12.5, align: right ? 'right' : 'left' });
    }
  }
}

// Draws a model into rect. options: { activeHandle, background: true }.
export function drawPlot(ctx, model, rect, options = {}) {
  ctx.save();
  if (options.background !== false) {
    ctx.fillStyle = S.background;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  // A compact model (inside a card that already names it) shows only its subtitle.
  if (!model.compact) label(ctx, model.title, rect.x + 4, rect.y + 14, { size: 17, color: S.text, alpha: 1 });
  if (model.subtitle) label(ctx, model.subtitle, rect.x + 4, rect.y + (model.compact ? 10 : 34), { size: 10.5, italic: false, serif: false, color: S.text2, alpha: 1 });
  const layout = { ...plotLayout(model, rect), deferred: [] };
  drawAxes(ctx, model, layout);
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.box.left, layout.box.top - 6, layout.box.width + 80, layout.box.height + 12);
  ctx.clip();
  for (const layer of model.layers) LAYER[layer.type](ctx, layer, layout);
  ctx.restore();
  for (const draw of layout.deferred) draw();
  // Unclipped: category labels and handles may sit on the frame.
  drawHandles(ctx, model, layout, options.activeHandle ?? null);
  (model.footer ?? []).forEach((line, index) => {
    label(ctx, line.text, rect.x + 4, layout.footerTop + 8 + index * FOOTER_LINE, { size: 11, italic: false, serif: false, color: line.strong ? S.text : S.text2, alpha: 1 });
  });
  ctx.restore();
  return layout;
}

// ---------------------------------------------------------------------------
// Model helpers

function extent(values, pad = 0.08, floor = null) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return [0, 1];
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  lo -= span * pad;
  hi += span * pad;
  if (floor !== null) lo = Math.max(floor, lo);
  return [lo, hi];
}

const ms = value => (value === null || value === undefined ? '—' : `${round3(value)} ms`);
const sample = (lo, hi, n, f) => Array.from({ length: n + 1 }, (_, i) => {
  const x = lo + ((hi - lo) * i) / n;
  return [x, f(x)];
});

function entry(id, title, build) {
  return Object.freeze({
    id,
    title,
    build,
    draw: (ctx, model, rect, options) => drawPlot(ctx, model, rect, options),
    table: model => model.table,
    summary: model => model.summary,
  });
}

// ---------------------------------------------------------------------------
// Refractory restitution (site inspector)

// law: §A parameters or null (fixed ERP erpMs). dots: measure.restitutionDots.
// live: { diMs } for the current diastolic interval, or null.
// sinceMs: captures before the last edit of this site were made under other
// parameters; they are drawn faint and left out of the on-curve count.
export function restitutionModel({ siteLabel, law = null, erpMs = null, dots: allDots = [], live = null, diMaxMs = 600, sinceMs = null }) {
  // Captures before the player's last edit of this site no longer describe the
  // model, so they are dropped (creator decision 2026-11-27), not greyed out.
  const dots = sinceMs === null ? allDots : allDots.filter(d => d.tMs >= sinceMs);
  const f = di => (law === null ? erpMs : Math.min(law.erpMaxMs, Math.max(law.erpMinMs, law.erpMaxMs - law.amplitudeMs * Math.exp(-di / law.tauMs))));
  const xMax = Math.max(diMaxMs, ...allDots.map(d => d.diMs).filter(Number.isFinite).map(v => Math.min(v, 3000)));
  const curve = sample(0, xMax, 240, f);
  const yValues = [...curve.map(p => p[1]), ...allDots.map(d => d.erpMs)];
  let yDomain = extent(yValues, 0.14);
  if (law !== null && law.erpMinMs > yDomain[0] - 30 && law.erpMinMs < yDomain[0]) yDomain = [law.erpMinMs - 8, yDomain[1]];
  const layers = [{ type: 'line', points: curve, color: S.gold, width: 1.3, glow: true }];
  if (law !== null && law.erpMinMs >= yDomain[0] && law.erpMinMs < law.erpMaxMs - law.amplitudeMs) {
    layers.push({ type: 'hline', y: law.erpMinMs, dash: [3, 3], color: S.text2, alpha: 0.5 });
  }
  const recent = dots.slice(-120);
  layers.push({ type: 'dots', points: recent.map(d => [d.diMs, d.erpMs]), color: S.gold, radius: 4, fade: true, fadeFloor: 0.5, halo: true, haloAlpha: 0.18, outline: true });
  let liveErp = null;
  if (live && Number.isFinite(live.diMs)) {
    liveErp = f(Math.max(0, live.diMs));
    layers.push({ type: 'pearl', point: [Math.min(live.diMs, xMax), liveErp], label: 'now' });
  }
  const handles = law === null
    ? [{ id: 'erp', param: 'erpMs', axis: 'y', x: xMax, y: erpMs, value: erpMs, label: 'ERP' }]
    : [
      { id: 'erpMax', param: 'erpMaxMs', axis: 'y', x: xMax, y: law.erpMaxMs, value: law.erpMaxMs, label: 'E max' },
      { id: 'amplitude', param: 'amplitudeMs', axis: 'y', x: 0, y: law.erpMaxMs - law.amplitudeMs, value: law.amplitudeMs, label: 'E max − A', invert: true },
      { id: 'tau', param: 'tauMs', axis: 'x', x: law.tauMs, y: law.erpMaxMs - law.amplitudeMs / E, value: law.tauMs, label: 'tau' },
    ];
  if (law !== null && law.erpMinMs >= yDomain[0]) {
    handles.push({ id: 'erpMin', param: 'erpMinMs', axis: 'y', x: xMax * 0.8, y: law.erpMinMs, value: law.erpMinMs, label: 'E min' });
  }
  const slope = law === null || !live ? null : restitutionSlope(law, Math.max(0, live.diMs));
  const footer = law === null
    ? [{ text: `ERP  ${ms(erpMs)}  (no restitution)`, strong: true }]
    : [
      { text: `E max  ${ms(law.erpMaxMs)}     A  ${ms(law.amplitudeMs)}     tau  ${ms(law.tauMs)}     E min  ${ms(law.erpMinMs)}`, strong: true },
      { text: `${slope === null ? 'slope —' : `slope at current DI  ${slope.toFixed(2)}`}   ·   alternans needs slope > 1` },
    ];
  const lawAt = di => round3(f(di));
  const tableRows = dots.map(d => [round3(d.tMs), d.diMs, d.erpMs, lawAt(d.diMs)]);
  const off = dots.filter(d => Math.abs(d.erpMs - lawAt(d.diMs)) > 0.0015).length;
  const summary = law === null
    ? `${siteLabel}: fixed ERP of ${ms(erpMs)}; ${dots.length} captures.`
    : `${siteLabel}: ERP ${ms(law.erpMaxMs)} after a long rest, shortening by up to ${ms(law.amplitudeMs)} with tau ${ms(law.tauMs)}; ${dots.length === 0 && sinceMs !== null && sinceMs > 0 ? 'no captures yet since the last edit' : `${dots.length - off} of ${dots.length} captures${sinceMs !== null && sinceMs > 0 ? ' since the last edit' : ''} lie on the curve`}${liveErp === null ? '' : `; now ${ms(Math.round(liveErp))}`}.`;
  return {
    kind: 'restitution',
    title: `Site · ${siteLabel}`,
    subtitle: 'Refractory restitution · drag the handles or type values',
    xLabel: 'diastolic interval (ms)',
    yLabel: 'ERP (ms)',
    xDomain: [-xMax * 0.025, xMax * 1.03],
    yDomain,
    layers,
    handles,
    footer,
    law,
    live: liveErp === null ? null : { diMs: live.diMs, erpMs: liveErp },
    table: { caption: `Captures at ${siteLabel}`, columns: ['time (ms)', 'DI (ms)', 'ERP engine (ms)', 'ERP law (ms)'], rows: tableRows },
    summary,
  };
}

// ---------------------------------------------------------------------------
// Alternans cobweb at a fixed drive cycle

export function cobwebModel({ siteLabel, law, cycleMs, erps }) {
  const map = erp => Math.min(law.erpMaxMs, Math.max(law.erpMinMs, law.erpMaxMs - law.amplitudeMs * Math.exp(-(cycleMs - erp) / law.tauMs)));
  const lo = Math.max(law.erpMinMs, Math.min(...erps, law.erpMaxMs - law.amplitudeMs) - 10);
  const hi = law.erpMaxMs + 8;
  const path = [];
  for (let i = 0; i + 1 < erps.length; i++) {
    path.push([erps[i], erps[i]], [erps[i], erps[i + 1]]);
  }
  const tail = erps.slice(-6);
  const alternating = tail.length >= 4 && Math.abs(tail[tail.length - 1] - tail[tail.length - 2]) > 5 && Math.abs(tail[tail.length - 1] - tail[tail.length - 3]) < 1;
  return {
    kind: 'cobweb',
    title: `Alternans · ${siteLabel}`,
    subtitle: `ERP(n) against ERP(n+1) at a fixed drive of ${cycleMs} ms`,
    xLabel: 'ERP n (ms)',
    yLabel: 'ERP n+1 (ms)',
    xDomain: [lo, hi],
    yDomain: [lo, hi],
    square: true,
    layers: [
      { type: 'line', points: [[lo, lo], [hi, hi]], color: S.rule, width: 1 },
      { type: 'line', points: sample(lo, hi, 160, map), color: S.gold, width: 1.2, glow: true },
      { type: 'line', points: path, color: S.blue, width: 0.8, alpha: 0.7 },
      { type: 'dots', points: erps.slice(0, -1).map((e, i) => [e, erps[i + 1]]), color: S.blueCore, radius: 2, fade: true },
    ],
    table: { caption: `ERP sequence at ${siteLabel}`, columns: ['beat', 'ERP n (ms)', 'ERP n+1 (ms)'], rows: erps.slice(0, -1).map((e, i) => [i + 1, e, erps[i + 1]]) },
    summary: alternating
      ? `At ${cycleMs} ms the ERP alternates between ${ms(tail[tail.length - 2])} and ${ms(tail[tail.length - 1])}.`
      : `At ${cycleMs} ms the ERP settles at ${ms(tail[tail.length - 1])}.`,
  };
}

// ---------------------------------------------------------------------------
// Conduction restitution and decrement (link inspector)

// delayMs: the direction's current delay (with lesion); decrement and entry: laws or null.
// dots: measure.conductionDots for this direction.
export function conductionModel({ linkLabel, delayMs, decrement = null, entry = null, dots: allDots = [], live = null, xMaxMs = 700, sinceMs = null }) {
  // Launches before the last edit of this link are dropped (see restitutionModel).
  const dots = sinceMs === null ? allDots : allDots.filter(d => d.tMs >= sinceMs);
  const main = x => delayMs + (decrement ? decrement.maxExtraMs * Math.exp(-x / decrement.tauMs) : 0);
  const entryLine = x => delayMs + (entry ? entry.maxExtraMs * Math.exp(-x / entry.tauMs) : 0);
  const sourceDots = dots.filter(d => d.recoveryMs !== null).map(d => [Math.min(d.recoveryMs, xMaxMs), d.parts ? d.parts.baseMs + d.parts.lesionMs + d.parts.sourceMs : d.totalMs]);
  const entryDots = entry ? dots.filter(d => d.slackMs !== null && d.parts).map(d => [Math.min(d.slackMs, xMaxMs), d.parts.baseMs + d.parts.lesionMs + d.parts.entryMs]) : [];
  const top = delayMs + Math.max(decrement?.maxExtraMs ?? 0, entry?.maxExtraMs ?? 0);
  const yDomain = extent([delayMs, top, ...sourceDots.map(p => p[1]), ...entryDots.map(p => p[1])], 0.12);
  const layers = [{ type: 'line', points: sample(0, xMaxMs, 240, main), color: S.blue, width: 1.2, glow: true }];
  if (entry) layers.push({ type: 'line', points: sample(0, xMaxMs, 240, entryLine), color: S.blue, width: 0.9, alpha: 0.6, dash: [4, 4] });
  if (entryDots.length) layers.push({ type: 'dots', points: entryDots.slice(-150), color: S.blueCore, radius: 3.6, hollow: true, lineWidth: 1.6, fade: true, fadeFloor: 0.5 });
  layers.push({ type: 'dots', points: sourceDots.slice(-150), color: S.gold, radius: 3.8, halo: true, haloAlpha: 0.18, outline: true });
  if (live && Number.isFinite(live.recoveryMs)) layers.push({ type: 'pearl', point: [Math.min(live.recoveryMs, xMaxMs), main(live.recoveryMs)], label: 'now' });
  const handles = [{ id: 'delay', param: 'delayMs', axis: 'y', x: xMaxMs, y: delayMs, value: delayMs, label: 'delay' }];
  if (decrement) {
    handles.push(
      { id: 'decrementMax', param: 'decrement.maxExtraMs', axis: 'y', x: 0, y: delayMs + decrement.maxExtraMs, value: decrement.maxExtraMs, label: 'decrement', offset: delayMs },
      { id: 'decrementTau', param: 'decrement.tauMs', axis: 'x', x: decrement.tauMs, y: delayMs + decrement.maxExtraMs / E, value: decrement.tauMs, label: 'tau' },
    );
  }
  if (entry) {
    handles.push(
      { id: 'entryMax', param: 'entry.maxExtraMs', axis: 'y', x: xMaxMs * 0.02, y: delayMs + entry.maxExtraMs, value: entry.maxExtraMs, label: 'entry', offset: delayMs, color: S.blue },
      { id: 'entryTau', param: 'entry.tauMs', axis: 'x', x: entry.tauMs, y: delayMs + entry.maxExtraMs / E, value: entry.tauMs, label: 'entry tau', color: S.blue },
    );
  }
  const describe = law => (law ? `${ms(law.maxExtraMs)} · tau ${ms(law.tauMs)}` : 'none');
  const rows = dots.map(d => [round3(d.tMs), d.recoveryMs, d.parts?.sourceMs ?? null, d.slackMs, d.parts?.entryMs ?? null, d.totalMs]);
  const onLaw = dots.filter(d => d.parts && d.recoveryMs !== null && Math.abs(d.parts.sourceMs - decrementExtra(decrement, d.recoveryMs)) <= 0.0015).length;
  return {
    kind: 'conduction',
    title: `Link · ${linkLabel}`,
    subtitle: 'Conduction time against recovery · line = law, dots = engine',
    xLabel: 'recovery since ERP ended (ms)',
    yLabel: 'conduction time (ms)',
    xDomain: [-xMaxMs * 0.015, xMaxMs * 1.015],
    yDomain,
    layers,
    handles,
    footer: [
      { text: `delay ${ms(delayMs)}  ·  decrement ${describe(decrement)}`, strong: true },
      ...(entry ? [{ text: `entry ${describe(entry)}`, strong: true }] : []),
      { text: entry ? 'Open dots: entry against the destination\'s slack.' : 'Dots: base delay plus source decrement per launch.' },
    ],
    table: { caption: `Launches on ${linkLabel}`, columns: ['departure (ms)', 'recovery (ms)', 'decrement (ms)', 'slack (ms)', 'entry (ms)', 'total (ms)'], rows },
    summary: `${linkLabel}: ${ms(delayMs)} base, decrement ${describe(decrement)}, entry ${describe(entry)}; ${dots.length} launches${decrement ? `, ${onLaw} on the decrement curve` : ''}${sinceMs !== null && sinceMs > 0 ? ' since the last edit' : ''}.`,
  };
}

// ---------------------------------------------------------------------------
// S1–S2 curves

function couplingKey(result) {
  return result.columns.includes('s3Ms') && typeof result.protocol.s3 === 'object' ? 's3Ms' : 's2Ms';
}

function splitAtJump(points, jump) {
  if (!jump) return [points, []];
  return [points.filter(p => p[0] > jump.couplingMs), points.filter(p => p[0] <= jump.couplingMs)];
}

export function s1s2ConductionModel(result, { atriumLabel = 'septal atrium', outputLabel = 'His' } = {}) {
  const key = couplingKey(result);
  const points = result.rows.filter(r => r.a2h2Ms !== null).map(r => [r[key], r.a2h2Ms]);
  const jump = result.summary.jump;
  const [before, after] = splitAtJump(points, jump);
  const xs = result.rows.map(r => r[key]);
  const layers = [];
  for (const [segment, color] of [[before, S.gold], [after, S.blue]]) {
    if (!segment.length) continue;
    layers.push({ type: 'line', points: segment, color, width: 0.9, alpha: 0.6, glow: true });
    layers.push({ type: 'dots', points: segment, color, radius: 2.1 });
  }
  if (jump) {
    layers.push({ type: 'line', points: [[jump.fromCouplingMs, jump.fromMs], [jump.couplingMs, jump.toMs]], color: S.text, width: 0.7, alpha: 0.6, dash: [2, 2] });
    layers.push({ type: 'text', x: jump.couplingMs - (Math.max(...xs) - Math.min(...xs)) * 0.02, y: (jump.fromMs + jump.toMs) / 2, text: `+${Math.round(jump.jumpMs)} ms`, size: 14 });
  }
  const yDomain = extent(points.map(p => p[1]), 0.12);
  return {
    kind: 's1s2Conduction',
    title: 'S1–S2 · the jump',
    subtitle: `${atriumLabel} to ${outputLabel} · Drive ${result.protocol.driveCycleMs} ms`,
    xLabel: `A1–A2 (ms)`,
    yLabel: `A2–H2 (ms)`,
    xDomain: extent(points.map(p => p[0]), 0.03),
    yDomain,
    invertX: true,
    layers,
    table: { caption: 'S1–S2 conduction curve', columns: ['A1–A2 (ms)', 'A2–H2 (ms)'], rows: points },
    summary: jump ? `Jump of ${Math.round(jump.jumpMs)} ms at ${jump.couplingMs} ms.` : 'No jump: conduction time rises smoothly.',
  };
}

export function s1s2OutputModel(result, { output = 'h1h2Ms', outputLabel = 'H1–H2', erpSites = null } = {}) {
  const key = couplingKey(result);
  const points = result.rows.filter(r => r[output] !== null).map(r => [r[key], r[output]]);
  const jump = result.summary.jump;
  const [before, after] = splitAtJump(points, jump);
  const xs = result.rows.map(r => r[key]);
  const xDomain = extent([...xs, ...points.map(p => p[0])], 0.04);
  const yDomain = extent(points.map(p => p[1]), 0.1);
  const layers = [{ type: 'line', points: [[xDomain[0], xDomain[0]], [xDomain[1], xDomain[1]]], color: S.rule, width: 1 }];
  for (const [segment, color] of [[before, S.gold], [after, S.blue]]) {
    if (!segment.length) continue;
    layers.push({ type: 'line', points: segment, color, width: 0.8, alpha: 0.45, glow: true });
    layers.push({ type: 'dots', points: segment, color, radius: 2.2 });
  }
  const erps = Object.entries(result.summary.erps).filter(([id]) => erpSites === null || erpSites.includes(id));
  const sorted = erps.sort((a, b) => b[1].erpMs - a[1].erpMs);
  sorted.forEach(([, erp], index) => {
    // Use fixed row spacing so nearby thresholds stay legible as the plot resizes.
    const labelOffset = index === 0 ? 12 : -(12 + 16 * (sorted.length - 1 - index));
    layers.push({ type: 'vline', x: erp.erpMs, label: `${erp.label} ERP`, labelOffset });
  });
  const frp = result.summary.frp;
  const text = [
    ...sorted.map(([, erp]) => `${erp.label} ERP ${erp.erpMs}–${erp.upperMs ?? '?'} ms`),
    frp ? `FRP ${ms(frp.frpMs)}` : null,
  ].filter(Boolean);
  return {
    kind: 's1s2Output',
    title: 'S1–S2 · output against input',
    subtitle: `Drive ${result.protocol.driveCycleMs} ms at ${result.protocol.siteId} · Dashed ERP thresholds`,
    xLabel: 'A1–A2 (ms)',
    yLabel: `${outputLabel} (ms)`,
    xDomain,
    yDomain,
    layers,
    table: { caption: 'S1–S2 output curve', columns: ['A1–A2 (ms)', `${outputLabel} (ms)`], rows: points },
    summary: `${text.join('; ')}.`,
  };
}

// ---------------------------------------------------------------------------
// Incremental pacing

export function incrementalModel(result, { outputLabel = 'AH' } = {}) {
  const dots = [];
  for (const row of result.rows) {
    const values = new Set(String(row.sequenceMs).split(' ').filter(v => v !== 'x' && v !== '').map(Number));
    for (const value of values) dots.push([row.cycleMs, value, row.ratio]);
  }
  const conducted = dots.map(d => d[1]);
  const yDomain = extent(conducted, 0.18);
  const layers = [
    { type: 'line', points: result.rows.filter(r => r.ratio === '1:1').map(r => [r.cycleMs, r.steadyMs]), color: S.gold, width: 0.9, alpha: 0.6, glow: true },
    { type: 'dots', points: dots.filter(d => d[2] === '1:1'), color: S.gold, radius: 2.3 },
    { type: 'dots', points: dots.filter(d => d[2] !== '1:1'), color: S.blue, radius: 2.3 },
  ];
  // Label each new conduction ratio once, where it first appears.
  let previous = '1:1';
  let shown = 0;
  for (const row of result.rows) {
    if (row.ratio && row.ratio !== previous) {
      // Alternate two rows so neighbouring ratios 10 ms apart stay legible.
      const lift = (shown++ % 2) * 0.08;
      layers.push({ type: 'text', x: row.cycleMs, y: yDomain[1] - (yDomain[1] - yDomain[0]) * (0.06 + lift), text: row.ratio.replace(':', ' : '), size: 12, align: 'center', color: S.text2 });
    }
    previous = row.ratio;
  }
  const wb = result.summary.wenckebachCycleMs;
  if (wb !== null) layers.push({ type: 'vline', x: wb, label: 'Wenckebach', labelY: yDomain[0] + (yDomain[1] - yDomain[0]) * 0.12 });
  const rows = result.rows.map(r => [r.cycleMs, r.ratio, r.kind, r.sequenceMs]);
  return {
    kind: 'incremental',
    title: 'Incremental pacing',
    subtitle: `Engine runs · drive cycle against ${outputLabel}, ${result.protocol.beats ?? 24} beats per step`,
    xLabel: 'drive cycle (ms)',
    yLabel: `${outputLabel} (ms)`,
    xDomain: extent(result.rows.map(r => r.cycleMs), 0.05),
    yDomain,
    invertX: true,
    layers,
    table: { caption: 'Incremental pacing', columns: ['cycle (ms)', 'ratio', 'pattern', `${outputLabel} sequence (ms)`], rows },
    summary: result.text,
  };
}

// ---------------------------------------------------------------------------
// Resetting curve

export function resettingModel(result) {
  const tcl = result.summary.tclMs;
  const rows = result.rows.filter(r => r.captured && !r.terminated && r.returnMs !== null);
  const xs = result.rows.map(r => r.couplingMs);
  const xDomain = extent(xs, 0.05);
  const yDomain = extent([tcl, ...rows.map(r => r.returnMs), 2 * tcl - xDomain[1], tcl * 1.25], 0.08);
  const layers = [
    { type: 'hline', y: tcl, color: S.text2, alpha: 0.6, dash: [3, 3] },
    { type: 'line', points: [[xDomain[0], 2 * tcl - xDomain[0]], [xDomain[1], 2 * tcl - xDomain[1]]], color: S.text2, width: 0.8, alpha: 0.6, dash: [3, 3] },
    // The x axis runs from long to short coupling: the right edge is xDomain[0].
    { type: 'text', x: xDomain[0] + (xDomain[1] - xDomain[0]) * 0.02, y: tcl - (yDomain[1] - yDomain[0]) * 0.045, text: 'fully reset', size: 12, align: 'right', color: S.text2 },
  ];
  const yTop = yDomain[1] - (yDomain[1] - yDomain[0]) * 0.1;
  const xTop = Math.max(xDomain[0], Math.min(xDomain[1], 2 * tcl - yTop));
  layers.push({ type: 'text', x: xTop + (xDomain[1] - xDomain[0]) * 0.02, y: 2 * tcl - xTop, text: 'fully compensatory', size: 12, align: 'right', color: S.text2 });
  const window = result.summary.terminationWindowMs;
  if (window) layers.push({ type: 'band', x0: window[0] - 2, x1: window[1] + 2, label: 'terminates', color: S.blue, alpha: 0.1 });
  layers.push({ type: 'line', points: rows.map(r => [r.couplingMs, r.returnMs]), color: S.gold, width: 0.9, alpha: 0.6, glow: true });
  layers.push({ type: 'dots', points: rows.map(r => [r.couplingMs, r.returnMs]), color: S.gold, radius: 2.4 });
  return {
    kind: 'resetting',
    title: 'Resetting curve',
    subtitle: `Engine runs · extrastimulus at ${result.protocol.siteId} during a ${tcl} ms rhythm`,
    xLabel: 'coupling interval (ms)',
    yLabel: 'return cycle (ms)',
    xDomain,
    yDomain,
    invertX: true,
    layers,
    table: { caption: 'Resetting', columns: ['coupling (ms)', 'captured', 'return (ms)', 'terminated'], rows: result.rows.map(r => [r.couplingMs, r.captured, r.returnMs, r.terminated]) },
    summary: result.text,
  };
}

// ---------------------------------------------------------------------------
// Entrainment

// Per-site values for the network renderer: the gold return arc where |PPI − TCL| ≤ 20 ms.
export function entrainmentMapData(result, { nearMs = 20 } = {}) {
  const sites = {};
  for (const row of result.rows) {
    sites[row.siteId] = {
      ppiMinusTclMs: row.ppiMinusTclMs,
      captured: row.captured,
      near: row.captured && row.ppiMinusTclMs !== null && Math.abs(row.ppiMinusTclMs) <= nearMs,
    };
  }
  return sites;
}

export function entrainmentModel(result) {
  const rows = result.rows.filter(r => r.ppiMinusTclMs !== null);
  const stems = rows.map((r, i) => ({ x: i, y: r.ppiMinusTclMs, color: Math.abs(r.ppiMinusTclMs) <= 20 && r.captured ? S.gold : S.blue, label: r.siteId }));
  const yDomain = extent([0, 40, ...rows.map(r => r.ppiMinusTclMs)], 0.1);
  return {
    kind: 'entrainment',
    title: 'Entrainment · the return',
    subtitle: 'PPI − TCL at each pacing site · a lumped-element model, not a clinical criterion',
    xLabel: '',
    yLabel: 'PPI − TCL (ms)',
    xDomain: [-0.7, Math.max(0.7, rows.length - 0.3)],
    xTicks: [],
    yDomain,
    layers: [
      { type: 'band', x0: -0.7, x1: rows.length - 0.3, alpha: 0 },
      { type: 'hline', y: 20, dash: [2, 3], label: '20 ms' },
      { type: 'hline', y: 0, alpha: 0.4 },
      { type: 'stems', stems },
    ],
    table: { caption: 'Entrainment', columns: ['site', 'TCL (ms)', 'pacing cycle (ms)', 'captured', 'PPI (ms)', 'PPI − TCL (ms)'], rows: result.rows.map(r => [r.siteId, r.tclMs, r.pacingCycleMs, r.captured, r.ppiMs, r.ppiMinusTclMs]) },
    summary: result.text,
  };
}

// ---------------------------------------------------------------------------
// Phase response and staircase (Hemiola)

export function phaseResponseModel({ cycleMs, amplitude, dots, focusLabel = 'B' }) {
  const law = phase => cycleMs * amplitude * Math.sin(2 * Math.PI * phase);
  const span = Math.max(20, cycleMs * amplitude * 1.15);
  return {
    kind: 'phaseResponse',
    title: `Phase response · ${focusLabel}`,
    subtitle: `§D sine law (a ${amplitude}, T ${cycleMs} ms) · dots = every phase_modulated event`,
    xLabel: 'phase of input in the cycle',
    yLabel: 'shift of next beat (ms)',
    xDomain: [0, 1],
    yDomain: [-span, span],
    layers: [
      { type: 'hline', y: 0, alpha: 0.35 },
      { type: 'line', points: sample(0, 1, 200, law), color: S.blue, width: 1.2, glow: true },
      { type: 'dots', points: dots.slice(-200).map(d => [d.phase, d.shiftMs]), color: S.gold, radius: 2.3, fade: true },
    ],
    table: { caption: 'Phase modulation', columns: ['time (ms)', 'phase', 'shift (ms)'], rows: dots.map(d => [d.tMs, round3(d.phase), d.shiftMs]) },
    summary: `Inputs early in ${focusLabel}'s cycle delay it and late inputs advance it, by up to ${Math.round(cycleMs * amplitude)} ms; ${dots.length} events.`,
  };
}

export function staircaseModel(result, { current = null } = {}) {
  const points = result.rows.filter(r => r.ratio !== null).map(r => [r.amplitude, r.ratio]);
  const xDomain = [Math.min(...points.map(p => p[0])), Math.max(...points.map(p => p[0]))];
  const yDomain = extent(points.map(p => p[1]), 0.15);
  const fractions = [...new Set(result.summary.plateaus.filter(p => p.end > p.start).map(p => p.fraction))];
  const layers = fractions.map(fraction => {
    const [n, d] = fraction.split(':').map(Number);
    return { type: 'hline', y: n / d, label: fraction.replace(':', ' : '), alpha: 0.5 };
  });
  layers.push({ type: 'line', points, color: S.blue, width: 1, alpha: 0.9 });
  layers.push({ type: 'dots', points, color: S.blueCore, radius: 1.3, alpha: 0.7 });
  let currentText = '';
  if (current !== null) {
    const nearest = points.reduce((a, b) => (Math.abs(b[0] - current) < Math.abs(a[0] - current) ? b : a));
    layers.push({ type: 'pearl', point: [current, nearest[1]], color: S.gold, core: S.goldCore, radius: 4 });
    const fraction = simpleFraction(nearest[1], { tolerance: 0.004 });
    currentText = ` The current setting (a ${current}) gives ${fraction ? fraction.label : `a ratio of ${nearest[1]}`}.`;
  }
  return {
    kind: 'staircase',
    title: 'Staircase',
    subtitle: 'Engine sweep · driven beats per driver beat against coupling a',
    xLabel: 'coupling a',
    yLabel: 'locking ratio',
    xDomain,
    yDomain,
    rightMargin: 44,
    layers,
    table: { caption: 'Coupling sweep', columns: ['a', 'ratio', 'fraction'], rows: result.rows.map(r => [r.amplitude, r.ratio, r.fraction]) },
    summary: `${result.text}${currentText}`,
  };
}

// ---------------------------------------------------------------------------
// Return (Poincaré) plot

export function returnPlotModel({ intervals: values, siteLabel, title = null, subtitle = null, color = S.gold, maxPoints = 200, limits = null }) {
  const recent = values.slice(-(maxPoints + 1));
  const pairs = recent.slice(0, -1).map((v, i) => [v, recent[i + 1]]);
  const domain = limits ?? extent(recent, 0.25);
  const distinct = new Set(pairs.map(p => `${Math.round(p[0])},${Math.round(p[1])}`)).size;
  const spread = recent.length ? Math.max(...recent) - Math.min(...recent) : 0;
  let shape = 'no intervals yet';
  if (pairs.length) {
    if (spread < 4) shape = `a tight cluster at ${Math.round(median(recent))} ms`;
    else if (distinct <= 8) shape = `a closed set of ${distinct} points`;
    else shape = `a spread of ${Math.round(spread)} ms`;
  }
  return {
    kind: 'returnPlot',
    title: title ?? `Return plot · ${siteLabel}`,
    subtitle: subtitle ?? 'Interval n against interval n+1 · last 200, points fade with age',
    xLabel: 'interval n (ms)',
    yLabel: 'interval n+1 (ms)',
    xDomain: domain,
    yDomain: domain,
    square: true,
    layers: [
      { type: 'line', points: [[domain[0], domain[0]], [domain[1], domain[1]]], color: S.rule, width: 1 },
      { type: 'dots', points: pairs, color, radius: 2.4, fade: true, halo: true },
    ],
    table: { caption: `Intervals at ${siteLabel}`, columns: ['n', 'interval n (ms)', 'interval n+1 (ms)'], rows: pairs.map((p, i) => [i + 1, p[0], p[1]]) },
    summary: `${siteLabel}: ${pairs.length} interval pairs form ${shape}.`,
  };
}

// ---------------------------------------------------------------------------
// Catalog (spec, "Plot catalog", plus the Lab panels)

export const PLOT_CATALOG = Object.freeze({
  restitution: entry('restitution', 'Refractory restitution', restitutionModel),
  cobweb: entry('cobweb', 'Alternans cobweb', cobwebModel),
  conduction: entry('conduction', 'Conduction restitution and decrement', conductionModel),
  s1s2Conduction: entry('s1s2Conduction', 'S1–S2 conduction curve', s1s2ConductionModel),
  s1s2Output: entry('s1s2Output', 'S1–S2 output against input', s1s2OutputModel),
  incremental: entry('incremental', 'Incremental pacing', incrementalModel),
  resetting: entry('resetting', 'Resetting curve', resettingModel),
  entrainment: entry('entrainment', 'Entrainment map', entrainmentModel),
  phaseResponse: entry('phaseResponse', 'Phase response', phaseResponseModel),
  staircase: entry('staircase', 'Staircase', staircaseModel),
  returnPlot: entry('returnPlot', 'Return plot', returnPlotModel),
});

// Renders a model's table as an accessible HTML table (string), for the
// data-table alternative next to each canvas.
export function tableHtml(table) {
  const esc = value => String(value ?? '—').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const head = table.columns.map(c => `<th scope="col">${esc(c)}</th>`).join('');
  const body = table.rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('');
  return `<table><caption>${esc(table.caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

