// M2 · high-level model controls (creator decision 2026-11-27).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_CONTROLS, controlTargets, controlsFor } from '../src/lab/model-controls.js';
import { applyCommand, createParameterState, editCommand } from '../src/lab/inspector-card.js';
import { simulate } from '../src/lab/protocols.js';
import { SCENES, carryCommands, worldFromState } from '../src/ui/studies.js';
import { echoWorld } from '../src/worlds/echo.js';

test('every Echo control reads its study default inside its range and edits through a logged command', () => {
  const controls = controlsFor('echo');
  assert.equal(controls.length, 4);
  assert.deepEqual(controlsFor('conduction'), []);
  for (const spec of controls) {
    const state = createParameterState(structuredClone(echoWorld));
    const initial = spec.read(state);
    assert.ok(initial >= spec.min && initial <= spec.max, `${spec.id} default ${initial} in range`);
    const next = initial + spec.step * 5 <= spec.max ? initial + spec.step * 5 : initial - spec.step * 5;
    const body = editCommand(state, spec.target, spec.param, next);
    assert.ok(body, `${spec.id} produces a command`);
    applyCommand(state, body);
    assert.equal(spec.read(state), next, `${spec.id} reads back ${next}`);
    assert.equal(editCommand(state, spec.target, spec.param, next), null, 'no-op when unchanged');
  }
  assert.deepEqual(controlTargets(controls).map(target => `${target.kind}:${target.id}`), ['node:FP', 'node:SP', 'link:SL']);
  assert.ok(Object.isFrozen(MODEL_CONTROLS.echo));
});

test('slider edits carried into a new run replay identically to a world built from the edited state', () => {
  const preset = SCENES.echo.preset;
  const state = createParameterState(structuredClone(preset));
  const values = { 'fp-erp': 340, 'sp-erp': 220, 'sp-delay': 130, 'sp-decrement': 90 };
  for (const spec of controlsFor('echo')) applyCommand(state, editCommand(state, spec.target, spec.param, values[spec.id]));
  const drive = [{ commandId: 'S1', tMs: 200, type: 'stimulateTrain', nodeId: 'CSp', startMs: 200, cycleMs: 600, count: 8, label: 'S1' },
    { commandId: 'S2', tMs: 200 + 600 * 7 + 300, type: 'stimulate', nodeId: 'CSp' }];
  const carried = carryCommands(preset, state).map((body, index) => ({ ...body, commandId: `carry-${index + 1}`, tMs: 0 }));
  const a = simulate(structuredClone(preset), [...carried, ...drive], 6500, { runId: 'carry' }).events;
  const b = simulate(worldFromState(preset, state), drive, 6500, { runId: 'baked' }).events;
  const shape = events => events.filter(event => event.type === 'activation').map(event => `${event.nodeId}@${event.tMs}`).join();
  assert.equal(shape(a), shape(b));
  // And the edit changes the physiology: the slower slow pathway lengthens the jumped AH.
  const base = simulate(structuredClone(preset), drive, 6500, { runId: 'base' }).events;
  assert.notEqual(shape(a), shape(base));
});
