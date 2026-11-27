import { createNetworkMarks } from './marks.js';

const GROUND = '#080C13';
const BRASS = '#C8A878';
const ICE = '#83A9C8';
const FLASH = '#FFF1D1';
const COOL_FLASH = '#D9F1FF';
const INPUT = '#B0BCC6';
const TURN = Math.PI * 2;
const SAMPLES = 64;
const GLYPH_LIFETIME = 74;
const HIT_RADIUS = 22;
const CROSSING_EPSILON = 1e-7;
const ECHOES = [
  { offset: -1.02, twist: 0.5, width: 0.44, alpha: 0.36 },
  { offset: -0.46, twist: -0.78, width: 0.51, alpha: 0.31 },
  { offset: 0.40, twist: 0.57, width: 0.51, alpha: 0.42 },
  { offset: 1.12, twist: -0.62, width: 0.44, alpha: 0.34 },
];

const clamp = (value) => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (value) => value * value * (3 - 2 * value);

// Node positions and cubic handles are relative to the center and stage radius.
const SCULPTURES = {
  conduction: {
    nodes: {
      S: [-0.30, -1.08, ICE], A: [-0.09, -0.59, ICE], N: [0.20, -0.14, ICE],
      H: [0.02, 0.32, ICE], V1: [-0.60, 1.08, BRASS], V2: [0.76, 0.94, BRASS],
    },
    handles: {
      SA: [-0.31, -0.86, -0.10, -0.78], AN: [-0.08, -0.35, 0.19, -0.36],
      NH: [0.24, 0.04, 0.00, 0.14], HV1: [0.02, 0.59, -0.60, 0.80],
      HV2: [0.03, 0.57, 0.71, 0.72],
    },
  },
  duality: {
    nodes: {
      A: [-0.96, -0.62, BRASS], A1: [-0.57, 0.61, BRASS], A2: [0.37, 0.36, BRASS],
      B: [0.65, -0.60, ICE], B1: [-0.23, -0.16, ICE], B2: [0.87, 0.75, ICE],
    },
    handles: {
      AA1: [-0.96, -0.12, -0.89, 0.51], AA2: [-0.88, -0.16, -0.14, 0.16],
      BB1: [0.62, -0.28, 0.13, -0.14], BB2: [0.63, -0.16, 0.55, 0.54],
    },
  },
};

function cubicPosition(start, end, handle1, handle2, u, offset) {
  const v = 1 - u;
  const x = v ** 3 * start.x + 3 * v * v * u * handle1.x + 3 * v * u * u * handle2.x + u ** 3 * end.x;
  const y = v ** 3 * start.y + 3 * v * v * u * handle1.y + 3 * v * u * u * handle2.y + u ** 3 * end.y;
  const dx = v * v * (handle1.x - start.x) + 2 * v * u * (handle2.x - handle1.x) + u * u * (end.x - handle2.x);
  const dy = v * v * (handle1.y - start.y) + 2 * v * u * (handle2.y - handle1.y) + u * u * (end.y - handle2.y);
  const magnitude = Math.hypot(dx, dy) || 1;
  return { x: x - offset * dy / magnitude, y: y + offset * dx / magnitude };
}

function cssColor(hex, opacity) {
  return `${hex}${Math.round(clamp(opacity) * 255).toString(16).padStart(2, '0')}`;
}

function makeCurve(positionAt) {
  const points = [{ ...positionAt(0), distance: 0 }];
  for (let i = 1; i <= SAMPLES; i += 1) {
    const position = positionAt(i / SAMPLES);
    const previous = points[i - 1];
    points.push({
      ...position,
      distance: previous.distance + Math.hypot(position.x - previous.x, position.y - previous.y),
    });
  }
  return { points, length: points[SAMPLES].distance };
}

function atFraction(curve, fraction) {
  const target = curve.length * clamp(fraction);
  let first = 0;
  let last = SAMPLES;
  while (last - first > 1) {
    const middle = Math.floor((first + last) / 2);
    if (curve.points[middle].distance < target) first = middle;
    else last = middle;
  }
  const a = curve.points[first];
  const b = curve.points[last];
  const t = (target - a.distance) / (b.distance - a.distance || 1);
  return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) };
}

