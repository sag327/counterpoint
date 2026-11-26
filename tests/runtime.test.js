import assert from 'node:assert/strict';
import test from 'node:test';
import { Engine } from '../src/engine/index.js';
import { COMMAND_LOG_LIMIT, createTransport } from '../src/runtime/transport.js';
import { circulationWorld } from '../src/worlds/circulation.js';

function setup(originSec = 12.5) {
  let wallMs = 0;
  let nextTimer = 0;
  const timers = new Map();
  const scheduled = [];
  const silenced = [];
  const horizons = [];
  const states = [];
  const faults = [];
  let committedMs = null;
  let published = [];
  let pending = [];
  let runId;

  function snapshot(tMs) {
    const visible = published.filter(event => event.tMs <= tMs);
    const arrived = new Set(visible.filter(event => event.type === 'conduction_arrived').map(event => event.transitId));
    return {
      runId,
      tMs,
      latestActivation: visible.filter(event => event.type === 'activation').at(-1)?.tMs ?? null,
      activeTransits: visible.filter(event => event.type === 'conduction_launched' && !arrived.has(event.transitId)),
    };
  }

  const engine = {
    reset(world, nextRunId) {
      runId = nextRunId;
      committedMs = null;
      published = [];
      pending = [...world.timeline];
      return snapshot(0);
    },
    enqueue(command) {
      assert.equal(command.runId, runId);
      assert.ok(committedMs === null || command.tMs > committedMs);
      pending.push({ tMs: command.tMs, type: 'activation', commandId: command.commandId });
    },
    advanceTo(tMs) {
      assert.ok(committedMs === null || tMs >= committedMs);
      horizons.push({ runId, tMs, wallMs });
      pending.sort((a, b) => a.tMs - b.tMs);
      const events = pending.filter(event => event.tMs <= tMs).map((event, index) => Object.freeze({
        ...event,
        runId,
        eventId: `e${published.length + index + 1}`,
      }));
      pending = pending.filter(event => event.tMs > tMs);
      published.push(...events);
      committedMs = tMs;
      return Object.freeze(events);
    },
    readAt(tMs) {
      assert.ok(committedMs !== null && tMs <= committedMs);
      return snapshot(tMs);
    },
  };

  const transport = createTransport({
    engine,
    nowSec: () => originSec + wallMs / 1000,
    setTimer(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, dueMs: wallMs + delay });
      return id;
    },
    clearTimer: id => timers.delete(id),
    onCommit(events) {
      for (const event of events) {
        if (event.type !== 'activation') continue;
        scheduled.push({
          ...event,
          wallMs: (transport.audioSecAt(event.tMs) - originSec) * 1_000,
          committedWallMs: wallMs,
        });
      }
    },
    onSilence: detail => silenced.push({ ...detail, wallMs }),
    onFault: error => faults.push(error),
    onStateChange: state => states.push(state),
  });

  function to(targetMs) {
    assert.ok(targetMs >= wallMs);
    while (true) {
      const next = [...timers].sort((a, b) => a[1].dueMs - b[1].dueMs)[0];
      if (!next || next[1].dueMs > targetMs) break;
      const [id, { dueMs, callback }] = next;
      wallMs = dueMs;
      timers.delete(id);
      callback();
    }
    wallMs = targetMs;
  }

  return {
    engine, transport, timers, scheduled, silenced, horizons, states, faults, to,
    jump: targetMs => { wallMs = targetMs; },
  };
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `Expected ${expected}, received ${actual}`);
}

const activation = tMs => ({ tMs, type: 'activation' });
const scheduleIds = scheduled => scheduled.map(({ runId, eventId }) => `${runId}/${eventId}`);

test('M04 shares exact onset and presentation time across a continuous dilation boundary', () => {
  const timeline = [0, 15, 15.001, 60].map(activation);
  const nominal = setup();
  nominal.transport.reset({ timeline }, 'nominal', { start: true });
  nominal.to(240);
  close(nominal.scheduled.at(-1).wallMs, 240);
  close(nominal.transport.frame().presentedMs, 60);

  const { transport, to, scheduled, horizons } = setup();
  transport.reset({ timeline }, 'dilated', { start: true });
  assert.equal(transport.committedThroughMs(), 15);
  to(5);
  transport.setDilation(3);
  assert.equal(transport.dilation, 4);
  assert.equal(transport.pendingDilation, 3);
  to(25);
  assert.deepEqual(horizons.map(horizon => horizon.tMs), [15, 23.333]);
  close(scheduled[1].wallMs, 60);
  close(scheduled[2].wallMs, 60.003);
  assert.ok(scheduled[2].wallMs > scheduled[2].committedWallMs);
  to(59);
  close(transport.frame().presentedMs, 14.75);
  to(60);
  const boundary = transport.frame();
  close(boundary.presentedMs, 15);
  assert.deepEqual(boundary.events.map(event => event.tMs), [15]);
  assert.equal(transport.dilation, 3);
  assert.equal(transport.pendingDilation, null);
  to(195);
  const frame = transport.frame();
  close(frame.presentedMs, 60);
  assert.equal(frame.snapshot.latestActivation, 60);
  close(scheduled.at(-1).wallMs, 195);
  assert.deepEqual(scheduled.map(event => event.tMs), timeline.map(event => event.tMs));
});

