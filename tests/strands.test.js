import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGeometry } from '../src/visuals/renderer.js';
import { quinticBridge, routeStrands, interpolateStrands, middleVisibility } from '../src/visuals/strands.js';
import { conductionWorld } from '../src/worlds/conduction.js';
import { circulationWorld } from '../src/worlds/circulation.js';
const enabled = geometry => new Map([...geometry.links].map(([id]) => [id, true]));
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < tolerance, `${JSON.stringify(a)} ~= ${JSON.stringify(b)}`);

test('quintic bridge matches position, travel tangent and curvature at both ports', () => {
  const a = { x: -14, y: 4 }, b = { x: 31, y: 25 };
  const da = { x: 23, y: 12 }, db = { x: 42, y: -9 };
  const dda = { x: 11, y: -8 }, ddb = { x: -7, y: 16 };
  const at = t => quinticBridge(a, b, da, db, dda, ddb, t);
  close(at(0), a); close(at(1), b);
  for (const [t, d, dd] of [[0, da, dda], [1, db, ddb]]) {
    const h = 1e-4, prev = at(t - h), center = at(t), next = at(t + h);
    close({ x: (next.x - prev.x) / (2 * h), y: (next.y - prev.y) / (2 * h) }, d, 1e-4);
    close({ x: (next.x + prev.x - 2 * center.x) / h ** 2,
      y: (next.y + prev.y - 2 * center.y) / h ** 2 }, dd, 1e-3);
  }
});

test('routing is stable under arm ordering and returns exactly to rest', () => {
  const first = makeGeometry(conductionWorld, 390, 510);
  const second = makeGeometry({ ...conductionWorld, links: [...conductionWorld.links].reverse() }, 390, 510);
  const routes = routeStrands(first, enabled(first)), reordered = routeStrands(second, enabled(second));
  for (const [id, link] of first.links) {
    assert.deepEqual(routes.get(id), reordered.get(id));
    const rest = interpolateStrands(link, routes.get(id), link.samples.map(() => ({ opening: 0 })), new Map());
    rest.forEach((row, i) => row.forEach((p, strand) => close(p, link.rest[i][strand])));
    const active = interpolateStrands(link, routes.get(id), link.samples.map(() => ({ opening: .8 })), new Map([['H', .4]]));
    active.flat().forEach(p => assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
  for (const { ports } of first.junctions) for (const arm of ports) assert.ok(arm.port.distance <= .4 * arm.link.curve.length + 1e-8);
});

test('each branch sector shares a point, and disabled topology is independently routable', () => {
  const geometry = makeGeometry(conductionWorld, 390, 510);
  const active = enabled(geometry), routes = routeStrands(geometry, active);
  for (const { ports } of geometry.junctions) for (let i = 0; i < ports.length; i++) {
    const a = ports[i], b = ports[(i + 1) % ports.length];
    close(routes.get(a.id).points[a.samples[0].index][1 + a.sign], routes.get(b.id).points[b.samples[0].index][1 - b.sign]);
  }
  active.set('HV1', false);
  const changed = routeStrands(geometry, active);
  assert.notDeepEqual(changed.get('HV2').points, routes.get('HV2').points);
});

test('tight fork, short and coincident links, and unrelated crossing remain finite', () => {
  const layout = { J: [0, 0], A: [.001, -.001], B: [.02, -1], C: [-.02, -1], D: [0, 0], E: [-1, -.5], F: [1, -.5] };
  const world = { worldId: 'synthetic', nodes: Object.keys(layout).map(id => ({ id })), links: [
    ['short', 'J', 'A'], ['right', 'J', 'B'], ['left', 'J', 'C'], ['zero', 'J', 'D'], ['crossing', 'E', 'F'],
  ].map(([id, a, b]) => ({ id, a, b, enabled: true })) };
  const geometry = makeGeometry(world, 390, 510, layout);
  const routes = routeStrands(geometry, enabled(geometry));
  for (const route of routes.values()) route.points.flat().forEach(p => assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.ok(routes.get('crossing').points.some(row => Math.hypot(row[0].x - row[2].x, row[0].y - row[2].y) > 5), 'crossing retains separate rails');
});

test('ring rails are periodic at all shared sites and retain folded width', () => {
  const geometry = makeGeometry(circulationWorld, 900, 650), routes = routeStrands(geometry, enabled(geometry));
  for (const { ports } of geometry.junctions) {
    const [a, b] = ports;
    for (const strand of [0, 1, 2]) close(routes.get(a.id).points[a.samples[0].index][strand], routes.get(b.id).points[b.samples[0].index][strand]);
  }
  const widths = [...geometry.links.values()].flatMap(link => link.open.map(row => Math.hypot(row[0].x - row[2].x, row[0].y - row[2].y)));
  assert.ok(Math.max(...widths) - Math.min(...widths) > 10);
});

test('crowding attenuates the middle stroke first', () => {
  assert.equal(middleVisibility([{ x: 0, y: 0 }, { x: .2, y: 0 }, { x: .4, y: 0 }]), 0);
  assert.equal(middleVisibility([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 6, y: 0 }]), 1);
});
