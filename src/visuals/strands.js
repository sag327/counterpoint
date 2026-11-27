import { threadShape } from './weave.js';
// Geometry-only routing. Fitting and neighbor searches run only on resize or a
// change to enabled topology; playback only interpolates these cached points.
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t = clamp(x); return t ** 3 * (10 + t * (-15 + 6 * t)); };
const point = (s, offset) => ({ x: s.x + s.nx * offset, y: s.y + s.ny * offset });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Position and first two derivatives are with respect to normalized travel.
export function quinticBridge(a, b, da, db, dda, ddb, t) {
  const result = {};
  for (const axis of ['x', 'y']) {
    const c0 = a[axis], c1 = da[axis], c2 = dda[axis] / 2;
    const p = b[axis] - c0 - c1 - c2;
    const v = db[axis] - c1 - 2 * c2;
    const q = ddb[axis] - 2 * c2;
    result[axis] = c0 + t * (c1 + t * (c2 + t * (10 * p - 4 * v + q / 2
      + t * (-15 * p + 7 * v - q + t * (6 * p - 3 * v + q / 2)))));
  }
  return result;
}

export function prepareStrands(geometry, enabled = null) {
  const links = [...geometry.links].sort(([a], [b]) => a.localeCompare(b));
  const scale = geometry.weaveScale;
  for (const [, link] of links) {
    link.isRing = geometry.isRing;
    const bounds = link.samples.map((s, i, samples) => {
      const prev = samples[Math.max(0, i - 1)], next = samples[Math.min(samples.length - 1, i + 1)];
      const ds = Math.max(.001, next.distance - prev.distance);
      const curvature = Math.hypot(next.nx - prev.nx, next.ny - prev.ny) / ds;
      let bound = Math.min(10 * scale, .32 / Math.max(.0001, curvature));
      for (const [otherId, other] of links) {
        if (enabled && !enabled.get(otherId)) continue;
        if (other === link || other.a === link.a || other.a === link.b || other.b === link.a || other.b === link.b) continue;
        for (let j = 1; j < other.samples.length; j += 2) {
          const q = other.samples[j];
          // Transverse projected crossings keep their independent identities.
          // Only approximately parallel neighbors constrain route width.
          if (Math.abs(s.nx * q.nx + s.ny * q.ny) < .88) continue;
          bound = Math.min(bound, Math.max(1.3 * scale, distance(s, q) * .32));
        }
      }
      return bound;
    });
    // A soft minimum spreads a constraint over a physical neighborhood without
    // a single closest sample carving a visible dent into the rail.
    link.open = link.samples.map((s, i) => {
      let bound = bounds[i];
      for (let j = 0; j < bounds.length; j++) bound = Math.min(bound,
        bounds[j] + .012 * (s.distance - link.samples[j].distance) ** 2 / scale);
      const phase = (s.x - geometry.cx) / (180 * scale) + (s.y - geometry.cy) / (230 * scale);
      const asymmetry = .10 * Math.sin(phase + .7);
      if (geometry.isRing) {
        const phase = Math.atan2(s.y - geometry.cy, s.x - geometry.cx) + Math.PI / 2;
        return [0, 1, 2].map(strand => point(s, scale * threadShape(phase, strand) + (strand - 1) * .33));
      }
      return [point(s, -bound * (.91 + asymmetry)), point(s, bound * .035 * Math.sin(phase)),
        point(s, bound * (.91 - asymmetry))];
    });
    link.rest = link.samples.map(s => [-.33, 0, .33].map(offset => point(s, offset * s.taper)));
  }
}

function endpoint(arm, strand, span, inward, routes) {
  const samples = arm.link.samples;
  const i = arm.port.index;
  const lo = Math.max(0, i - 1), hi = Math.min(samples.length - 1, i + 1);
  const points = routes.get(arm.id).points;
  const a = points[lo][strand], b = points[i][strand], c = points[hi][strand];
  const h0 = Math.max(.001, samples[i].distance - samples[lo].distance);
  const h1 = Math.max(.001, samples[hi].distance - samples[i].distance);
  const sign = (arm.start ? 1 : -1) * (inward ? -1 : 1);
  const d = {}, dd = {};
  for (const axis of ['x', 'y']) {
    const left = (b[axis] - a[axis]) / h0, right = (c[axis] - b[axis]) / h1;
    d[axis] = (left * h1 + right * h0) / (h0 + h1) * span * sign;
    dd[axis] = 2 * (right - left) / (h0 + h1) * span * span;
  }
  return { p: b, d, dd };
}