test('M04 rapid dilation requests preserve the onset already committed under each rate', () => {
  const { transport, to, scheduled } = setup();
  transport.reset({ timeline: [15, 23.333, 23.334].map(activation) }, 'rapid', { start: true });
  to(5);
  transport.setDilation(3);
  to(25);
  transport.setDilation(7);
  transport.setDilation(6);
  to(50);
  assert.deepEqual(scheduled.map(event => event.tMs), [15, 23.333, 23.334]);
  close(scheduled[0].wallMs, 60);
  close(scheduled[1].wallMs, 84.999);
  close(scheduled[2].wallMs, 85.005);
  to(60);
  transport.frame();
  assert.equal(transport.dilation, 3);
  assert.equal(transport.pendingDilation, 6);
  to(84.999);
  assert.deepEqual(transport.frame().events.map(event => event.tMs), [23.333]);
  assert.equal(transport.dilation, 6);
});

test('M05 stamps live input at the first free tick and exposes captures only when presented', () => {
  const { transport, to, scheduled, horizons } = setup();
  const guide = { commandId: 'live-1', tMs: 0, type: 'stimulate', nodeId: 'R0' };
  transport.reset({ timeline: [] }, 'input', { commands: [guide] });
  assert.equal(transport.committedThroughMs(), null);
  assert.equal(transport.frame().snapshot.latestActivation, null);
  assert.equal(transport.submit({ type: 'stimulate', nodeId: 'R1' }), null);
  transport.resume();
  assert.deepEqual(transport.frame().events.map(event => event.tMs), [0]);
  assert.equal(transport.earliestInputMs(), 15.001);
  const command = transport.submit({ type: 'stimulate', nodeId: 'R1' });
  assert.deepEqual(command, { commandId: 'live-2', runId: 'input', tMs: 15.001, type: 'stimulate', nodeId: 'R1' });
  assert.deepEqual(transport.commandLog(), [{ ...guide, runId: 'input' }, command]);
  to(25);
  const frame = transport.frame();
  close(frame.presentedMs, 6.25);
  assert.equal(frame.snapshot.latestActivation, 0);
  assert.deepEqual(frame.events, []);
  assert.equal(transport.committedThroughMs(), 21.25);
  close(scheduled[1].wallMs, 60.004);
  assert.equal(scheduled[1].committedWallMs, 25);
  assert.deepEqual(horizons.map(horizon => [horizon.wallMs, horizon.tMs]), [[0, 15], [25, 21.25]]);
  to(60.003);
  assert.deepEqual(transport.frame().events, []);
  to(60.004);
  const presented = transport.frame();
  close(presented.presentedMs, command.tMs);
  assert.equal(presented.snapshot.latestActivation, command.tMs);
  assert.deepEqual(scheduleIds(presented.events), [scheduleIds(scheduled)[1]]);
  assert.deepEqual(transport.frame().events, []);
  assert.equal(new Set(scheduleIds(scheduled)).size, scheduled.length);
});

test('M05 applies the ceiled 5 wall-ms safety margin near the old horizon', () => {
  const { transport, jump, scheduled } = setup();
  transport.reset({ timeline: [] }, 'margin', { start: true });
  jump(58.002);
  const command = transport.submit({ type: 'stimulate', nodeId: 'R1' });
  assert.equal(command.tMs, 15.751);
  transport.wake();
  close(scheduled[0].wallMs, 63.004);
  assert.equal(scheduled[0].committedWallMs, 58.002);
});

test('M05 preserves a whole tick after subtracting a large audio clock anchor', () => {
  const { transport, jump } = setup(3000);
  transport.setDilation(1);
  transport.reset({ timeline: [] }, 'large-anchor', { start: true });
  assert.equal(transport.committedThroughMs(), 60);
  jump(58);
  assert.equal(transport.submit({ type: 'stimulate', nodeId: 'R1' }).tMs, 63);
  assert.equal(transport.frame().snapshot.tMs, 58);
});

