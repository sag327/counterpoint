import { both, site, world } from "./kit.js";

const nodeErps = [180, 300, 220, 220, 220, 220, 220, 200];
const direction = Object.freeze({ enabled: true, delayMs: 60, decrement: null });

export const circulationWorld = Object.freeze({
  worldId: 'circulation',
  nodes: Object.freeze(nodeErps.map((erpMs, index) => Object.freeze({
    id: `R${index}`,
    erpMs,
    recoveryTailMs: 120,
    automaticity: null,
  }))),
  links: Object.freeze(nodeErps.map((_, index) => Object.freeze({
    id: `L${index}`,
    a: `R${index}`,
    b: `R${(index + 1) % nodeErps.length}`,
    enabled: true,
    ab: direction,
    ba: direction,
  }))),
});

export function createCirculationWorld() {
  return {
    worldId: circulationWorld.worldId,
    nodes: circulationWorld.nodes.map(node => ({ ...node })),
    links: circulationWorld.links.map(link => ({ ...link, ab: { ...link.ab }, ba: { ...link.ba } })),
  };
}

// The interactive ring uses the same DI-dependent tissue laws as Echo.
// The fixed-delay preset above remains the reference for contract v1 fixtures.
export const CIRCULATION_S2_MS = 240;

export function createRestitutionRing() {
  const nodes = nodeErps.map((erpMs, index) =>
    site(`R${index}`, 'atrial', erpMs, { restitution: [index === 1 ? 60 : 45, 95] }));
  const links = nodes.map(({ id }, index) =>
    both(`L${index}`, id, nodes[(index + 1) % nodes.length].id, 60,
      { decrement: [18, 85], entry: [24, 65] }));
  return world('circulation', nodes, links);
}