function awayFromNodes(x, y, from, to, clearance) {
  return Math.hypot(x - from.x, y - from.y) > clearance && Math.hypot(x - to.x, y - to.y) > clearance;
}

function crossesAtJoin(points, start, end, previous) {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const length = b.distance - a.distance;
    if (!length) continue;
    const dx = (b.x - a.x) / length;
    const dy = (b.y - a.y) / length;
    const x = start.x - a.x;
    const y = start.y - a.y;
    const along = dx * x + dy * y;
    if (Math.abs(dx * y - dy * x) > CROSSING_EPSILON
        || along < -CROSSING_EPSILON || along >= length - CROSSING_EPSILON) continue;

    const before = along > CROSSING_EPSILON ? a : points[i - 2];
    if (!before) continue;
    const forwardAngle = Math.atan2(b.y - start.y, b.x - start.x);
    const angleFromForward = ({ x, y }) => (Math.atan2(y - start.y, x - start.x) - forwardAngle + TURN) % TURN;
    const backwardAngle = angleFromForward(before);
    const entryAngle = angleFromForward(previous);
    const exitAngle = angleFromForward(end);
    // The two gesture legs must alternate with the two path legs around the join.
    const onPath = (angle) => angle <= CROSSING_EPSILON || angle >= TURN - CROSSING_EPSILON
      || Math.abs(angle - backwardAngle) <= CROSSING_EPSILON;
    if (!onPath(entryAngle) && !onPath(exitAngle) && (entryAngle < backwardAngle) !== (exitAngle < backwardAngle)) {
      return true;
    }
  }
  return false;
}

function firstCrossing(curve, gesture, from, to, previousSample) {
  const { start, dx, dy, length } = gesture;
  const nodeClearance = Math.min(HIT_RADIUS, curve.length / 3);
  if (previousSample && awayFromNodes(start.x, start.y, from, to, nodeClearance)
      && crossesAtJoin(curve.points, start, gesture.end, previousSample)) return 0;
  let previous;
  let previousSide = 0;
  let pointOnLine;
  let pointsOnLine = 0;
  let first = Infinity;
  for (const point of curve.points) {
    const side = dx * (point.y - start.y) - dy * (point.x - start.x);
    if (Math.abs(side) <= CROSSING_EPSILON) {
      pointOnLine = point;
      pointsOnLine += 1;
      continue;
    }
    // A single vertex on the swipe counts if the sides change. A tangent or
    // a segment following the filament doesn't cross it.
    if (previousSide * side < 0 && pointsOnLine <= 1) {
      const t = previousSide / (previousSide - side);
      const x = pointsOnLine ? pointOnLine.x : mix(previous.x, point.x, t);
      const y = pointsOnLine ? pointOnLine.y : mix(previous.y, point.y, t);
      const along = dx * (x - start.x) + dy * (y - start.y);
      if (along > CROSSING_EPSILON && along < length - CROSSING_EPSILON
          && awayFromNodes(x, y, from, to, nodeClearance)) {
        first = Math.min(first, along);
      }
    }
    previous = point;
    previousSide = side;
    pointsOnLine = 0;
  }
  return first;
}

// Tissue colours for study layouts: warm for the atrial and ventricular "staves",
// cool for the conduction system (handoff §8.1).
const TISSUE_COLOR = { sinus: BRASS, atrial: BRASS, ventricular: BRASS, nodal: ICE, hisPurkinje: ICE, accessory: ICE };