test('the command log reports retention without changing accepted input', () => {
  const { transport } = setup();
  transport.reset({ timeline: [] }, 'command-log', { start: true });
  const count = COMMAND_LOG_LIMIT + 1;
  for (let index = 1; index <= count; index++) {
    assert.equal(transport.submit({ type: 'stimulate', nodeId: 'R0' }).commandId, `live-${index}`);
  }
  const recent = transport.commandLog();
  assert.equal(recent.length, COMMAND_LOG_LIMIT);
  assert.equal(recent[0].commandId, 'live-2');
  assert.equal(recent.at(-1).commandId, `live-${count}`);
  assert.equal(transport.discardedCommandCount, 1);
  transport.reset({ timeline: [] }, 'new-command-log');
  assert.equal(transport.discardedCommandCount, 0);
  assert.deepEqual(transport.commandLog(), []);
});

test('M06 pause drains through the current committed boundary and resumes the same transit', () => {
  const { transport, to, scheduled, silenced, horizons } = setup();
  const timeline = [
    activation(0),
    { tMs: 0, type: 'conduction_launched', transitId: 't1', arrivalMs: 60 },
    activation(37.5),
    { tMs: 60, type: 'conduction_arrived', transitId: 't1' },
    activation(60),
  ];
  transport.reset({ timeline }, 'transit', { start: true });
  to(100);
  assert.equal(transport.frame().snapshot.activeTransits[0].transitId, 't1');
  assert.equal(transport.committedThroughMs(), 40);
  assert.equal(transport.pause(), true);
  assert.equal(transport.status, 'pausing');
  assert.equal(transport.resume(), false);
  assert.equal(transport.submit({ type: 'stimulate', nodeId: 'R0' }), null);
  to(150);
  assert.deepEqual(transport.frame().events.map(event => event.tMs), [37.5]);
  assert.equal(transport.status, 'pausing');
  to(160);
  assert.equal(transport.frame().presentedMs, 40);
  assert.equal(transport.status, 'paused');
  assert.deepEqual(silenced, [{ runId: 'transit', reason: 'pause', wallMs: 160 }]);
  const lastAdvance = horizons.length;
  to(1000);
  assert.equal(transport.frame().presentedMs, 40);
  assert.equal(horizons.length, lastAdvance);
  transport.resume();
  assert.equal(transport.frame().snapshot.activeTransits[0].arrivalMs, 60);
  to(1079.999);
  assert.equal(transport.frame().snapshot.activeTransits.length, 1);
  to(1080);
  assert.equal(transport.frame().snapshot.activeTransits.length, 0);
  assert.deepEqual(scheduled.map(event => event.tMs), [0, 37.5, 60]);
  close(scheduled.at(-1).wallMs, 1080);
  assert.equal(new Set(scheduleIds(scheduled)).size, scheduled.length);
});

test('M07 reset fences prior sound, frame events and a stale wake callback', () => {
  const { transport, to, scheduled, silenced, horizons, timers } = setup();
  transport.reset({ timeline: [activation(12.5)] }, 'old', { start: true });
  const staleCallback = [...timers.values()][0].callback;
  to(10);
  assert.equal(transport.frame().events.length, 0);
  transport.reset({ timeline: [] }, 'new', {
    start: true,
    commands: [{ commandId: 'guide', tMs: 0, type: 'stimulate', nodeId: 'R0' }],
  });
  assert.deepEqual(silenced, [{ runId: 'old', reason: 'reset', wallMs: 10 }]);
  assert.deepEqual(scheduleIds(scheduled), ['old/e1', 'new/e1']);
  const horizonCount = horizons.length;
  staleCallback();
  assert.equal(horizons.length, horizonCount);
  assert.equal(timers.size, 1);
  const frame = transport.frame();
  assert.equal(frame.runId, 'new');
  assert.deepEqual(scheduleIds(frame.events), ['new/e1']);
  to(60);
  assert.deepEqual(transport.frame().events, []);
  assert.throws(() => transport.reset({ timeline: [] }, 'old'), /fresh run ID/);
  assert.equal(transport.runId, 'new');
});

