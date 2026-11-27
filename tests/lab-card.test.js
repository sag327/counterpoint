import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Engine } from '../src/engine/index.js';
import {
  applyCommand, applyParameterEvents, cardModel, createInspectorCard, createParameterState, defaultCommands, editCommand, modifiedElements,
} from '../src/lab/inspector-card.js';
import { echoPlateWorld, echoV11World } from './lab-worlds.js';

// A minimal DOM: enough for the card's own calls, no layout.
class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.className = '';
    this.parent = null;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  fire(type, event = {}) { for (const fn of this.listeners[type] ?? []) fn({ preventDefault() {}, ...event }); }
  all(predicate, out = []) { if (predicate(this)) out.push(this); for (const c of this.children) c.all(predicate, out); return out; }
}
const fakeDocument = { createElement: tag => new FakeElement(tag) };

// Live engine harness: the host stamps commandId, runId and tMs, as the runtime does.
function liveRun(world) {
  const engine = new Engine({ processingBudget: 1e6 });
  engine.reset(world, 'live');
  const log = [];
  const events = [];
  let t = 0;
  const host = {
    engine, log, events,
    enqueue(body) {
      const command = { ...body, commandId: `edit${log.length + 1}`, runId: 'live', tMs: t + 1 };
      engine.enqueue(command);
      log.push(command);
    },
    advance(to) {
      t = to;
      events.push(...engine.advanceTo(to));
    },
  };
  for (let k = 0; k < 6; k++) {
    const command = { commandId: `S1#${k + 1}`, runId: 'live', type: 'stimulate', nodeId: 'CSp', tMs: 200 + 600 * k };
    engine.enqueue(command);
    log.push(command);
  }
  return host;
}

test('editCommand maps every handle parameter to its engine command, clamped to the contract ranges', () => {
  const state = createParameterState(echoV11World());
  const fp = { kind: 'node', id: 'FP' };
  assert.deepEqual(editCommand(state, fp, 'tauMs', 140.4), { type: 'setRestitution', nodeId: 'FP', erpMaxMs: 300, amplitudeMs: 60, tauMs: 140, erpMinMs: 200 });
  assert.deepEqual(editCommand(state, fp, 'erpMaxMs', 5000).erpMaxMs, 1000);
  assert.equal(editCommand(state, fp, 'tauMs', 120), null, 'no-op edits send nothing');
  assert.deepEqual(editCommand(state, { kind: 'node', id: 'S' }, 'cycleMs', 700), { type: 'setAutomaticity', nodeId: 'S', cycleMs: 700 });
  const sl = { kind: 'link', id: 'SL', direction: 'ab' };
  assert.deepEqual(editCommand(state, sl, 'delayMs', 170), { type: 'setDirectionDelay', linkId: 'SL', direction: 'ab', delayMs: 170 });
  assert.deepEqual(editCommand(state, sl, 'decrement.maxExtraMs', 80), { type: 'setDecrement', linkId: 'SL', direction: 'ab', maxExtraMs: 80, tauMs: 120 });
  assert.deepEqual(editCommand(state, sl, 'entry.tauMs', 90), { type: 'setEntry', linkId: 'SL', direction: 'ab', maxExtraMs: 30, tauMs: 90 });
  assert.deepEqual(editCommand(state, { kind: 'coupling', id: 'none' }, 'coupling', 0.2), { type: 'setCoupling', couplingId: 'none', value: 0.2 });
  // A 1.0.0 world only gets 1.0.0 commands.
  const old = createParameterState(echoPlateWorld());
  assert.deepEqual(editCommand(old, { kind: 'node', id: 'FP' }, 'erpMs', 290), { type: 'setNodeERP', nodeId: 'FP', erpMs: 290 });
  assert.equal(editCommand(old, { kind: 'link', id: 'SL', direction: 'ab' }, 'entry.tauMs', 90), null);
});