// A study layout ({ siteId: [x, y] } relative to the centre and stage radius,
// from the study presentation) becomes a sculpture: each link bows gently away
// from the centroid so parallel pathways read as separate filaments.
function sculptureFromLayout(world, layout) {
  const nodes = {};
  for (const node of world.nodes) {
    const [x, y] = layout[node.id];
    nodes[node.id] = [x, y, TISSUE_COLOR[node.tissue] ?? BRASS];
  }
  const ids = Object.keys(nodes);
  const gx = ids.reduce((sum, id) => sum + nodes[id][0], 0) / ids.length;
  const gy = ids.reduce((sum, id) => sum + nodes[id][1], 0) / ids.length;
  const handles = {};
  for (const link of world.links) {
    const [ax, ay] = nodes[link.a];
    const [bx, by] = nodes[link.b];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    let nx = -(by - ay);
    let ny = bx - ax;
    const length = Math.hypot(nx, ny) || 1;
    nx /= length;
    ny /= length;
    if (nx * (mx - gx) + ny * (my - gy) < 0) { nx = -nx; ny = -ny; }
    const bow = 0.1 * length;
    handles[link.id] = [
      ax + (bx - ax) / 3 + nx * bow, ay + (by - ay) / 3 + ny * bow,
      ax + 2 * (bx - ax) / 3 + nx * bow, ay + 2 * (by - ay) / 3 + ny * bow,
    ];
  }
  return { nodes, handles, linkColor: 'end' };
}

function makeGeometry(world, width, height, layout = null) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.33;
  const filamentSpread = Math.max(4, Math.min(12, radius * 0.056));
  const isRing = world.nodes.length === 8 && world.nodes.every(({ id }) => /^R[0-7]$/.test(id));
  const sculpture = layout ? sculptureFromLayout(world, layout)
    : Object.hasOwn(SCULPTURES, world.worldId) ? SCULPTURES[world.worldId] : null;
  const stagePoint = (x, y) => ({ x: cx + x * radius, y: cy + y * radius });
  const nodes = new Map(world.nodes.map(({ id }, index) => {
    const placement = sculpture?.nodes[id];
    if (Array.isArray(placement)) {
      const [x, y, color] = placement;
      return [id, { ...stagePoint(x, y), angle: Math.atan2(y, x), color, silent: world.nodes[index].audible === false }];
    }
    const angle = (isRing ? Number(id.slice(1)) : index) * TURN / world.nodes.length - Math.PI / 2;
    return [id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius,
      angle, color: Math.cos(angle) > 0.08 ? ICE : BRASS }];
  }));
  const links = new Map(world.links.map(({ id, a, b, enabled }) => {
    const start = nodes.get(a);
    const end = nodes.get(b);
    const sweep = Math.atan2(Math.sin(end.angle - start.angle), Math.cos(end.angle - start.angle));
    const handles = sculpture?.handles[id];
    const hasHandles = Array.isArray(handles);
    const handle1 = hasHandles ? stagePoint(handles[0], handles[1]) : null;
    const handle2 = hasHandles ? stagePoint(handles[2], handles[3]) : null;
    const color = hasHandles ? end.color : (Math.cos(start.angle + sweep / 2) > 0.08 ? ICE : BRASS);
    const positionAt = (u, offset = 0) => {
      if (isRing) {
        const theta = start.angle + sweep * u;
        return { x: cx + Math.cos(theta) * (radius + offset), y: cy + Math.sin(theta) * (radius + offset) };
      }
      if (hasHandles) return cubicPosition(start, end, handle1, handle2, u, offset);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: mix(start.x, end.x, u) - dy * offset / length,
        y: mix(start.y, end.y, u) + dx * offset / length };
    };
    return [id, { a, b, enabled, color, curve: makeCurve(positionAt),
      echoes: ECHOES.map((thread, i) => ({
        ...thread,
        color: i === 1 || i === 3 ? (color === BRASS ? ICE : BRASS) : color,
        curve: makeCurve((u) => positionAt(u, filamentSpread * Math.sin(Math.PI * u)
          * (thread.offset + thread.twist * Math.sin(TURN * u + start.angle + i * 0.43)))),
      })),
    }];
  }));
  return { nodes, links, cx, cy, radius };
}

function strokeCurve(ctx, curve, start, end, color, width) {
  const a = atFraction(curve, start);
  const b = atFraction(curve, end);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  for (const point of curve.points) {
    const fraction = point.distance / curve.length;
    if (fraction > start && fraction < end) ctx.lineTo(point.x, point.y);
  }
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function dot(ctx, x, y, radius, color) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TURN);
  ctx.fillStyle = color;
  ctx.fill();
}