test('M08 hide skips pending transients, keeps the committed phase and resumes explicitly', () => {
  const { transport, to, scheduled, silenced, horizons, states, timers } = setup();
  transport.reset({ timeline: [0, 12.5, 15.001, 20].map(activation) }, 'hidden', { start: true });
  to(12);
  assert.deepEqual(transport.frame().events.map(event => event.tMs), [0]);
  to(15);
  transport.interrupt('hidden');
  assert.equal(timers.size, 0);
  const skipped = transport.lastInterruption;
  assert.equal(skipped.runId, 'hidden');
  assert.equal(skipped.reason, 'hidden');
  close(skipped.fromMs, 3);
  assert.equal(skipped.throughMs, 15);
  assert.equal(skipped.discardedEvents, 1);
  assert.equal(skipped.overdueWallMs, 0);
  assert.deepEqual(silenced, [{ runId: 'hidden', reason: 'hidden', wallMs: 15 }]);
  to(500);
  assert.equal(states.at(-1).status, 'paused');
  const frozen = transport.frame();
  assert.equal(frozen.presentedMs, 15);
  assert.equal(frozen.snapshot.latestActivation, 12.5);
  assert.deepEqual(frozen.events, []);
  assert.equal(horizons.length, 1);
  transport.resume();
  assert.deepEqual(scheduled.map(event => event.tMs), [0, 12.5, 15.001, 20]);
  close(scheduled[2].wallMs, 500.004);
  close(scheduled[3].wallMs, 520);
  assert.deepEqual(transport.frame().events, []);
  to(520);
  assert.deepEqual(transport.frame().events.map(event => event.tMs), [15.001, 20]);
});

test('M08 a missed scheduling horizon pauses instead of backfilling overdue attacks', () => {
  const { transport, jump, scheduled, silenced, horizons } = setup();
  transport.reset({ timeline: [10, 50, 500].map(activation) }, 'stalled', { start: true });
  jump(2_500);
  transport.wake();
  assert.equal(transport.status, 'paused');
  assert.equal(transport.frame().presentedMs, 15);
  assert.deepEqual(scheduled.map(event => event.tMs), [10]);
  assert.equal(horizons.length, 1);
  close(transport.lastInterruption.overdueWallMs, 2440);
  assert.deepEqual(silenced, [{ runId: 'stalled', reason: 'late-wake', wallMs: 2500 }]);
});

test('an engine fault freezes the last complete horizon and requires a fresh run', () => {
  const { transport, engine, to, silenced, scheduled, faults } = setup();
  transport.reset({ timeline: [activation(18)] }, 'faulty', { start: true });
  const advanceTo = engine.advanceTo;
  engine.advanceTo = () => {
    throw Object.assign(new Error('processing budget'), {
      tMs: 20, committedThroughMs: 18, events: advanceTo(18),
    });
  };
  to(25);
  assert.equal(transport.status, 'faulted');
  assert.equal(transport.state().error, faults[0]);
  assert.equal(faults[0].tMs, 20);
  assert.deepEqual(faults[0].events.map(event => event.tMs), [18]);
  const frame = transport.frame();
  assert.equal(frame.presentedMs, 18);
  assert.equal(frame.snapshot.latestActivation, 18);
  assert.deepEqual(frame.events, []);
  assert.deepEqual(scheduled, []);
  assert.equal(transport.resume(), false);
  assert.deepEqual(silenced, [{ runId: 'faulty', reason: 'fault', wallMs: 25 }]);
});

test('M04 and M06 preserve real Circulation event history and physiology through pause and dilation', () => {
  const endMs = 1200;
  const commands = [0, 240].map((tMs, index) => ({
    tMs, commandId: `guide-${index + 1}`, type: 'stimulate', nodeId: 'R0',
  }));

  function run(changeTransport) {
    const engine = new Engine();
    const events = [];
    const onsets = new Map();
    let wallMs = 0;
    const transport = createTransport({
      engine,
      nowSec: () => wallMs / 1_000,
      setTimer: () => 0,
      clearTimer: () => {},
      onCommit(batch) {
        events.push(...batch);
        for (const event of batch) {
          if (event.type === 'activation') onsets.set(event.eventId, transport.audioSecAt(event.tMs));
        }
      },
    });
    transport.reset(circulationWorld, 'comparison', { commands, start: true });
    for (wallMs = 5; wallMs <= 6_000 && transport.committedThroughMs() < endMs; wallMs += 5) {
      if (wallMs % 25 === 0) transport.wake();
      if (changeTransport && wallMs === 100) assert.equal(transport.pause(), true);
      if (changeTransport && wallMs === 125) transport.setDilation(3);
      if (changeTransport && wallMs === 1000) assert.equal(transport.resume(), true);
      if (wallMs % 35 === 0) transport.frame();
    }
    return { events: events.filter(event => event.tMs <= endMs), snapshot: engine.readAt(endMs), onsets };
  }

  const normal = run(false);
  const changed = run(true);
  assert.equal(normal.events.length, 79);
  assert.deepEqual(changed.events, normal.events);
  assert.deepEqual(changed.snapshot, normal.snapshot);
  const nextNode = normal.events.find(event => event.type === 'activation' && event.tMs === 60);
  close(normal.onsets.get(nextNode.eventId), 0.240);
  close(changed.onsets.get(nextNode.eventId), 1.060);
});
