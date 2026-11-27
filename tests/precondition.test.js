// Guided runs (creator decision 2026-11-27): one press shows the behaviour.
// The engine runs the same commands silently to fromMs; presentation, sound and
// live input begin there, 100 ms before the decisive S2.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Engine } from '../src/engine/index.js';
import { createTransport } from '../src/runtime/transport.js';
import { ARRHYTHMIA_S2_MS, ECHO_S2_MS, GUIDED_LEAD_MS, echoPresentation, echoWorld, s2AtMs } from '../src/worlds/echo.js';

const protocol = id => echoPresentation.protocols.find(entry => entry.id === id);
const guided = id => ({ commands: protocol(id).commands(), fromMs: protocol(id).presentFromMs });

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
      for (const event of events) if (event.type === 'activation') onsets.push({ event, sec: transport.audioSecAt(event.tMs) });
    },
  });
  transport.reset(echoWorld, 'precondition', { commands: commands.map((c, i) => ({ ...c, commandId: c.commandId ?? `c${i}` })), fromMs });
  const rested = transport.frame();
  const firstInput = transport.earliestInputMs();
  assert.equal(transport.resume(), true);
  for (wallMs = 5; transport.committedThroughMs() < endMs; wallMs += 5) {
    if (wallMs % 25 === 0) transport.wake();
    assert.ok(wallMs < 400_000, 'run did not reach endMs');
  }
  return { prelude, committed, onsets, rested, firstInput, transport, engine };
}

const echoes = (events, after) => events.filter(e => e.type === 'activation' && e.nodeId === 'CSp' && e.tMs > after && e.incomingLinkIds.includes('CF'));

test('the two buttons use one S2 each, in the middle of its window, presented 100 ms before the S2', () => {
  assert.equal(protocol('find-echo').s2, ECHO_S2_MS);
  assert.equal(protocol('find-arrhythmia').s2, ARRHYTHMIA_S2_MS);
  for (const id of ['find-echo', 'find-arrhythmia']) {
    const { commands, fromMs } = guided(id);
    const s2 = commands.find(c => c.commandId === 'S2');
    assert.equal(s2.tMs, s2AtMs(protocol(id).s2));
    assert.equal(fromMs, s2.tMs - GUIDED_LEAD_MS);
    assert.ok(!commands.some(c => c.commandId === 'S3'), 'no S3 needed');
  }
  assert.ok(!echoPresentation.protocols.some(p => p.steps), 'no stepping between presses');
});

test('Find the echo gives exactly one echo; Find the arrhythmia sustains reentry', () => {
  const echo = run({ ...guided('find-echo'), endMs: 9_000 });
  const t2 = s2AtMs(ECHO_S2_MS);
  assert.equal(echoes(echo.committed, t2).length, 1);
  const arrhythmia = run({ ...guided('find-arrhythmia'), endMs: 9_000 });
  const laps = echoes(arrhythmia.committed, s2AtMs(ARRHYTHMIA_S2_MS));
  assert.ok(laps.length >= 10, `sustained: ${laps.length} laps in 4 s`);
});

test('a preconditioned run reproduces the full run’s event history and state exactly', () => {
  for (const id of ['find-echo', 'find-arrhythmia']) {
    const { commands, fromMs } = guided(id);
    const full = run({ commands });
    const pre = run({ commands, fromMs });
    const through = events => events.filter(event => event.tMs <= 6_000);
    assert.deepEqual(through([...pre.prelude, ...pre.committed]), through(full.committed), id);
    assert.deepEqual(pre.engine.readAt(6_000), full.engine.readAt(6_000));
    assert.deepEqual(pre.transport.commandLog().map(c => c.commandId), full.transport.commandLog().map(c => c.commandId));
  }
});

test('the prelude is silent and holds the eight drive beats; the echo sounds about 3 s after the press at 1/8 speed', () => {
  const { commands, fromMs } = guided('find-echo');
  const pre = run({ commands, fromMs });
  assert.ok(pre.prelude.length > 0 && pre.prelude.every(event => event.tMs <= fromMs));
  assert.ok(pre.committed.every(event => event.tMs > fromMs), 'no prelude event is committed for sound');
  const drive = pre.prelude.filter(event => event.type === 'stimulus_attempted' && event.nodeId === 'CSp');
  assert.deepEqual(drive.map(event => event.tMs), [200, 800, 1400, 2000, 2600, 3200, 3800, 4400]);
  assert.equal(pre.rested.presentedMs, fromMs);
  assert.ok(pre.firstInput > fromMs, 'live input lands after the precondition');
  const echo = pre.onsets.find(({ event }) => event.nodeId === 'CSp' && event.incomingLinkIds.includes('CF'));
  assert.ok(echo.sec > 2 && echo.sec < 3.5, `echo at ${echo.sec} s`);
});

test('fromMs must be a non-negative number', () => {
  const transport = createTransport({ engine: new Engine(), setTimer: () => 0, clearTimer: () => {} });
  assert.throws(() => transport.reset(echoWorld, 'bad', { fromMs: -1 }), RangeError);
});