test('Handle edits replay identically from the command log, and Study default restores the preset', () => {
  const world = echoV11World();
  const host = liveRun(world);
  const fakeContainer = new FakeElement('div');
  const modifiedSeen = [];
  const card = createInspectorCard(fakeContainer, { world, enqueue: body => host.enqueue(body), document: fakeDocument, onModifiedChange: m => modifiedSeen.push([...m.nodes, ...m.links]) });
  host.advance(1500);
  card.open({ kind: 'node', id: 'FP' });
  card.update({ snapshot: host.engine.readAt(1500), events: host.events, tMs: 1500 });
  const handles = fakeContainer.all(n => n.attributes.role === 'slider');
  assert.deepEqual(handles.map(h => h.dataset.handle), ['erpMax', 'amplitude', 'tau']);
  const tau = handles.find(h => h.dataset.handle === 'tau');
  tau.fire('keydown', { key: 'ArrowUp', shiftKey: true }); // +10 ms
  tau.fire('keydown', { key: 'ArrowDown' }); // −1 ms
  assert.equal(tau.attributes['aria-valuenow'], '129');
  // A pointer drag commits one command on release.
  const amp = handles.find(h => h.dataset.handle === 'amplitude');
  amp.fire('pointerdown', { pointerId: 1 });
  amp.fire('pointermove', { clientX: 48, clientY: 120 });
  amp.fire('pointerup', {});
  host.advance(2500);
  card.update({ snapshot: host.engine.readAt(2500), events: host.events, tMs: 2500 });
  card.open({ kind: 'link', id: 'SL', direction: 'ab' });
  const delayInput = fakeContainer.all(n => n.tag === 'input')[0];
  delayInput.value = '175';
  delayInput.fire('change');
  host.advance(6000);
  card.update({ snapshot: host.engine.readAt(6000), events: host.events, tMs: 6000 });
  const edits = host.log.filter(c => c.commandId.startsWith('edit'));
  assert.deepEqual(edits.map(c => c.type), ['setRestitution', 'setRestitution', 'setRestitution', 'setDirectionDelay']);
  assert.equal(edits[1].tauMs, 129);
  assert.deepEqual(card.modified().nodes, new Set(['FP']));
  assert.deepEqual(card.modified().links, new Set(['SL']));
  assert.deepEqual(modifiedSeen.at(-1), ['FP', 'SL']);
  // The engine agrees with the card's state.
  const snap = host.engine.readAt(6000);
  assert.deepEqual(snap.nodes.FP.restitution, card.state.nodes.FP.restitution);
  assert.equal(snap.links.SL.ab.delayMs, 175);
  // Replay the performance file: identical events.
  const replay = new Engine({ processingBudget: 1e6 });
  replay.reset(world, 'live');
  for (const command of host.log) replay.enqueue(command);
  assert.deepEqual(replay.advanceTo(6000), host.events);
  // Study default enqueues the restoring commands; afterwards nothing is modified.
  const studyDefault = fakeContainer.all(n => n.className === 'lab-card-default')[0];
  studyDefault.fire('click');
  card.open({ kind: 'node', id: 'FP' });
  studyDefault.fire('click');
  host.advance(7000);
  card.update({ snapshot: host.engine.readAt(7000), events: host.events, tMs: 7000 });
  assert.equal(card.modified().nodes.size + card.modified().links.size, 0);
  assert.deepEqual(host.engine.readAt(7000).nodes.FP.restitution, world.nodes.find(n => n.id === 'FP').restitution);
});

test('Parameter state follows command events, ignores agent and lesion causes, and resets on a fresh run', () => {
  const world = echoV11World();
  const state = createParameterState(world);
  applyParameterEvents(state, [
    { type: 'parameter_changed', parameter: 'erpMs', nodeId: 'SP', value: 400, cause: 'agent' },
    { type: 'parameter_changed', parameter: 'delayMs', linkId: 'SL', direction: 'ab', value: 400, cause: 'lesion' },
    { type: 'parameter_changed', parameter: 'erpMs', nodeId: 'SP', value: 260, cause: 'command' },
    { type: 'parameter_changed', parameter: 'tone', value: 0.5, cause: 'command' },
    { type: 'parameter_changed', parameter: 'autonomic', value: null, cause: 'command' },
  ]);
  assert.equal(state.nodes.SP.erpMs, 260);
  assert.equal(state.nodes.SP.restitution.erpMaxMs, 260);
  assert.equal(state.nodes.SP.restitution.erpMinMs, 160 + 20); // the floor keeps its offset (240 − 160 = 80 below E max)
  assert.equal(state.links.SL.ab.delayMs, 160);
  assert.deepEqual([...modifiedElements(world, state).nodes], ['SP']);
  assert.deepEqual(defaultCommands(world, state, { kind: 'node', id: 'SP' }), [{ type: 'setRestitution', nodeId: 'SP', erpMaxMs: 240, amplitudeMs: 40, tauMs: 100, erpMinMs: 160 }]);
  applyCommand(state, defaultCommands(world, state, { kind: 'node', id: 'SP' })[0]);
  assert.equal(modifiedElements(world, state).nodes.size, 0);
  const container = new FakeElement('div');
  const card = createInspectorCard(container, { world, enqueue() {}, document: fakeDocument });
  card.open({ kind: 'node', id: 'SP' });
  card.update({ events: [{ runId: 'a', type: 'parameter_changed', parameter: 'erpMs', nodeId: 'SP', value: 300, cause: 'command' }] });
  assert.equal(card.state.nodes.SP.erpMs, 300);
  card.update({ events: [{ runId: 'b', type: 'activation', nodeId: 'CSp', tMs: 0 }] });
  assert.equal(card.state.nodes.SP.erpMs, 240);
});

test('The link card plots launches in its own direction on the decrement and entry laws', () => {
  const world = echoV11World();
  const host = liveRun(world);
  host.advance(4000);
  const model = cardModel(createParameterState(world), { kind: 'link', id: 'SL', direction: 'ab', from: 'SP' }, { events: host.events, snapshot: host.engine.readAt(4000) });
  assert.ok(model.table.rows.length >= 5);
  assert.match(model.summary, /slow|SL/);
  assert.deepEqual(model.handles.map(h => h.id), ['delay', 'decrementMax', 'decrementTau', 'entryMax', 'entryTau']);
});
