// Shared helpers for the Study No. 2 view modules (Ladder, Staves, Map, Network marks).
// Everything here is pure or draws with a caller supplied Canvas 2D context in CSS pixels.
// Alpha is applied through ctx.globalAlpha so no colour strings are built per frame.

export const TURN = Math.PI * 2;

export const PALETTE = Object.freeze({
  ground: '#080C13',
  deep: '#111D2B',
  band: '#0C1520',
  rule: '#1B2736',
  gold: '#C8A878',
  goldCore: '#FFF1D1',
  blue: '#83A9C8',
  blueCore: '#D9F1FF',
  text: '#E3DED5',
  text2: '#9CA9B8',
  input: '#B0BCC6',
});

export function mergePalette(palette) {
  return palette ? { ...PALETTE, ...palette } : PALETTE;
}

export const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
export const mix = (a, b, t) => a + (b - a) * t;
export const ease = (value) => value * value * (3 - 2 * value);

// First index in a sorted array whose key(item) >= value.
export function lowerBound(items, value, key) {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (key(items[mid]) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// System fonts only (handoff §8.1: no external font requests). Strings are cached by size.
const fontCache = new Map();
function cachedFont(prefix, size, family) {
  const key = `${prefix}${size}`;
  let font = fontCache.get(key);
  if (!font) {
    font = `${prefix}${size}px ${family}`;
    if (fontCache.size > 64) fontCache.clear();
    fontCache.set(key, font);
  }
  return font;
}
export const serifItalic = (size) => cachedFont('italic ', size, 'ui-serif, Georgia, "Times New Roman", serif');
export const sans = (size) => cachedFont('', size, 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif');

// A line with the soft plate glow: three wide faint passes under a crisp core.
export function glowLine(ctx, x0, y0, x1, y1, color, width, alpha) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = width * 5.5;
  ctx.globalAlpha = alpha * 0.045;
  ctx.stroke();
  ctx.lineWidth = width * 3.2;
  ctx.globalAlpha = alpha * 0.1;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha * 0.92;
  ctx.stroke();
}

export function fillCircle(ctx, x, y, radius, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TURN);
  ctx.fill();
}

export function strokeCircle(ctx, x, y, radius, color, width, alpha) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TURN);
  ctx.stroke();
}

export function strokeArc(ctx, x, y, radius, start, end, color, width, alpha) {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, radius, start, end);
  ctx.stroke();
}

// Luminous pearl: faint halo rings, solid body, small bright core.
export function pearl(ctx, x, y, radius, color, core, alpha) {
  fillCircle(ctx, x, y, radius * 3.6, color, alpha * 0.035);
  fillCircle(ctx, x, y, radius * 2.3, color, alpha * 0.07);
  fillCircle(ctx, x, y, radius * 1.5, color, alpha * 0.12);
  fillCircle(ctx, x, y, radius, color, alpha);
  fillCircle(ctx, x - radius * 0.1, y - radius * 0.1, radius * 0.42, core, alpha * 0.95);
}

// Open ring for silent (model-only) sites: ground filled, thin light rim.
export function openRing(ctx, x, y, radius, ground, rim, alpha) {
  fillCircle(ctx, x, y, radius, ground, alpha);
  strokeCircle(ctx, x, y, radius, rim, 1, alpha * 0.82);
}

// Prepare a canvas context for DPR-aware drawing in CSS pixels. DPR is capped like the Network renderer.
export function applyDpr(ctx, dpr) {
  if (dpr) {
    const ratio = Math.min(2.5, Math.max(1, dpr));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

export function sizeCanvas(canvas, cssWidth, cssHeight, dpr = 1) {
  const ratio = Math.min(2.5, Math.max(1, dpr));
  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round(cssHeight * ratio);
  return ratio;
}

export const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Memoise a derivation on (events array identity, length). Callers pass the retained history array,
// which grows by appending; a fresh array every frame defeats the cache but stays correct.
export function memoByEvents(derive) {
  let events = null;
  let length = -1;
  let extra = null;
  let value = null;
  return (list, key) => {
    if (list !== events || list.length !== length || key !== extra) {
      value = derive(list, key);
      events = list;
      length = list.length;
      extra = key;
    }
    return value;
  };
}
