// Simplify M5: preconditioned guided runs. The engine runs the same commands
// silently to fromMs; presentation, sound and live input begin there.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Engine } from '../src/engine/index.js';
import { createTransport } from '../src/runtime/transport.js';
import { ECHO_PRESENT_FROM_MS, echoPresentation, echoWorld } from '../src/worlds/echo.js';

const guided = (id, s2) => {
  const protocol = echoPresentation.protocols.find(entry => entry.id === id);
  return { commands: id === 'find-echo' ? protocol.commands(s2) : protocol.commands(s2, s2), fromMs: protocol.presentFromMs };
};

function run({ commands, fromMs = 0, endMs = 6_000, dilation = 8 }) {
  const engine = new Engine();
  const prelude = [];
  const committed = [];
  const onsets = [];
  let wallMs = 0;
  const transport = createTransport({
    engine,
    dilation,
    nowSec: () => wallMs / 1_000,
    setTimer: () => 0,
    clearTimer: () => {},
    onPrelude: events => prelude.push(...events),
    onCommit(events) {
      committed.push(...events);
      for (const event of events) if (event.type === 'activation') onsets.push(transport.audioSecAt(event.tMs));
    },
  });
  transport.reset(echoWorld, 'precondition', { commands: commands.map((c, i) => ({ ...c, commandId: c.commandId ?? `c${i}` })), fromMs });
  const rested = transport.frame();
  const firstInput = transport.earliestInputMs();
  assert.equal(transport.resume(), true);
  for (wallMs = 5; transport.committedThroughMs() < endMs; wallMs += 5) {
    if (wallMs % 25 === 0) transport.wake();
    assert.ok(wallMs < 200_000, 'run did not reach endMs');
  }
  return { prelude, committed, onsets, rested, firstInput, wallMs, transport, engine };
}

test('the guided runs present from 300 ms before the last S1 at 4400 ms', () => {
  assert.equal(ECHO_PRESENT_FROM_MS, 4_100);
  for (const id of ['find-echo', 'find-chord']) {
    assert.equal(echoPresentation.protocols.find(entry => entry.id === id).presentFromMs, 4_100);
  }
});

test('a preconditioned run reproduces the full run’s event history and state exactly', () => {
  for (const [id, s2] of [['find-echo', 380], ['find-echo', 260], ['find-chord', 280]]) {
    const { commands, fromMs } = guided(id, s2);
    const full = run({ commands });
    const pre = run({ commands, fromMs });
    const through = events => events.filter(event => event.tMs <= 6_000);
    assert.deepEqual(through([...pre.prelude, ...pre.committed]), through(full.committed), `${id} ${s2}`);
    assert.deepEqual(pre.engine.readAt(6_000), full.engine.readAt(6_000));
    assert.deepEqual(pre.transport.commandLog().map(c => c.commandId), full.transport.commandLog().map(c => c.commandId));
  }
});

test('the prelude is silent and holds the first seven drive beats; presentation starts at fromMs', () => {
  const { commands, fromMs } = guided('find-echo', 380);
  const pre = run({ commands, fromMs });
  assert.ok(pre.prelude.length > 0 && pre.prelude.every(event => event.tMs <= fromMs));
  assert.ok(pre.committed.every(event => event.tMs > fromMs), 'no prelude event is committed for sound');
  const drive = pre.prelude.filter(event => event.type === 'stimulus_attempted' && event.nodeId === 'CSp');
  assert.deepEqual(drive.map(event => event.tMs), [200, 800, 1400, 2000, 2600, 3200, 3800]);
  // The circuit is quiet when presentation begins: the 7th beat has finished.
  assert.ok(pre.prelude.filter(event => event.type === 'activation').every(event => event.tMs < fromMs - 50));
  assert.equal(pre.rested.presentedMs, fromMs);
  assert.ok(pre.firstInput > fromMs, 'live input lands after the precondition');
  // The last S1 sounds 300 ms of simulated time (2.4 s at 1/8 speed) after Begin.
  const lastS1 = pre.committed.find(event => event.type === 'activation' && event.nodeId === 'CSp');
  assert.equal(lastS1.tMs, 4_400);
  assert.ok(Math.abs(pre.onsets[0] - 2.4) < 1e-6, pre.onsets[0]);
});

test('the full guided run reaches its S2 after 38 s at 1/8 speed; the preconditioned run after 5.4 s', () => {
  const { commands, fromMs } = guided('find-echo', 380);
  const s2Ms = 4_400 + 380;
  const wallAt = (from, dilation = 8) => (s2Ms - from) * dilation / 1_000;
  assert.equal(wallAt(0), 38.24);
  assert.equal(wallAt(fromMs), 5.44);
});

test('fromMs must be a non-negative number', () => {
  const transport = createTransport({ engine: new Engine(), setTimer: () => 0, clearTimer: () => {} });
  assert.throws(() => transport.reset(echoWorld, 'bad', { fromMs: -1 }), RangeError);
});