function arc(ctx, x, y, radius, start, end, color, width = 1) {
  ctx.beginPath();
  ctx.arc(x, y, radius, start, end);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function halo(ctx, x, y, radius, color, intensity) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, cssColor(color, intensity));
  glow.addColorStop(0.33, cssColor(color, intensity * 0.29));
  glow.addColorStop(1, cssColor(color, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function drawBackdrop(ctx, geometry, links, width, height) {
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, width, height);
  const { cx, cy, radius } = geometry;
  const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.65);
  ambient.addColorStop(0, '#090D15');
  ambient.addColorStop(0.53, '#0A1019');
  ambient.addColorStop(0.65, '#0D1520');
  ambient.addColorStop(0.83, '#090F17');
  ambient.addColorStop(1, GROUND);
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, width, height);

  ctx.lineCap = 'round';
  for (const [id, link] of geometry.links) {
    const enabled = links[id]?.enabled ?? link.enabled;
    const gap = Math.min(0.31, 8 / link.curve.length);
    const spans = enabled ? [[0, 1]] : [[0, 0.5 - gap], [0.5 + gap, 1]];
    const dim = enabled ? 1 : 0.53;
    for (const [start, end] of spans) {
      for (const thread of link.echoes) {
        strokeCurve(ctx, thread.curve, start, end, cssColor(thread.color, thread.alpha * dim), thread.width);
      }
      strokeCurve(ctx, link.curve, start, end, cssColor(link.color, 0.09 * dim), 3.5);
      strokeCurve(ctx, link.curve, start, end, cssColor(link.color, 0.68 * dim), 0.89);
    }
    if (!enabled) {
      for (const fraction of [0.5 - gap, 0.5 + gap]) {
        const point = atFraction(link.curve, fraction);
        dot(ctx, point.x, point.y, 1.07, cssColor(link.color, 0.72));
      }
    }
  }
}

function drawTransit(ctx, link, transit, tMs, reducedMotion) {
  const progress = (tMs - transit.departureMs) / (transit.arrivalMs - transit.departureMs);
  if (progress < 0 || progress >= 1) return;
  if (reducedMotion) {
    strokeCurve(ctx, link.curve, 0, 1, cssColor(link.color, 0.83), 1.5);
    const endpoint = atFraction(link.curve, transit.fromNodeId === link.a ? 0 : 1);
    dot(ctx, endpoint.x, endpoint.y, 1.9, cssColor(link.color, 0.92));
    return;
  }
  const forward = transit.fromNodeId === link.a;
  for (let i = 0; i < 8; i += 1) {
    const start = Math.max(0, progress - 0.23 + 0.23 * (i / 8));
    const end = Math.max(0, progress - 0.23 + 0.23 * ((i + 1) / 8));
    if (start >= end) continue;
    const opacity = (i + 1) / 8;
    const from = forward ? start : 1 - end;
    const to = forward ? end : 1 - start;
    strokeCurve(ctx, link.curve, from, to, cssColor(link.color, 0.23 * opacity), 2.4 + 1.2 * opacity);
    strokeCurve(ctx, link.curve, from, to, cssColor(link.color, 0.72 * opacity), 0.8 + opacity);
  }
  const head = atFraction(link.curve, forward ? progress : 1 - progress);
  halo(ctx, head.x, head.y, 13, link.color, 0.49);
  dot(ctx, head.x, head.y, 2.4, link.color === BRASS ? FLASH : COOL_FLASH);
}

