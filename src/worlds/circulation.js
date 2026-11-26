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
