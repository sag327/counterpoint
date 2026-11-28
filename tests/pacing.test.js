import assert from 'node:assert/strict';
import test from 'node:test';
import { Engine } from '../src/engine/index.js';
import { createTransport, clampPacingCycle } from '../src/runtime/transport.js';
import { createRestitutionConduction } from '../src/worlds/conduction.js';
import { createEchoWorld } from '../src/worlds/echo.js';
import { createRestitutionRing } from '../src/worlds/circulation.js';
import { pacingReadout } from '../src/ui/pacing-readout.js';
import { readPreferences, savePreferences } from '../src/ui/preferences.js';

function fixture(world = createRestitutionConduction(), dilation = 1, initialPacing = null) {
  let wall = 0;
  let ordinal = 0;
  const timers = new Map();
  const events = [];
  const engine = new Engine();
  const transport = createTransport({ engine, dilation, nowSec: () => wall / 1000,
    setTimer(callback, delay) { const id = ++ordinal; timers.set(id, { due: wall + delay, callback }); return id; },
    clearTimer: id => timers.delete(id), onCommit: batch => events.push(...batch) });
  transport.reset(world, 'pacing', { start: true, initialPacing });
  function advance(duration) {
    const end = wall + duration;
    for (;;) {
      const next = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (!next || next[1].due > end) break;
      timers.delete(next[0]); wall = next[1].due; next[1].callback();
    }
    wall = end;
  }
  return { transport, events, advance, world, engine };
}
const paceCommands = transport => transport.commandLog().filter(command => command.commandId.startsWith('pace-'));

test('pacing honours simulation time, changes the next interval, and stop removes the pending beat', () => {
  const { transport, advance } = fixture();
  transport.startPacing('S', 600);
  advance(1250);
  let commands = paceCommands(transport);
  assert.equal(commands.length, 3);
  assert.equal(commands[1].tMs - commands[0].tMs, 600);
  const runId = transport.runId;
  transport.setPacingCycle(350);
  assert.equal(transport.state().pacing.nextMs, commands.at(-1).tMs + 350);
  assert.equal(transport.state().pacing.fromMs, transport.state().pacing.nextMs, 'rate change starts a new measurement window');
  advance(350);
  commands = paceCommands(transport);
  assert.equal(commands.at(-1).tMs - commands.at(-2).tMs, 350);
  assert.equal(transport.runId, runId);
  transport.stopPacing();
  advance(2000);
  assert.equal(paceCommands(transport).length, commands.length);
});

test('restarting Echo pacing waits a full drive interval after the previous pulse', () => {
  const { transport, advance, events } = fixture(createEchoWorld(), 1, { nodeId: 'S', cycleMs: 600 });
  advance(650);
  transport.stopPacing();
  advance(200);
  transport.startPacing('S', 530);
  advance(2_000);
  assert.deepEqual(paceCommands(transport).slice(0, 3).map(command => command.tMs), [0, 600, 1130]);
  assert.ok(!events.some(event => event.type === 'activation' && event.nodeId === 'CSp' && event.incomingLinkIds.includes('CF')));
});

test('accepted stimuli replay identically after editing and stopping', () => {
  const { transport, events, advance, world } = fixture();
  transport.startPacing('S', 360); advance(7000);
  transport.setPacingCycle(300); advance(5000); transport.stopPacing(); advance(2000);
  const replay = new Engine(); replay.reset(world, 'pacing');
  for (const command of transport.commandLog()) replay.enqueue(command);
  const actual = [];
  const horizon = transport.committedThroughMs();
  for (let t = 1000; t < horizon; t += 1000) actual.push(...replay.advanceTo(t));
  actual.push(...replay.advanceTo(horizon));
  assert.deepEqual(actual, events);
  const lastPaceMs = paceCommands(transport).at(-1).tMs;
  assert.ok(events.some(event => event.type === 'activation' && event.nodeId === 'S' && event.tMs === lastPaceMs));
  assert.ok(!events.some(event => event.type === 'activation' && event.tMs > lastPaceMs + 1000));
});