function drawNode(ctx, node, state) {
  const { x, y, color } = node;
  const recovery = ease(clamp(state?.recovery ?? 1));
  const excitable = state?.excitable ?? true;
  const edge = excitable ? 0.23 : 0.13;
  const core = color === BRASS ? FLASH : COOL_FLASH;
  if (node.silent) {
    // Silent tissue (audible: false) is an open ring, as in the Ladder view.
    dot(ctx, x, y, 3.6, GROUND);
    halo(ctx, x, y, 9, color, 0.05 + recovery * 0.14);
    arc(ctx, x, y, 3.4 + recovery * 0.9, 0, TURN, cssColor(color, 0.3 + recovery * 0.34), 0.8);
    return;
  }
  dot(ctx, x, y, 2.8, GROUND);
  halo(ctx, x, y, 11.5, color, 0.10 + recovery * 0.30);
  arc(ctx, x, y, 4.3 + recovery * 1.5, 0, TURN, cssColor(color, edge + recovery * 0.24), 0.72);
  dot(ctx, x, y, 1.27 + recovery * 1.19, cssColor(color, 0.37 + recovery * 0.63));
  if (recovery > 0) dot(ctx, x - 0.42, y - 0.51, 0.72, cssColor(core, recovery * 0.91));
}

function drawEvent(ctx, geometry, event, tMs, reducedMotion) {
  const age = tMs - event.tMs;
  const node = geometry.nodes.get(event.nodeId);
  if (event.type === 'activation' && age < 54 && node) {
    const t = age / 54;
    const flash = (1 - t) ** 2.7;
    const color = node.color === BRASS ? FLASH : COOL_FLASH;
    halo(ctx, node.x, node.y, 17, color, 0.78 * flash);
    dot(ctx, node.x, node.y, 3.1, cssColor(color, flash));
    arc(ctx, node.x, node.y, reducedMotion ? 9 : 7.5 + 11 * ease(t), 0, TURN,
      cssColor(color, 0.85 * (1 - t) ** 1.6), 0.95);
  }
  if (event.type === 'activation_blocked' && node) {
    const { x, y, angle } = node;
    const toward = event.incomingLinkIds.map((id) => {
      const link = geometry.links.get(id);
      if (!link) return null;
      const near = atFraction(link.curve, link.a === event.nodeId ? 0.12 : 0.88);
      return Math.atan2(near.y - y, near.x - x);
    }).filter((direction) => direction !== null);
    if (toward.length === 0) toward.push(angle);
    const distance = reducedMotion ? 0 : 5 * ease(age / GLYPH_LIFETIME);
    const opacity = (1 - age / GLYPH_LIFETIME) ** 1.6;
    for (const direction of toward) {
      arc(ctx, x, y, 8.2 + distance, direction - 0.53, direction + 0.53, cssColor(COOL_FLASH, 0.92 * opacity), 1.2);
      arc(ctx, x, y, 12.4 + distance, direction - 0.43, direction + 0.43, cssColor(COOL_FLASH, 0.7 * opacity), 1);
    }
  }
  if (event.type === 'conduction_collision' || event.type === 'conduction_canceled') {
    const link = geometry.links.get(event.linkId);
    if (!link) return;
    const { x, y } = atFraction(link.curve, event.position);
    const t = age / GLYPH_LIFETIME;
    const opacity = (1 - t) ** 1.8;
    if (event.type === 'conduction_collision') {
      const radius = reducedMotion ? 6.2 : 4.4 + ease(t) * 8;
      arc(ctx, x, y, radius, 0, TURN, cssColor(COOL_FLASH, opacity * 0.92), 1.05);
      halo(ctx, x, y, 12, FLASH, opacity * 0.31);
    } else {
      arc(ctx, x, y, 5.6, -1.39, -0.02, cssColor(INPUT, opacity * 0.66));
      arc(ctx, x, y, 5.6, 1.75, 3.12, cssColor(INPUT, opacity * 0.66));
    }
  }
}

// Small open ring beside an element whose parameters differ from the study default.
function drawModified(ctx, x, y) {
  arc(ctx, x, y, 3.1, 0, TURN, cssColor(FLASH, 0.78), 0.9);
}