export function routeStrands(geometry, enabled) {
  prepareStrands(geometry, enabled);
  const routes = new Map([...geometry.links].map(([id, link]) => [id, {
    points: link.open.map(row => row.map(p => ({ ...p }))),
    capture: link.samples.map(() => null),
  }]));
  // Complete all width constraints before fitting any junction, so processing
  // another endpoint cannot alter a bridge already fitted on a short link.
  for (const { ports } of geometry.junctions) {
    if (geometry.isRing) continue;
    const arms = ports.filter(arm => enabled.get(arm.id));
    // Each narrow sector bounds just its facing rails. The outside rails keep
    // their broad sweep; the sine bound changes continuously with fork angle.
    for (let i = 0; i < arms.length; i++) {
      const from = arms[i], to = arms[(i + 1) % arms.length];
      const angle = (to.angle - from.angle + Math.PI * 2) % (Math.PI * 2);
      if (angle >= Math.PI) continue;
      for (const [arm, strand] of [[from, 1 + from.sign], [to, 1 - to.sign]]) {
        const route = routes.get(arm.id);
        for (const entry of arm.samples) {
          const base = entry.sample, p = route.points[entry.index][strand];
          const width = distance(base, p);
          const limit = Math.max(.5 * geometry.weaveScale, entry.distance * Math.sin(angle / 2) * .64);
          // Smooth minimum, with no angle threshold between outside and cleft.
          const bound = width / Math.sqrt(1 + (width / Math.max(.001, limit)) ** 2);
          const influence = smooth((Math.PI - angle) / (Math.PI / 2));
          const amount = width > .001 ? 1 + (bound / width - 1) * influence : 1;
          route.points[entry.index][strand] = { x: base.x + (p.x - base.x) * amount,
            y: base.y + (p.y - base.y) * amount };
        }
      }
    }
  }
  for (const { id, ports } of geometry.junctions) {
    const arms = ports.filter(arm => enabled.get(arm.id));
    for (const arm of ports) {
      const route = routes.get(arm.id);
      for (const entry of arm.samples) {
        if (entry.distance > arm.port.distance) break;
        route.capture[entry.index] = { id, weight: 1 - smooth(entry.distance / Math.max(.001, arm.port.distance)) };
      }
    }
    if (geometry.isRing || arms.length < 2) continue;
    const join = (from, to, fs, ts) => {
      const span = Math.max(.001, from.port.distance + to.port.distance);
      const a = endpoint(from, fs, span, true, routes), b = endpoint(to, ts, span, false, routes);
      for (const [arm, strand, reverse] of [[from, fs, false], [to, ts, true]]) {
        for (const entry of arm.samples) {
          if (entry.distance > arm.port.distance) break;
          const t = reverse ? (from.port.distance + entry.distance) / span
            : (from.port.distance - entry.distance) / span;
          routes.get(arm.id).points[entry.index][strand] = quinticBridge(a.p, b.p, a.d, b.d, a.dd, b.dd, t);
        }
      }
    };
    for (let i = 0; i < arms.length; i++) {
      const from = arms[i], to = arms[(i + 1) % arms.length];
      join(from, to, 1 + from.sign, 1 - to.sign);
    }
    if (arms.length === 2) join(arms[0], arms[1], 1, 1);
    else {
      for (const arm of arms) {
        const route = routes.get(arm.id);
        for (const entry of arm.samples) {
          if (entry.distance > arm.port.distance) break;
          // Quiet seam gathers on the selectable site, C2 at the outer port.
          const base = arm.link.samples[entry.index];
          const open = arm.link.open[entry.index][1];
          const weight = smooth(entry.distance / Math.max(.001, arm.port.distance));
          route.points[entry.index][1] = { x: base.x + (open.x - base.x) * weight,
            y: base.y + (open.y - base.y) * weight };
        }
      }
    }
  }
  // Unconnected arms taper onto their selectable endpoints.
  for (const [id, link] of geometry.links) {
    const route = routes.get(id);
    for (const start of [true, false]) {
      const nodeId = start ? link.a : link.b;
      const degree = [...geometry.links].filter(([key, other]) => enabled.get(key) && (other.a === nodeId || other.b === nodeId)).length;
      if (degree > 1 || geometry.isRing) continue;
      link.samples.forEach((s, i) => {
        const amount = smooth((start ? s.distance : link.curve.length - s.distance) / Math.max(.001, Math.min(18 * geometry.weaveScale, link.curve.length * .4)));
        route.points[i] = route.points[i].map(p => ({ x: s.x + (p.x - s.x) * amount, y: s.y + (p.y - s.y) * amount }));
      });
    }
  }
  return routes;
}

export function interpolateStrands(link, route, samples, openings) {
  return route.points.map((row, i) => {
    const capture = route.capture[i];
    const local = samples[i].opening;
    const amount = capture ? local + ((openings.get(capture.id) ?? 0) - local) * capture.weight : local;
    const result = row.map((p, strand) => ({ x: link.rest[i][strand].x + (p.x - link.rest[i][strand].x) * amount,
      y: link.rest[i][strand].y + (p.y - link.rest[i][strand].y) * amount }));
    result.isRing = link.isRing;
    return result;
  });
}

// The middle stroke yields first when final geometry cannot resolve all three.
// Computed from the same coordinates for the base rail, moving light and glow.
export function middleVisibility(row) {
  if (row.isRing) return 1;
  return smooth((Math.min(distance(row[0], row[1]), distance(row[1], row[2])) - .3) / 1.7);
}
