// High-level model controls for the Lab (creator decision 2026-11-27: tunable
// high-level parameters with more visibility into the simulation). Each control
// is one parameter of the study's world, edited through the inspector card's
// logged commands, so edits replay exactly and carry into new runs.

const nodeErp = id => state => state.nodes[id]?.restitution?.erpMaxMs ?? state.nodes[id]?.erpMs ?? null;
const linkField = (id, direction, read) => state => {
  const value = state.links[id]?.[direction];
  return value ? read(value) : null;
};

export const MODEL_CONTROLS = Object.freeze({
  echo: Object.freeze([
    { id: 'fp-erp', label: 'Fast pathway ERP', hint: 'ERP after a long rest; restitution shortens it at faster rates.',
      target: { kind: 'node', id: 'FP' }, param: 'erpMaxMs', min: 220, max: 420, step: 2, read: nodeErp('FP') },
    { id: 'sp-erp', label: 'Slow pathway ERP', hint: 'A shorter slow-pathway ERP lets earlier beats through.',
      target: { kind: 'node', id: 'SP' }, param: 'erpMaxMs', min: 160, max: 360, step: 2, read: nodeErp('SP') },
    { id: 'sp-delay', label: 'Slow pathway conduction (antegrade)', hint: 'Base conduction time down the slow pathway.',
      target: { kind: 'link', id: 'SL', direction: 'ab' }, param: 'delayMs', min: 40, max: 220, step: 2, read: linkField('SL', 'ab', d => d.delayMs) },
    { id: 'sp-decrement', label: 'Slow pathway decrement (antegrade)', hint: 'Extra delay at short recovery: the decremental property of nodal tissue.',
      target: { kind: 'link', id: 'SL', direction: 'ab' }, param: 'decrement.maxExtraMs', min: 0, max: 160, step: 2, read: linkField('SL', 'ab', d => d.decrement?.maxExtraMs ?? 0) },
  ]),
});

export function controlsFor(studyId) {
  return MODEL_CONTROLS[studyId] ?? [];
}

// The distinct inspector targets the controls touch, for "Study defaults".
export function controlTargets(controls) {
  const seen = new Map();
  for (const control of controls) {
    const key = `${control.target.kind}:${control.target.id}`;
    if (!seen.has(key)) seen.set(key, control.target);
  }
  return [...seen.values()];
}