export function createRenderer(canvas, world, { reducedMotion = false, layout = null } = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Counterpoint requires Canvas 2D.');
  const backdropCanvas = canvas.ownerDocument.createElement('canvas');
  const backdrop = backdropCanvas.getContext('2d', { alpha: false });
  if (!backdrop) throw new Error('Counterpoint requires a Canvas 2D backdrop.');
  const gestures = new Map();
  let geometry;
  let width = 1;
  let height = 1;
  let ratio = 1;
  let backdropKey;
  let network;
  let overlay = null;
  let modified = { nodes: new Set(), links: new Set() };
  let selected = null;
  let dim = 0;

  // Adapter the Study No. 2 marks (marks.js) use to reach this renderer's geometry.
  const adapter = {
    nodePoint: (id) => { const node = geometry.nodes.get(id); return node ? { x: node.x, y: node.y } : null; },
    linkColor: (id) => geometry.links.get(id)?.color ?? BRASS,
    linkPoint: (id, u) => { const link = geometry.links.get(id); return link ? atFraction(link.curve, u) : null; },
    strokeLink: (ctx, id, u0, u1, color, lineWidth, alpha) => {
      const link = geometry.links.get(id);
      if (!link) return;
      ctx.globalAlpha = alpha ?? 1;
      strokeCurve(ctx, link.curve, clamp(Math.min(u0, u1)), clamp(Math.max(u0, u1)), color, lineWidth);
      ctx.globalAlpha = 1;
    },
  };

  function resize(cssWidth, cssHeight, dpr) {
    const size = canvas.getBoundingClientRect();
    const nextWidth = Math.max(1, cssWidth ?? size.width);
    const nextHeight = Math.max(1, cssHeight ?? size.height);
    const nextRatio = Math.min(2, Math.max(1, dpr ?? canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1));
    if (geometry && width === nextWidth && height === nextHeight && ratio === nextRatio) return;
    width = nextWidth;
    height = nextHeight;
    ratio = nextRatio;
    backdropCanvas.width = canvas.width = Math.round(width * ratio);
    backdropCanvas.height = canvas.height = Math.round(height * ratio);
    geometry = makeGeometry(world, width, height, layout);
    network = createNetworkMarks({ world, geometry: adapter, reducedMotion });
    backdropKey = null;
  }

  function render(snapshot, events = [], tMs = snapshot.tMs) {
    const enabledKey = [...geometry.links].map(([id, link]) => (snapshot.links[id]?.enabled ?? link.enabled) ? '1' : '0').join('');
    if (backdropKey !== enabledKey) {
      backdrop.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawBackdrop(backdrop, geometry, snapshot.links, width + 1, height + 1);
      backdropKey = enabledKey;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(backdropCanvas, 0, 0);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = 'round';
    if (dim > 0) {
      // Stillness: the ground dims by up to 6% at the agent's peak. Nothing else changes.
      ctx.fillStyle = cssColor('#000000', 0.06 * dim);
      ctx.fillRect(0, 0, width + 1, height + 1);
    }

    for (const [id, node] of geometry.nodes) drawNode(ctx, node, snapshot.nodes[id]);
    // The selected site (last touched or inspected) wears a quiet gold halo.
    const chosen = selected ? geometry.nodes.get(selected) : null;
    if (chosen) {
      arc(ctx, chosen.x, chosen.y, 15, 0, TURN, cssColor('#d6b880', 0.85), 1.2);
      arc(ctx, chosen.x, chosen.y, 19.5, 0, TURN, cssColor('#d6b880', 0.25), 0.8);
    }
    for (const id of modified.nodes) {
      const node = geometry.nodes.get(id);
      if (node) drawModified(ctx, node.x + 9, node.y - 9);
    }
    for (const id of modified.links) {
      const link = geometry.links.get(id);
      if (!link) continue;
      const point = atFraction(link.curve, 0.5);
      drawModified(ctx, point.x, point.y);
    }
    for (const transit of snapshot.activeTransits) {
      const link = geometry.links.get(transit.linkId);
      if (link && !network.drawConcealedTransit(ctx, transit, tMs, events)) drawTransit(ctx, link, transit, tMs, reducedMotion);
    }

    // History is ordered by time and may include the committed lookahead.
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (event.tMs > tMs || event.runId !== snapshot.runId) continue;
      if (event.tMs <= tMs - GLYPH_LIFETIME) break;
      if (!(event.type === 'activation_blocked' && network.isConcealedBlock(events, event.eventId))) {
        drawEvent(ctx, geometry, event, tMs, reducedMotion);
      }
      if (event.type === 'stimulus_attempted') gestures.delete(event.triggerId);
    }
    network.draw(ctx, tMs, events);
    ctx.globalAlpha = 1;
    for (const [commandId, gesture] of gestures) {
      if (gesture.runId !== snapshot.runId || tMs >= gesture.targetMs) {
        gestures.delete(commandId);
        continue;
      }
      const node = geometry.nodes.get(gesture.nodeId);
      ctx.setLineDash([1.2, 3.5]);
      arc(ctx, node.x, node.y, 15, 0, TURN, cssColor(INPUT, 0.74));
      ctx.setLineDash([]);
    }
    overlay?.(ctx, { tMs, snapshot, events, width, height });
  }

  function hitTest(x, y) {
    let closest = null;
    let limit = HIT_RADIUS;
    for (const [id, node] of geometry.nodes) {
      const distance = Math.hypot(x - node.x, y - node.y);
      if (distance <= limit) {
        closest = id;
        limit = distance;
      }
    }
    return closest;
  }

  // Nearest link within a few pixels of its filament, away from the sites.
  function hitTestLink(x, y, tolerance = 12) {
    let closest = null;
    let limit = tolerance;
    for (const [id, link] of geometry.links) {
      const from = geometry.nodes.get(link.a);
      const to = geometry.nodes.get(link.b);
      if (!awayFromNodes(x, y, from, to, HIT_RADIUS)) continue;
      for (const point of link.curve.points) {
        const distance = Math.hypot(x - point.x, y - point.y);
        if (distance <= limit) {
          closest = id;
          limit = distance;
        }
      }
    }
    return closest;
  }

  function nodePosition(nodeId) {
    const node = geometry.nodes.get(nodeId);
    return node ? { x: node.x, y: node.y } : null;
  }

  function crossedLinks(start, end, previousSample) {
    const x = end.x - start.x;
    const y = end.y - start.y;
    const length = Math.hypot(x, y);
    if (!Number.isFinite(length) || length <= CROSSING_EPSILON) return [];
    const incomingLength = previousSample && Math.hypot(start.x - previousSample.x, start.y - previousSample.y);
    const previous = Number.isFinite(incomingLength) && incomingLength > CROSSING_EPSILON ? previousSample : null;
    const gesture = { start, end, dx: x / length, dy: y / length, length };
    const hits = [];
    for (const [id, link] of geometry.links) {
      const along = firstCrossing(link.curve, gesture, geometry.nodes.get(link.a), geometry.nodes.get(link.b), previous);
      if (Number.isFinite(along)) hits.push({ id, along });
    }
    hits.sort((a, b) => a.along - b.along);
    return hits.map(({ id }) => id);
  }

  function markGesture(nodeId, commandId, targetMs, runId) {
    if (geometry.nodes.has(nodeId)) gestures.set(commandId, { nodeId, targetMs, runId });
  }

  function linkPoint(linkId, fraction) {
    return adapter.linkPoint(linkId, fraction);
  }

  resize();
  return { resize, render, hitTest, hitTestLink, nodePosition, crossedLinks, markGesture, linkPoint,
    // Open rings on sites and links that differ from the study default.
    markModified(next) { modified = { nodes: new Set(next?.nodes ?? []), links: new Set(next?.links ?? []) }; },
    // Stillness envelope 0..1: dims the ground by 6% at 1.
    setDim(value) { dim = clamp(value); },
    setSelected(nodeId) { selected = nodeId ?? null; },
    get selected() { return selected; },
    get centre() { return geometry ? { x: geometry.cx, y: geometry.cy, radius: geometry.radius } : null; },
    // Overlay hook (Map, listening point): called at the end of render with (ctx, { tMs, snapshot, events, width, height }).
    setOverlay(fn) { overlay = fn ?? null; },
    setReducedMotion(value) { reducedMotion = value; network?.setReducedMotion(value); },
    clearGestures() { gestures.clear(); },
  };
}