test('pause freezes pacing, playback speed preserves intervals, reset clears pending beats', () => {
  const { transport, advance } = fixture(undefined, 4);
  transport.startPacing('S', 400); advance(2000);
  transport.pause(); advance(100);
  assert.equal(transport.status, 'paused');
  const count = paceCommands(transport).length;
  advance(4000); assert.equal(paceCommands(transport).length, count);
  transport.setDilation(1); transport.resume(); advance(2000);
  const commands = paceCommands(transport);
  assert.ok(commands.length > count);
  for (let i = 1; i < commands.length; i++) assert.ok(Math.abs(commands[i].tMs - commands[i - 1].tMs - 400) < 0.001);
  transport.reset(createRestitutionConduction(), 'fresh', { start: true });
  advance(1000); assert.equal(transport.state().pacing, null); assert.equal(paceCommands(transport).length, 0);
});

test('cycle bounds accept slow pacing and clamp invalid input; editions persist independently', () => {
  assert.equal(clampPacingCycle(5), 150); assert.equal(clampPacingCycle(9000), 2000);
  assert.equal(clampPacingCycle(''), 600); assert.equal(clampPacingCycle('bad'), 600);
  const values = new Map();
  globalThis.window = { localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } };
  const full = readPreferences(); full.pacingCycleMs = 360; savePreferences(full);
  const ring = readPreferences('.circulation'); assert.equal(ring.pacingCycleMs, 600);
  ring.pacingCycleMs = 1500; savePreferences(ring);
  assert.equal(readPreferences().pacingCycleMs, 360);
  assert.equal(readPreferences('.circulation').pacingCycleMs, 1500);
  delete globalThis.window;
});

test('live pacing in the window has progressive nodal delays, nodal block and honest A:H readout', () => {
  const { transport, advance, events } = fixture();
  transport.startPacing('S', 360); advance(14000);
  const readout = pacingReadout(events, { worldId: 'conduction', presentedMs: transport.presentedMs(), fromMs: transport.state().pacing.fromMs });
  assert.equal(readout.ratio, '4:3'); assert.equal(readout.kind, 'wenckebach');
  const delays = events.filter(event => event.type === 'conduction_launched' && event.linkId === 'AN' && event.fromNodeId === 'A').map(event => event.arrivalMs - event.departureMs);
  assert.ok(delays.some((value, i) => i >= 2 && value > delays[i - 1] + 1 && delays[i - 1] > delays[i - 2] + 1));
  assert.ok(events.some(event => event.type === 'activation_blocked' && event.nodeId === 'N'));
  const drop = events.find(event => event.type === 'activation_blocked' && event.nodeId === 'N');
  const atDrop = pacingReadout(events, { worldId: 'conduction', presentedMs: drop.tMs, fromMs: transport.state().pacing.fromMs });
  assert.equal(atDrop.lastBlocked, true);
  assert.equal(atDrop.lastAhMs, null, 'a dropped beat must not keep the preceding AH');
  assert.equal(pacingReadout(events, { worldId: 'circulation', presentedMs: 14000 }), null);
  assert.deepEqual(pacingReadout(events, { worldId: 'conduction', presentedMs: 0 }), { ratio: null, kind: null, lastAhMs: null, lastBlocked: false, beats: 0 });
});

test('both default models start pacing at time zero, conduct every beat, and settle after stopping', () => {
  for (const world of [createRestitutionConduction(), createEchoWorld()]) {
    const nodeId = world.nodes[0].id;
    const { transport, advance, events } = fixture(world, 1, { nodeId, cycleMs: 600 });
    advance(11_900);
    const commands = paceCommands(transport);
    assert.deepEqual(commands.map(command => command.tMs), Array.from({ length: 20 }, (_, index) => index * 600));
    assert.ok(commands.every(command => command.nodeId === 'S'));
    for (const node of world.nodes) {
      assert.equal(events.filter(event => event.type === 'activation' && event.nodeId === node.id).length, 20, node.id);
    }
    transport.stopPacing();
    advance(3_000);
    assert.equal(paceCommands(transport).length, 20);
    assert.ok(!events.some(event => event.type === 'activation' && event.tMs >= 12_000));
    assert.ok(!events.some(event => event.source === 'automaticity'));
  }
});

test('manual pacing remains available at the selected ring site', () => {
  const site = 'R3';
  const { transport, advance, events } = fixture(createRestitutionRing());
  transport.startPacing(site, 600); advance(2200); transport.stopPacing();
  assert.ok(paceCommands(transport).length >= 4);
  assert.ok(paceCommands(transport).every(command => command.nodeId === site));
  assert.ok(events.some(event => event.type === 'stimulus_attempted' && event.nodeId === site));
});
