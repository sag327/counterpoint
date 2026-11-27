// Contract 1.1.0 oracles (design/study-2-spec.md, "Required oracles").
// Expected values are computed here from the laws in closed form or by an
// explicit hand recurrence, never recorded from engine output.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createEngine, SimulationFault } from '../src/engine/index.js';
import { lintStudyWorld } from '../src/engine/input.js';
import { circulationWorld, createCirculationWorld } from '../src/worlds/circulation.js';
import { conductionWorld, createConductionWorld } from '../src/worlds/conduction.js';
import { dualityWorld } from '../src/worlds/duality.js';
import { captures, fixture, ofType, play as playV1 } from './engine-scenes.js';
import {
  CHAIN, ENTRY_RING, V11, ablate, chainWorld, entryRingWorld, focusWorld, hemiolaWorld, induction, join, lesionRingWorld,
  play, pulseAt, restitutionWorld, site, train, v11World, way,
} from './engine-v11-scenes.js';

const tick = ms => Math.round(ms * 1000);
const ms = ticks => ticks / 1000;
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} differs from ${expected} by more than ${tolerance}`);
const actsAt = (events, nodeId) => captures(events).filter(event => event.nodeId === nodeId);
const timesAt = (events, nodeId) => actsAt(events, nodeId).map(event => event.tMs);
const diffs = values => values.slice(1).map((value, i) => value - values[i]);
const autoAttempts = events => ofType(events, 'stimulus_attempted').filter(event => event.source === 'automaticity').map(event => event.tMs);
const V11_FIELDS = new Set(['diastolicIntervalMs', 'delayParts', 'cause']);
const stripV11 = events => events.map(event => {
  const copy = { ...event };
  for (const key of V11_FIELDS) if (key !== 'cause' || event.type === 'link_changed' || event.type === 'parameter_changed') delete copy[key];
  return copy;
});

// Bisection for a monotone f with a sign change on [lo, hi].
function root(f, lo, hi) {
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if ((f(lo) < 0) === (f(mid) < 0)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------- v1 regression

const engineEvidence = JSON.parse(readFileSync(new URL('../evidence/engine-01.json', import.meta.url), 'utf8'));

// The hand-authored presentation fixtures order keys differently, so they are compared by value
// (as E14 does); the committed v1.0 engine evidence holds the same traces in emission key order.
test('V11-00 v1 regression: A, B, C and ring.json traces are unchanged and serialize byte for byte', () => {
  assert.deepEqual(circulationWorld, fixture('ring'));
  for (const protocol of ['A', 'B', 'C']) {
    const expected = fixture(`${protocol}.presentation`);
    const commands = fixture(`${protocol}.commands`);
    const { events } = playV1(circulationWorld, commands[0].runId, commands, [expected.throughMs]);
    assert.deepEqual(events, expected.events, `fixture ${protocol}`);
    assert.equal(JSON.stringify(events), JSON.stringify(engineEvidence.traces[protocol].events), `v1.0 evidence ${protocol}`);
  }
});

test('V11-00 v1 regression: committed engine and world evidence regenerate byte for byte', () => {
  for (const [script, evidence] of [['engine-evidence.js', 'engine-01.json'], ['worlds-evidence.js', 'worlds-01.json']]) {
    const output = execFileSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { maxBuffer: 1 << 28 });
    assert.ok(output.equals(readFileSync(new URL(`../evidence/${evidence}`, import.meta.url))), `${script} reproduces evidence/${evidence}`);
  }
});

test('V11-00 the same ring as a 1.1.0 world has identical dynamics; only the 1.1.0 annotations are added', () => {
  const world = createCirculationWorld();
  world.contractVersion = V11;
  for (const protocol of ['A', 'B', 'C']) {
    const expected = fixture(`${protocol}.presentation`);
    const commands = fixture(`${protocol}.commands`);
    const { events } = playV1(world, commands[0].runId, commands, [expected.throughMs]);
    assert.ok(ofType(events, 'activation').every(event => Object.hasOwn(event, 'diastolicIntervalMs')));
    for (const launch of ofType(events, 'conduction_launched')) {
      assert.deepEqual(launch.delayParts, { baseMs: 60, sourceMs: 0, entryMs: 0, lesionMs: 0, agentMs: 0 });
    }
    assert.deepEqual(ofType(events, 'link_changed').map(event => event.cause), ofType(events, 'link_changed').map(() => 'command'));
    assert.deepEqual(stripV11(events), expected.events, `fixture ${protocol} as 1.1.0`);
    assert.equal(JSON.stringify(stripV11(events)), JSON.stringify(engineEvidence.traces[protocol].events), `v1.0 evidence ${protocol} as 1.1.0`);
  }
});

test('V11-00 a 1.0.0 run keeps its snapshot shape and rejects every 1.1.0 command before mutation', () => {
  const engine = createEngine();
  const initial = engine.reset(circulationWorld, 'v1');
  assert.deepEqual(Object.keys(initial.nodes.R0), ['lastActivationMs', 'refractoryUntilMs', 'erpMs', 'recoveryTailMs', 'recovery', 'excitable']);
  assert.deepEqual(Object.keys(initial.links.L0), ['a', 'b', 'enabled', 'generation', 'ab', 'ba']);
  assert.deepEqual(Object.keys(initial.links.L0.ab), ['enabled', 'delayMs', 'decrement']);
  const base = { runId: 'v1', tMs: 10 };
  for (const command of [
    { ...base, commandId: 'a', type: 'stimulateTrain', nodeId: 'R0', startMs: 10, cycleMs: 300, count: 2, label: '' },
    { ...base, commandId: 'b', type: 'setTone', value: 0.5 },
    { ...base, commandId: 'c', type: 'ablate', target: 'L0', durationMs: 2000, completeness: 1 },
    { ...base, commandId: 'd', type: 'applyAgent', agent: 'stillness', doseScale: 1 },
    { ...base, commandId: 'e', type: 'setRestitution', nodeId: 'R0', erpMaxMs: 200, amplitudeMs: 50, tauMs: 60, erpMinMs: 100 },
    { ...base, commandId: 'f', type: 'setDecrement', linkId: 'L0', direction: 'ab', maxExtraMs: 10, tauMs: 50 },
    { ...base, commandId: 'g', type: 'setEntry', linkId: 'L0', direction: 'ab', maxExtraMs: 10, tauMs: 50 },
  ]) assert.throws(() => engine.enqueue(command), /requires a contract 1\.1\.0 world/);
  engine.enqueue({ ...base, commandId: 'a', type: 'stimulate', nodeId: 'R0' });
  assert.equal(engine.advanceTo(10).length, 4);
});

// ---------------------------------------------------------------- 11a reading

test('V11-01 readWorld accepts 1.0.0 and 1.1.0 worlds and validates the new fields before any run starts', () => {
  const engine = createEngine();
  const bare = v11World('bare', [site('A', 100)]);
  assert.ok(Object.hasOwn(engine.reset(bare, 'r').nodes.A, 'restitution'), 'contractVersion 1.1.0 selects 1.1.0');
  const inferred = { worldId: 'inferred', nodes: [site('A', 100, { tissue: 'atrial' })], links: [] };
  assert.ok(Object.hasOwn(engine.reset(inferred, 'r').nodes.A, 'suppressionMs'), 'a 1.1.0 field selects 1.1.0');
  assert.ok(!Object.hasOwn(engine.reset(dualityWorld, 'r').nodes.A, 'suppressionMs'), 'a 1.0.0 world stays 1.0.0');
  const rejects = [
    [{ ...bare, contractVersion: '2.0.0' }, /contractVersion must be 1\.1\.0 or 1\.0\.0/],
    [v11World('w', [site('A', 100, { tissue: 'muscle' })]), /tissue must be one of/],
    [v11World('w', [site('A', 100, { restitution: { erpMaxMs: 120, amplitudeMs: 10, tauMs: 60, erpMinMs: 50 } })]), /must equal the node's erpMs/],
    [v11World('w', [site('A', 100, { restitution: { erpMaxMs: 100, amplitudeMs: 10, tauMs: 60, erpMinMs: 150 } })]), /erpMinMs must not exceed/],
    [v11World('w', [site('A', 100, { audible: 'no' })]), /audible must be boolean/],
    [v11World('w', [site('A', 100), site('B', 100)], [], { coupling: [{ id: 'k', from: 'A', to: 'B', amplitude: 0.1 }] }), /automatic focus/],
    [v11World('w', [site('A', 100, { automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true, protected: 1 } })]), /protected must be boolean/],
    [v11World('w', [site('A', 100)], [], { autonomic: { breathPeriodMs: 4000, depth: 0.6, targets: ['sinus'] } }), /depth/],
    [v11World('w', [site('A', 100)], [], { autonomic: { breathPeriodMs: 4000, depth: 0.05, targets: ['sinus', 'sinus'] } }), /targets/],
    [v11World('w', [site('A', 100), site('B', 100)], [join('L', 'A', 'B', way(60, { entry: { maxExtraMs: 10 } }))]), /must have fields/],
    [v11World('w', [site('A', 100)], [], { extra: true }), /must have fields/],
  ];
  for (const [world, pattern] of rejects) assert.throws(() => engine.reset(world, 'bad'), pattern);
});

test('V11-01 readCommand validates 1.1.0 commands and enforces train safety rules', () => {
  const engine = createEngine();
  const world = v11World('w', [site('A', 100, { automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } }), site('B', 100)],
    [join('L', 'A', 'B', way(60))], { coupling: [{ id: 'k', from: 'B', to: 'A', amplitude: 0.1 }] });
  engine.reset(world, 'r');
  const at = (type, fields, commandId = 'x') => ({ runId: 'r', commandId, tMs: 10, type, ...fields });
  const rejects = [
    [at('stimulateTrain', { nodeId: 'A', startMs: 10, cycleMs: 300, count: 65, label: '' }), /count must be an integer from 1 to 64/],
    [at('stimulateTrain', { nodeId: 'A', startMs: 10, cycleMs: 149.999, count: 4, label: '' }), /outside its duration range/],
    [at('stimulateTrain', { nodeId: 'A', startMs: 9, cycleMs: 300, count: 4, label: '' }), /must not precede/],
    [at('stimulateTrain', { nodeId: 'A', startMs: 10, cycleMs: 300, count: 1.5, label: '' }), /count/],
    [at('stimulateTrain', { nodeId: 'A', startMs: 10, cycleMs: 300, count: 4, label: 7 }), /label/],
    [at('cancelTrain', { trainId: 'none' }), /Unknown command target/],
    [at('setTone', { value: 1.01 }), /Tone/],
    [at('ablate', { target: 'L', durationMs: 2000, completeness: 0 }), /completeness/],
    [at('ablate', { target: 'nope', durationMs: 2000, completeness: 1 }), /Unknown command target/],
    [at('applyAgent', { agent: 'atropine', doseScale: 1 }), /stillness or slow/],
    [at('applyAgent', { agent: 'slow', doseScale: 0 }), /Dose/],
    [at('setCoupling', { couplingId: 'k', value: 1.5 }), /Coupling/],
    [at('setRestitution', { nodeId: 'A', erpMaxMs: 200, amplitudeMs: 50, tauMs: 60, erpMinMs: 250 }), /must not exceed/],
    [at('setDecrement', { linkId: 'L', direction: 'ab', maxExtraMs: 301, tauMs: 60 }), /0–300/],
    [at('setEntry', { linkId: 'L', direction: 'up', maxExtraMs: 10, tauMs: 60 }), /Direction/],
  ];
  for (const [command, pattern] of rejects) assert.throws(() => engine.enqueue(command), pattern);
  engine.enqueue(at('stimulateTrain', { nodeId: 'A', startMs: 10, cycleMs: 150, count: 64, label: 'limit' }, 'ok'));
  assert.equal(engine.diagnostics().pendingItems, 2, 'rejected commands left no trace; a train holds one pending pulse');
});

// ---------------------------------------------------------------- §A restitution

function restitutionSequence(cycleMs, count) {
  const [erpMax, amplitude, tau, erpMin, cycle] = [300_000, 200_000, 60_000, 50_000, tick(cycleMs)];
  const sequence = [{ erp: erpMax, di: null }];
  for (let n = 1; n < count; n++) {
    const di = cycle - sequence[n - 1].erp;
    assert.ok(di >= 0, 'every pulse of the hand iteration captures');
    sequence.push({ erp: Math.min(erpMax, Math.max(erpMin, Math.round(erpMax - amplitude * Math.exp(-di / tau)))), di });
  }
  return sequence;
}

function restitutionFixedPoint(cycleMs) {
  const erp = root(e => e - (300 - 200 * Math.exp(-(cycleMs - e) / 60)), 100, 300);
  return { erp, slope: (200 / 60) * Math.exp(-(cycleMs - erp) / 60) };
}

test('V11-A restitution: an S1 train at 340 ms settles to the stable fixed point ERP 253, slope 0.78', () => {
  const { events } = play(restitutionWorld(), 'rest340', [train('S1', 0, 'A', 0, 340, 64)], [64 * 340]);
  const acts = actsAt(events, 'A');
  const expected = restitutionSequence(340, 64);
  assert.deepEqual(acts.map(event => [event.erpMs, event.diastolicIntervalMs]), expected.map(({ erp, di }) => [ms(erp), di === null ? null : ms(di)]));
  const { erp, slope } = restitutionFixedPoint(340);
  near(erp, 253, 0.5, 'spec fixed point at 340');
  near(slope, 0.78, 0.01, 'spec slope at 340');
  assert.ok(slope < 1);
  near(acts.at(-1).erpMs, erp, 0.003, 'engine settles on the fixed point');
  const last = diffs(acts.map(event => event.erpMs)).slice(-10);
  assert.ok(last.every(step => Math.abs(step) <= 0.001), 'stable: no alternation remains');
});

test('V11-A restitution: at 300 ms the slope exceeds 1 and ERP alternates long-short, matching the closed-form iteration', () => {
  const { events } = play(restitutionWorld(), 'rest300', [train('S1', 0, 'A', 0, 300, 64)], [64 * 300]);
  const acts = actsAt(events, 'A');
  const expected = restitutionSequence(300, 64);
  assert.equal(ofType(events, 'activation_blocked').length, 0);
  assert.deepEqual(acts.map(event => event.erpMs), expected.map(({ erp }) => ms(erp)));
  const { erp, slope } = restitutionFixedPoint(300);
  near(erp, 233, 1, 'spec fixed point at 300');
  near(slope, 1.1, 0.01, 'spec slope at 300');
  const steps = diffs(acts.map(event => event.erpMs)).slice(-40);
  assert.ok(steps.every((step, i) => i === 0 || Math.sign(step) === -Math.sign(steps[i - 1])), 'long-short alternation');
  assert.ok(steps.every(step => Math.abs(step) > 100), 'alternans does not decay');
});

test('V11-A restitution edits: setNodeERP moves erpMax and shifts erpMin; setRestitution replaces the law prospectively', () => {
  const run = 'rest-edit';
  const commands = [
    pulseAt('p1', 0, 'A'),
    { commandId: 'erp', tMs: 10, type: 'setNodeERP', nodeId: 'A', erpMs: 320 },
    pulseAt('p2', 330, 'A'),
    { commandId: 'law', tMs: 400, type: 'setRestitution', nodeId: 'A', erpMaxMs: 260, amplitudeMs: 100, tauMs: 50, erpMinMs: 120 },
    pulseAt('p3', 900, 'A'),
  ];
  const { events, engine } = play(restitutionWorld(), run, commands, [1500]);
  assert.deepEqual(ofType(events, 'parameter_changed').map(({ parameter, generation, previous, value, cause }) => [parameter, generation, previous, value, cause]), [
    ['erpMs', 1, 300, 320, 'command'],
    ['restitution', 1, { erpMaxMs: 320, amplitudeMs: 200, tauMs: 60, erpMinMs: 70 }, { erpMaxMs: 260, amplitudeMs: 100, tauMs: 50, erpMinMs: 120 }, 'command'],
    ['erpMs', 2, 320, 260, 'command'],
  ]);
  const acts = actsAt(events, 'A');
  // p1 captures rested at the original erpMax 300 (the edit is prospective for the ongoing period).
  assert.equal(acts[0].erpMs, 300);
  const law = (erpMax, amplitude, tau, erpMin, di) => ms(Math.min(erpMax, Math.max(erpMin, Math.round(erpMax - amplitude * Math.exp(-di / tau)))));
  assert.equal(acts[1].erpMs, law(320_000, 200_000, 60_000, 70_000, 30_000));
  const di3 = tick(900) - tick(330 + acts[1].erpMs);
  assert.equal(acts[2].erpMs, law(260_000, 100_000, 50_000, 120_000, di3));
  assert.deepEqual(engine.readAt(1500).nodes.A.restitution, { erpMaxMs: 260, amplitudeMs: 100, tauMs: 50, erpMinMs: 120 });
});

// ---------------------------------------------------------------- §B entry slowing

// Engine-independent reconstruction of every launch from earlier events (§B law).
function checkEntryLaw(events, entryOf) {
  const lastUntil = new Map();
  let checked = 0;
  for (const event of events) {
    if (event.type === 'conduction_launched') {
      const parts = event.delayParts;
      const { maxExtraMs, tauMs } = entryOf(event);
      const nominal = tick(event.departureMs) + tick(parts.baseMs) + tick(parts.lesionMs) + tick(parts.agentMs) + tick(parts.sourceMs);
      const until = lastUntil.get(event.toNodeId);
      const expected = until === undefined || nominal < until ? 0 : Math.round(tick(maxExtraMs) * Math.exp(-(nominal - until) / tick(tauMs)));
      assert.equal(tick(parts.entryMs), expected, `entry slowing of ${event.transitId}`);
      assert.equal(tick(event.arrivalMs), nominal + expected, `arrival of ${event.transitId}`);
      checked++;
    }
    if (event.type === 'activation') lastUntil.set(event.nodeId, tick(event.refractoryUntilMs));
  }
  return checked;
}

function entryRingFixedPoint() {
  const { delayMs, entry, restitution } = ENTRY_RING;
  const erpOf = cycle => root(e => e - (restitution.erpMaxMs - restitution.amplitudeMs * Math.exp(-(cycle - e) / restitution.tauMs)), 50, 300);
  const entryOf = cycle => root(d => d - entry.maxExtraMs * Math.exp(-(cycle - d - erpOf(cycle)) / entry.tauMs), 0, entry.maxExtraMs);
  return root(cycle => cycle - 8 * (delayMs + entryOf(cycle)), 8 * delayMs, 8 * (delayMs + entry.maxExtraMs));
}

test('V11-B entry slowing: ring reentry varies lap to lap, settles within 5 ms after the third lap, on the closed-form cycle', () => {
  const { events } = play(entryRingWorld(), 'entry-ring', [pulseAt('S', 0, 'R4')], [8000]);
  const laps = diffs(timesAt(events, 'R0'));
  assert.ok(laps.length >= 20);
  assert.ok(Math.max(...diffs(laps.slice(0, 4)).map(Math.abs)) > 1, 'early laps differ by more than 1 ms');
  assert.ok(diffs(laps.slice(2)).every(change => Math.abs(change) < 5), 'after the third lap, changes stay under 5 ms');
  near(laps.at(-1), entryRingFixedPoint(), 0.008, 'steady cycle equals the fixed point of the §A and §B laws');
  assert.ok(checkEntryLaw(events, () => ENTRY_RING.entry) > 100);
});

test('V11-B entry slowing: an S2 scan during reentry gives a monotonic resetting curve; without entry it is flat', () => {
  const curve = entry => {
    const steady = play(entryRingWorld({ entry }), 'scan', [pulseAt('S', 0, 'R4')], [3000]).events;
    const base = timesAt(steady, 'R0')[5];
    const rows = [];
    for (let coupling = 300; coupling >= 150; coupling -= 5) {
      const { events } = play(entryRingWorld({ entry }), 'scan', [pulseAt('S', 0, 'R4'), pulseAt('S2', base + coupling, 'R0')], [base + coupling + 2000]);
      const captured = actsAt(events, 'R0').some(event => event.tMs === base + coupling);
      const next = timesAt(events, 'R0').find(t => t > base + coupling);
      if (captured && next !== undefined) rows.push([coupling, next - base - coupling]);
      if (entry !== null) checkEntryLaw(events, () => entry);
    }
    return rows;
  };
  const rising = curve(ENTRY_RING.entry);
  assert.ok(rising.length >= 15, 'a wide reset window');
  assert.ok(diffs(rising.map(([, cycle]) => cycle)).every(step => step > 0), 'return cycle rises as S2 gets earlier');
  assert.ok(rising.at(-1)[1] - rising[0][1] > 30);
  const flat = curve(null);
  assert.ok(flat.length >= 15);
  assert.ok(flat.every(([, cycle]) => cycle === 8 * ENTRY_RING.delayMs), 'no entry slowing: every reset returns after exactly 8 x 35 ms');
});

// ---------------------------------------------------------------- §C overdrive, pauses, tone, breath

test('V11-C overdrive: 30 pulses at 500 ms into an 800 ms focus return after 1250 ms, then 1070, 962 and 897.2 ms', () => {
  const { events, engine } = play(focusWorld(), 'overdrive', [train('drive', 0, 'S', 500, 500, 30)], [21000]);
  // Hand iteration: each driven beat adds g (T - I) = 0.06 x 300 = 18 ms, capped at 450 ms.
  let suppression = 0;
  for (let k = 1; k <= 30; k++) suppression = Math.min(450, suppression + 0.06 * (800 - 500));
  assert.equal(suppression, 450);
  const lastPaced = 500 * 30;
  const expectedReturns = [800 + suppression, 800 + 0.6 * suppression, 800 + 0.6 ** 2 * suppression, 800 + 0.6 ** 3 * suppression];
  assert.deepEqual(expectedReturns.map(v => Math.round(v * 1000) / 1000), [1250, 1070, 962, 897.2]);
  const spontaneous = autoAttempts(events);
  assert.equal(spontaneous[0], 0);
  assert.deepEqual(diffs([lastPaced, ...spontaneous.slice(1, 5)]).map((value, i) => Math.abs(value - expectedReturns[i]) <= 0.001), [true, true, true, true]);
  assert.equal(actsAt(events, 'S').filter(event => event.source === 'stimulus').length, 30, 'every pulse captures and resets the focus');
  assert.equal(engine.readAt(lastPaced).nodes.S.suppressionMs, 450);
  assert.equal(engine.readAt(spontaneous[1]).nodes.S.suppressionMs, 270);
});

test('V11-C pauses: non-reset focus gives exactly 2x cycle; reset gives cycle + coupling; overdrive adds g (T - I)', () => {
  const pause = options => {
    const { events } = play(focusWorld({ erpMs: 350, overdrive: null, ...options }), 'pvc', [pulseAt('pvc', 0, 'S'), pulseAt('pvc2', 500, 'S')], [2500]);
    const spontaneous = actsAt(events, 'S').filter(event => event.source !== 'stimulus').map(event => event.tMs);
    return { spontaneous, blocked: ofType(events, 'activation_blocked').map(event => event.tMs) };
  };
  // Beats at 0 (stimulus and the first attempt merge) and a premature capture at 500 ms.
  const compensatory = pause({ resetOnCapture: false });
  assert.deepEqual(compensatory.blocked, [800], 'the attempt 300 ms after the PVC falls in its 350 ms ERP');
  assert.equal(compensatory.spontaneous[1] - compensatory.spontaneous[0], 2 * 800);
  const reset = pause({ resetOnCapture: true });
  assert.equal(reset.spontaneous[1] - reset.spontaneous[0], 800 + 500);
  const suppressed = pause({ resetOnCapture: true, overdrive: { gainPerBeat: 0.06, maxMs: 450, warmupFactor: 0.6 } });
  assert.equal(suppressed.spontaneous[1] - suppressed.spontaneous[0], 800 + 500 + 0.06 * (800 - 500));
});

test('V11-C Breath: RR intervals follow T (1 + d sin(2 pi t / P)) at scheduling time within one tick', () => {
  const autonomic = { breathPeriodMs: 4000, depth: 0.05, targets: ['sinus'] };
  const { events } = play(focusWorld({ overdrive: null, autonomic }), 'breath', [], [40000]);
  const beats = autoAttempts(events);
  let t = 0;
  for (const beat of beats) {
    assert.ok(Math.abs(tick(beat) - t) <= 1, `beat at ${beat}`);
    t += Math.round(800_000 * (1 + 0.05 * Math.sin((2 * Math.PI * t) / 4_000_000)));
  }
  const rr = diffs(beats.map(tick)).map(ms);
  assert.ok(Math.max(...rr) <= 840 && Math.max(...rr) > 835, 'longest RR approaches 800 x 1.05');
  assert.ok(Math.min(...rr) >= 760 && Math.min(...rr) < 765, 'shortest RR approaches 800 x 0.95');
});

test('V11-C Breath on nodal targets scales nodal decrement maxExtra by 1 + d sin(2 pi t / P) at launch; sinus is untouched', () => {
  const world = v11World('breath-nodal', [
    site('S', 200, { tissue: 'sinus', automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } }),
    site('N', 300, { tissue: 'nodal' }),
    site('H', 200, { tissue: 'hisPurkinje' }),
  ], [join('SN', 'S', 'N', way(20)), join('NH', 'N', 'H', way(60, { decrement: { maxExtraMs: 90, tauMs: 120 } }))],
  { autonomic: { breathPeriodMs: 3000, depth: 0.2, targets: ['nodal'] } });
  const { events } = play(world, 'breath-nodal', [], [8000]);
  assert.deepEqual(diffs(autoAttempts(events)).filter(rr => rr !== 800), [], 'sinus is not a target');
  const launches = ofType(events, 'conduction_launched').filter(event => event.linkId === 'NH').slice(1);
  for (const launch of launches) {
    const t = tick(launch.departureMs);
    const factor = 1 + 0.2 * Math.sin((2 * Math.PI * t) / 3_000_000);
    assert.equal(tick(launch.delayParts.sourceMs), Math.round(90_000 * factor * Math.exp(-500_000 / 120_000)), `NH at ${launch.departureMs}`);
  }
});

test('V11-C setDecrement and setEntry change the laws for later launches only', () => {
  const world = v11World('laws', [site('A', 100), site('B', 100)], [join('AB', 'A', 'B', way(60))]);
  const commands = [pulseAt('b0', 0, 'B'), pulseAt('a0', 150, 'A'),
    { commandId: 'dec', tMs: 200, type: 'setDecrement', linkId: 'AB', direction: 'ab', maxExtraMs: 20, tauMs: 50 },
    { commandId: 'ent', tMs: 200, type: 'setEntry', linkId: 'AB', direction: 'ab', maxExtraMs: 30, tauMs: 40 },
    pulseAt('a1', 400, 'A')];
  const { events, engine } = play(world, 'laws', commands, [800]);
  assert.deepEqual(ofType(events, 'parameter_changed').map(({ parameter, linkId, direction, previous, value, generation }) => [parameter, linkId, direction, previous, value, generation]),
    [['decrement', 'AB', 'ab', null, { maxExtraMs: 20, tauMs: 50 }, 1], ['entry', 'AB', 'ab', null, { maxExtraMs: 30, tauMs: 40 }, 1]]);
  const [before, after] = ofType(events, 'conduction_launched');
  assert.deepEqual(before.delayParts, { baseMs: 60, sourceMs: 0, entryMs: 0, lesionMs: 0, agentMs: 0 });
  // A recovered 400 - 250 = 150 ms. A's first wave captured B at 210, so B's refractory period ends at 310.
  assert.deepEqual(timesAt(events, 'B').slice(0, 2), [0, 210]);
  const source = Math.round(20_000 * Math.exp(-150_000 / 50_000));
  const nominal = 400_000 + 60_000 + source;
  const entry = Math.round(30_000 * Math.exp(-(nominal - 310_000) / 40_000));
  assert.deepEqual([tick(after.delayParts.sourceMs), tick(after.delayParts.entryMs), tick(after.arrivalMs)], [source, entry, nominal + entry]);
  assert.deepEqual(engine.readAt(800).links.AB.ab.entry, { maxExtraMs: 30, tauMs: 40 });
});

test('V11-C setTone (positive = sympathetic) scales the sinus cycle by 1 - 0.2 v and nodal decrement by 1 - 0.5 v, prospectively', () => {
  const world = v11World('tone', [
    site('S', 200, { tissue: 'sinus', automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } }),
    site('N', 300, { tissue: 'nodal' }),
    site('H', 200, { tissue: 'hisPurkinje' }),
  ], [join('SN', 'S', 'N', way(20)), join('NH', 'N', 'H', way(60, { decrement: { maxExtraMs: 90, tauMs: 120 } }))]);
  const { events } = play(world, 'tone', [{ commandId: 'tone', tMs: 100, type: 'setTone', value: 1 }], [5000]);
  const [changed] = ofType(events, 'parameter_changed');
  assert.deepEqual({ ...changed, runId: undefined, worldId: undefined, seq: undefined, eventId: undefined },
    { runId: undefined, worldId: undefined, seq: undefined, eventId: undefined, tMs: 100, type: 'parameter_changed', parameter: 'tone', commandId: 'tone', generation: 1, previous: 0, value: 1, cause: 'command' });
  assert.deepEqual(autoAttempts(events), [0, 800, 1440, 2080, 2720, 3360, 4000, 4640], 'the attempt pending at 800 keeps its time; later cycles are 640 ms');
  const nodal = ofType(events, 'conduction_launched').filter(event => event.linkId === 'NH');
  assert.equal(nodal[0].delayParts.sourceMs, 0, 'rested N');
  // N recovers 800 - 300 = 500 ms before the 800 beat, then 640 - 300 = 340 ms.
  assert.equal(nodal[1].delayParts.sourceMs, ms(Math.round(90_000 * 0.5 * Math.exp(-500 / 120))));
  assert.equal(nodal[2].delayParts.sourceMs, ms(Math.round(90_000 * 0.5 * Math.exp(-340 / 120))));
});

// ---------------------------------------------------------------- §D coupling

const A_CYCLE = 720_000;
const B_CYCLE = 1_030_000;
// Independent event-level iteration of the §D sine circle map (A never perturbed).
function hemiolaMap(amplitude, throughTicks) {
  let a = 0;
  let origin = 170_000 - B_CYCLE;
  let next = 170_000;
  const fires = [];
  while (Math.min(a, next) <= throughTicks) {
    if (next < a) {
      fires.push(next);
      origin = next;
      next += B_CYCLE;
      continue;
    }
    if (next === a) { fires.push(next); origin = next; next += B_CYCLE; }
    const phase = (a - origin) / B_CYCLE;
    if (amplitude !== 0 && phase >= 0 && phase < 1) next = Math.max(a + 1, next + Math.round(B_CYCLE * amplitude * Math.sin(2 * Math.PI * phase)));
    a += A_CYCLE;
  }
  return fires;
}
const WINDOW = [100, 520]; // A beats: 420 cycles, a multiple of 3, 4, 7 and 10
const rotationCount = fires => fires.filter(t => t >= WINDOW[0] * A_CYCLE && t < WINDOW[1] * A_CYCLE).length;

test('V11-D coupling sweep over Duality cycles: 2:3 at 0.155–0.205, narrow 5:7 near 0.1825, 3:4 at 0.21–0.22', () => {
  const through = WINDOW[1] * A_CYCLE;
  const counts = new Map();
  const amplitudes = [...Array.from({ length: 51 }, (_, k) => k / 200), 0.1825, 0.184];
  for (const amplitude of amplitudes) {
    const { events } = play(hemiolaWorld(amplitude), 'hemiola', [], [ms(through)]);
    const fires = timesAt(events, 'B').map(tick);
    assert.deepEqual(fires, hemiolaMap(amplitude, through), `B firing times at a = ${amplitude}`);
    assert.equal(timesAt(events, 'A').length, WINDOW[1] + 1);
    counts.set(amplitude, rotationCount(fires));
  }
  const lock = (p, q) => 420 * p / q;
  assert.deepEqual(diffs(timesAt(play(hemiolaWorld(0), 'free', [], [20000]).events, 'B')).filter(v => v !== 1030), [], 'uncoupled B keeps 1030 ms');
  near(720 / 1030, 0.699, 0.0005, 'uncoupled ratio');
  for (const [amplitude, count] of counts) {
    if (amplitude >= 0.155 && amplitude <= 0.205 && amplitude !== 0.1825 && amplitude !== 0.184) assert.equal(count, lock(2, 3), `2:3 at a = ${amplitude}`);
    if (amplitude >= 0.21 && amplitude <= 0.22) assert.equal(count, lock(3, 4), `3:4 at a = ${amplitude}`);
  }
  assert.equal(counts.get(0.1825), lock(5, 7));
  assert.equal(counts.get(0.184), lock(5, 7));
  const locked = play(hemiolaWorld(0.17), 'locked', [], [ms(through)]).events;
  const b = timesAt(locked, 'B').map(tick).slice(-30);
  assert.ok(b.slice(2).every((t, i) => Math.abs(t - b[i] - 3 * A_CYCLE) <= 5), 'locked: two B beats per three A beats, every time');
});

test('V11-D a protected focus blocks entry with cause protected, keeps its cadence and still exits', () => {
  const focus = { cycleMs: 1000, firstAttemptMs: 100, resetOnCapture: true, protected: true };
  const world = v11World('protected', [site('P', 200, { automaticity: focus }), site('Q', 50)], [join('PQ', 'P', 'Q', way(50), way(50))]);
  const { events } = play(world, 'protected', [pulseAt('q', 0, 'Q'), pulseAt('p', 400, 'P')], [1500]);
  const blocked = ofType(events, 'activation_blocked');
  assert.deepEqual(blocked.map(({ tMs, nodeId, cause, remainingErpMs, refractoryUntilMs, source }) => [tMs, nodeId, cause, remainingErpMs, refractoryUntilMs, source]),
    [[50, 'P', 'protected', 0, null, 'conduction'], [400, 'P', 'protected', 0, 300, 'stimulus']]);
  assert.deepEqual(timesAt(events, 'P'), [100, 1100], 'the focus keeps its own cadence');
  assert.deepEqual(timesAt(events, 'Q'), [0, 150, 1150], 'exit conducts to excitable neighbours');
});

test('V11-D phase_modulated follows the sine phase-response curve from the last firing', () => {
  const focus = { cycleMs: 1000, firstAttemptMs: 100, resetOnCapture: true, protected: true };
  const world = v11World('prc', [site('P', 200, { automaticity: focus }), site('Q', 50)], [],
    { coupling: [{ id: 'QP', from: 'Q', to: 'P', amplitude: 0.1 }] });
  const { events } = play(world, 'prc', [pulseAt('q1', 0, 'Q'), pulseAt('q2', 300, 'Q')], [2500]);
  // Before its first attempt P counts as having fired at 100 - 1000 = -900 ms.
  const shift1 = Math.round(1_000_000 * 0.1 * Math.sin(2 * Math.PI * 0.9));
  const fire1 = 100_000 + shift1;
  const phase2 = (300_000 - fire1) / 1_000_000;
  const shift2 = Math.round(1_000_000 * 0.1 * Math.sin(2 * Math.PI * phase2));
  const fire2 = fire1 + 1_000_000 + shift2;
  assert.deepEqual(ofType(events, 'phase_modulated').map(({ tMs, nodeId, couplingId, phase, shiftMs, nextAttemptMs }) => [tMs, nodeId, couplingId, phase, shiftMs, nextAttemptMs]),
    [[0, 'P', 'QP', 0.9, ms(shift1), ms(fire1)], [300, 'P', 'QP', phase2, ms(shift2), ms(fire2)]]);
  assert.ok(shift1 < 0 && shift2 > 0, 'late inputs advance, early inputs delay');
  assert.deepEqual(timesAt(events, 'P'), [ms(fire1), ms(fire2), ms(fire2 + 1_000_000)]);
  const [first] = ofType(events, 'phase_modulated');
  assert.equal(first.sourceActivationId, actsAt(events, 'Q')[0].eventId);
});

test('V11-D the expected 100 ms advance at phase 0.9 moves the focus earlier; setCoupling edits the amplitude', () => {
  const focus = { cycleMs: 1000, firstAttemptMs: 100, resetOnCapture: true, protected: true };
  const world = v11World('coupling-edit', [site('P', 200, { automaticity: focus }), site('Q', 50)], [],
    { coupling: [{ id: 'QP', from: 'Q', to: 'P', amplitude: 0.1 }] });
  const commands = [{ commandId: 'k', tMs: 500, type: 'setCoupling', couplingId: 'QP', value: 0.2 }, pulseAt('q', 900, 'Q'), { commandId: 'k0', tMs: 950, type: 'setCoupling', couplingId: 'QP', value: 0.2 }];
  const { events } = play(world, 'coupling-edit', commands, [2500]);
  assert.deepEqual(ofType(events, 'parameter_changed').map(({ parameter, couplingId, previous, value, generation, cause }) => [parameter, couplingId, previous, value, generation, cause]),
    [['coupling', 'QP', 0.1, 0.2, 1, 'command']], 'a no-op edit emits nothing');
  // P fired at 100; Q at 900 is at phase 0.8: shift = 1000 x 0.2 x sin(1.6 pi).
  const shift = Math.round(1_000_000 * 0.2 * Math.sin(2 * Math.PI * 0.8));
  assert.deepEqual(timesAt(events, 'P'), [100, ms(1_100_000 + shift), ms(1_100_000 + shift + 1_000_000)]);
});

// ---------------------------------------------------------------- §E concealed conduction

// Hand recurrence for the chain (§B entry into N3, v1.0 decrement on N12 and N23).
function chainByHand(cycleMs, beats) {
  const { erp, delay, decrement, entry } = CHAIN;
  const T = key => tick(erp[key]);
  const extra = (law, recovery) => Math.round(tick(law.maxExtraMs) * Math.exp(-recovery / tick(law.tauMs)));
  const until = { N1: null, N2: null, N3: null };
  const rows = [];
  for (let n = 0; n < beats; n++) {
    const atrial = n * tick(cycleMs);
    const n1 = atrial + tick(delay.AN1);
    const toN2 = until.N1 === null ? 0 : extra(decrement.N12, n1 - until.N1);
    until.N1 = n1 + T('N1');
    const n2 = n1 + tick(delay.N12) + toN2;
    const toN3 = until.N2 === null ? 0 : extra(decrement.N23, n2 - until.N2);
    until.N2 = n2 + T('N2');
    const nominal = n2 + tick(delay.N23) + toN3;
    if (until.N3 !== null && nominal < until.N3) {
      rows.push({ atrial, conducted: false, blockedAt: nominal, remaining: until.N3 - nominal });
      continue;
    }
    const n3 = nominal + (until.N3 === null ? 0 : extra(entry, nominal - until.N3));
    until.N3 = n3 + T('N3');
    rows.push({ atrial, conducted: true, ah: n3 + tick(delay.N3H) - atrial });
  }
  return rows;
}

test('V11-E concealed conduction: a three-site nodal chain paced at 300 ms gives 4:3 Wenckebach with progressive prolongation', () => {
  const beats = 24;
  const { events } = play(chainWorld(), 'chain', [train('drive', 0, 'A', 0, 300, beats)], [beats * 300 + 600]);
  const hand = chainByHand(300, beats);
  const his = timesAt(events, 'H');
  assert.deepEqual(his.map(tick), hand.filter(row => row.conducted).map(row => row.atrial + row.ah));
  assert.deepEqual(ofType(events, 'activation_blocked').map(event => [event.nodeId, tick(event.tMs), tick(event.remainingErpMs)]),
    hand.filter(row => !row.conducted).map(row => ['N3', row.blockedAt, row.remaining]));
  const pattern = hand.map(row => (row.conducted ? 'C' : 'x')).join('');
  assert.equal(pattern, 'CCCx'.repeat(beats / 4), 'groups of four atrial beats, three conducted');
  for (let group = 1; group < beats / 4; group++) {
    const ah = hand.slice(group * 4, group * 4 + 3).map(row => row.ah);
    assert.ok(ah[0] < ah[1] && ah[1] < ah[2], 'AH prolongs within each group');
    assert.ok(ah[1] - ah[0] > ah[2] - ah[1], 'increments decrease, so H-H shortens before the pause');
  }
  assert.deepEqual(hand.slice(-4, -1).map(row => ms(row.ah)), [179.5, 210.067, 230.701]);
  // Every blocked beat captured N1 and N2 silently: a launch tree ending in a block without an audible site.
  for (const row of hand.filter(item => !item.conducted)) {
    const window = captures(events).filter(event => tick(event.tMs) > row.atrial && tick(event.tMs) < row.atrial + tick(300));
    assert.deepEqual(window.map(event => event.nodeId), ['N1', 'N2']);
  }
  const world = chainWorld();
  assert.deepEqual(world.nodes.filter(node => node.audible === false).map(node => node.id), ['N1', 'N2', 'N3']);
});

test('V11-E the same chain conducts 1:1 at 320 ms and 3:2 at 280 ms', () => {
  for (const [cycleMs, pattern] of [[320, 'C'], [280, 'CCx']]) {
    const beats = 24;
    const { events } = play(chainWorld(), 'chain', [train('drive', 0, 'A', 0, cycleMs, beats)], [beats * cycleMs + 600]);
    const hand = chainByHand(cycleMs, beats);
    assert.deepEqual(timesAt(events, 'H').map(tick), hand.filter(row => row.conducted).map(row => row.atrial + row.ah));
    assert.equal(hand.map(row => (row.conducted ? 'C' : 'x')).join(''), pattern.repeat(beats / pattern.length));
  }
});

// ---------------------------------------------------------------- §F lesion

// Hand recurrence for the induced ring: R0 -> R7 -> R6 (120 ms), across L5, then five 60 ms links to R0.
function lesionLaps({ start, durationMs, from, to }, throughMs) {
  const steps = [];
  for (let k = 1; ; k++) {
    const elapsed = Math.min(k * 250, durationMs);
    steps.push({ t: start + elapsed, p: elapsed === durationMs ? to : from + (to - from) * elapsed / durationMs });
    if (elapsed === durationMs) break;
  }
  const delayAt = t => {
    const p = steps.filter(step => step.t <= t).at(-1)?.p ?? from;
    return p === 0 ? 60_000 : Math.round(60_000 * (1 + 3 * p * p));
  };
  const end = steps.at(-1).t;
  const r0 = [0, 240, 720];
  let lastR6 = null;
  while (true) {
    const r6 = r0.at(-1) + 120;
    if (r6 > throughMs) break;
    lastR6 = r6;
    if (to === 1 && r6 >= end) break;
    const arrival = tick(r6) + delayAt(r6);
    if (to === 1 && arrival > tick(end)) break;
    r0.push(ms(arrival + tick(300)));
  }
  return { r0: r0.filter(t => t <= throughMs), steps, lastR6, end };
}

test('V11-F a complete ablation slows the circulating wave stepwise and terminates it on the first lap after p = 1', () => {
  const plan = { start: 2000, durationMs: 2000, from: 0, to: 1 };
  const { events, engine } = play(lesionRingWorld(), 'lesion', [...induction, ablate('burn', 2000, 'L5', 2000, 1)], [8000]);
  const hand = lesionLaps(plan, 8000);
  assert.deepEqual(timesAt(events, 'R0'), hand.r0);
  assert.deepEqual(ofType(events, 'lesion_changed').map(({ tMs, progress, completeness }) => [tMs, progress, completeness]),
    hand.steps.map(({ t, p }) => [t, p, 1]));
  const delays = ofType(events, 'parameter_changed');
  assert.ok(delays.every(event => event.parameter === 'delayMs' && event.cause === 'lesion' && event.commandId === 'burn'));
  assert.deepEqual(delays.filter(event => event.direction === 'ba').map(event => event.value),
    hand.steps.map(({ p }) => ms(Math.round(60_000 * (1 + 3 * p * p)))));
  assert.deepEqual(ofType(events, 'link_changed').map(({ tMs, value, cause, commandId }) => [tMs, value, cause, commandId]), [[4000, false, 'lesion', 'burn']]);
  assert.deepEqual(ofType(events, 'conduction_canceled').map(({ tMs, linkId, cause }) => [tMs, linkId, cause]), [[4000, 'L5', 'lesion']]);
  assert.equal(captures(events).at(-1).tMs, hand.lastR6);
  assert.equal(captures(events).at(-1).nodeId, 'R6');
  assert.equal(engine.diagnostics().pendingItems, 0, 'the ring is quiescent');
  assert.deepEqual(engine.readAt(8000).links.L5.lesion, { progress: 1, completeness: 1 });
});

test('V11-F an incomplete ablation leaves reentry with a longer cycle; a second pass completes the line', () => {
  const plan = { start: 2000, durationMs: 2000, from: 0, to: 0.5 };
  const { events } = play(lesionRingWorld(), 'gap', [...induction, ablate('pass1', 2000, 'L5', 2000, 0.5)], [9000]);
  const hand = lesionLaps(plan, 9000);
  assert.deepEqual(timesAt(events, 'R0'), hand.r0);
  assert.deepEqual(diffs(hand.r0.map(tick)).slice(-4), [525_000, 525_000, 525_000, 525_000], 'gap conducts with 60 x (1 + 3 x 0.25) = 105 ms');
  assert.equal(ofType(events, 'link_changed').length, 0);
  const second = play(lesionRingWorld(), 'gap2', [...induction, ablate('pass1', 2000, 'L5', 2000, 0.5), ablate('pass2', 5000, 'L5', 2000, 1),
    ablate('noop', 5500, 'L5', 2000, 0.8)], [12000]).events;
  assert.deepEqual(ofType(second, 'lesion_changed').filter(event => event.tMs > 5000).map(event => event.progress),
    Array.from({ length: 8 }, (_, k) => 0.5 + 0.5 * (k + 1) / 8));
  assert.deepEqual(ofType(second, 'link_changed').map(({ tMs, commandId }) => [tMs, commandId]), [[7000, 'pass2']]);
  assert.ok(captures(second).at(-1).tMs < 7000 + 525, 'no lap completes after the line closes');
  assert.equal(ofType(second, 'parameter_changed').filter(event => event.commandId === 'noop').length, 0,
    'a pass below the in-progress target (1) is a no-op and does not shrink it');
});

// ---------------------------------------------------------------- trains

test('V11-O2 stimulateTrain emits <commandId>#<k> pulses in train-command order and completes after its last pulse', () => {
  const world = v11World('trains', [site('A', 100), site('B', 100), site('C', 100)]);
  const commands = [train('X', 0, 'A', 300, 200, 3), pulseAt('Y', 300, 'B'), train('Z', 0, 'C', 300, 400, 2)];
  const { events } = play(world, 'trains', commands, [2000]);
  assert.deepEqual(ofType(events, 'stimulus_attempted').map(({ tMs, triggerId, nodeId }) => [tMs, triggerId, nodeId]), [
    [300, 'X#1', 'A'], [300, 'Y', 'B'], [300, 'Z#1', 'C'], [500, 'X#2', 'A'], [700, 'X#3', 'A'], [700, 'Z#2', 'C'],
  ]);
  const at700 = events.filter(event => event.tMs === 700).map(event => event.type);
  assert.deepEqual(at700, ['stimulus_attempted', 'stimulus_attempted', 'activation', 'activation', 'train_completed', 'train_completed']);
  assert.deepEqual(ofType(events, 'train_completed').map(({ commandId, trainId, delivered, count, cancelled }) => [commandId, trainId, delivered, count, cancelled]),
    [['X', 'X', 3, 3, false], ['Z', 'Z', 2, 2, false]]);
});

test('V11-T cancelTrain removes pulses at and after its instant and closes the train once with its partial count', () => {
  const world = v11World('cancel', [site('A', 100)]);
  const commands = [train('T', 0, 'A', 100, 200, 10), { commandId: 'stop', tMs: 500, type: 'cancelTrain', trainId: 'T' },
    { commandId: 'again', tMs: 900, type: 'cancelTrain', trainId: 'T' }];
  const { events, engine } = play(world, 'cancel', commands, [3000]);
  assert.deepEqual(ofType(events, 'stimulus_attempted').map(event => event.triggerId), ['T#1', 'T#2']);
  assert.deepEqual(events.filter(event => event.tMs >= 500).map(({ tMs, type, commandId, trainId, delivered, count, cancelled }) =>
    [tMs, type, commandId, trainId, delivered, count, cancelled]), [[500, 'train_completed', 'T', 'T', 2, 10, true]], 'a repeated cancel emits nothing');
  assert.equal(engine.diagnostics().pendingItems, 0);
});

test('V11-T overlapping trains are capped from the command log alone, so live input and replay agree', () => {
  const world = v11World('cap', [site('A', 100), site('B', 100)], [], { limits: { maxConcurrentTrains: 2 } });
  const log = [
    train('t1', 0, 'A', 0, 200, 10), train('t2', 0, 'B', 100, 200, 10), train('t3', 0, 'A', 2100, 200, 5),
    { commandId: 'c1', tMs: 500, type: 'cancelTrain', trainId: 't1' },
    train('t4', 600, 'A', 600, 200, 5), train('t5', 600, 'B', 700, 200, 5),
  ];
  const outcome = (live) => {
    const engine = createEngine();
    engine.reset(world, 'cap');
    const accepted = [];
    const events = [];
    for (const command of log) {
      if (live && command.tMs > 0) events.push(...engine.advanceTo(command.tMs - 1));
      try { engine.enqueue({ runId: 'cap', ...command }); accepted.push(command.commandId); } catch { /* rejected */ }
    }
    events.push(...engine.advanceTo(5000));
    return { accepted, events };
  };
  const upFront = outcome(false);
  const live = outcome(true);
  // t2 overlaps t1; t3 starts after both end; after c1, t1 ends before 500, so t4 overlaps only t2; t5 overlaps t2 and t4.
  assert.deepEqual(upFront.accepted, ['t1', 't2', 't3', 'c1', 't4']);
  assert.deepEqual(live.accepted, upFront.accepted);
  assert.deepEqual(live.events, upFront.events);
});

test('V11-T train pulses are charged to the processing budget; a fault names the instant and keeps earlier batches', () => {
  const world = v11World('budget', [site('A', 100)]);
  const engine = createEngine({ processingBudget: 100 });
  engine.reset(world, 'budget');
  engine.enqueue({ runId: 'budget', ...train('long', 0, 'A', 0, 150, 64) });
  // Each pulse batch costs 3 units (agenda item, stimulus_attempted, activation): 33 batches fit in 100.
  assert.throws(() => engine.advanceTo(64 * 150), error => error instanceof SimulationFault && error.code === 'PROCESSING_BUDGET' &&
    error.tMs === 33 * 150 && error.committedThroughMs === 32 * 150 && error.events.length === 66);
  assert.equal(engine.readAt(32 * 150).nodes.A.lastActivationMs, 32 * 150);
  assert.throws(() => engine.advanceTo(64 * 150), /faulted/);
  const steps = play(world, 'budget', [train('long', 0, 'A', 0, 150, 64)], Array.from({ length: 64 }, (_, k) => k * 150 + 100), { processingBudget: 100 });
  const whole = play(world, 'budget', [train('long', 0, 'A', 0, 150, 64)], [64 * 150]);
  assert.deepEqual(steps.events, whole.events);
  assert.equal(ofType(whole.events, 'train_completed')[0].delivered, 64);
});

// ---------------------------------------------------------------- agents

// Stillness envelope e(t) from the Maneuvers section, written out independently.
const envelope = elapsedMs => (elapsedMs <= 1500 ? elapsedMs / 1500 : elapsedMs <= 3500 ? 1 : elapsedMs <= 9500 ? 1 - (elapsedMs - 3500) / 6000 : 0);

test('V11-G Stillness: nodal ERP + 600 e, atrial ERP x (1 - 0.2 e), sinus cycle x (1 + 0.5 e) in 100 ms steps; others unaffected', () => {
  const world = v11World('stillness', [
    site('At', 200, { tissue: 'atrial' }),
    site('No', 300, { tissue: 'nodal' }),
    site('Sx', 150, { tissue: 'sinus', automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } }),
    site('Ve', 250, { tissue: 'ventricular' }),
  ]);
  const { events } = play(world, 'still', [{ commandId: 'adeno', tMs: 1000, type: 'applyAgent', agent: 'stillness', doseScale: 1 },
    pulseAt('peakA', 3000, 'At'), pulseAt('peakN', 3000, 'No')], [12000]);
  const changes = ofType(events, 'parameter_changed');
  assert.ok(changes.every(event => event.cause === 'agent' && event.commandId === 'adeno'));
  assert.equal(changes.filter(event => event.nodeId === 'Ve').length, 0);
  const expectFor = (nodeId, parameter, law) => {
    const rows = [];
    let previous = law(0);
    for (let k = 1; k <= 95; k++) {
      const value = law(envelope(100 * k));
      if (value !== previous) rows.push([1000 + 100 * k, ms(previous), ms(value)]);
      previous = value;
    }
    assert.deepEqual(changes.filter(event => event.nodeId === nodeId).map(event => [event.tMs, event.previous, event.value]), rows, nodeId);
    assert.ok(changes.filter(event => event.nodeId === nodeId).every(event => event.parameter === parameter));
    assert.equal(rows.at(-1)[2], ms(law(0)), `${nodeId} returns to its base value`);
  };
  expectFor('No', 'erpMs', e => 300_000 + Math.round(600_000 * e));
  expectFor('At', 'erpMs', e => Math.round(200_000 * (1 - 0.2 * e)));
  expectFor('Sx', 'cycleMs', e => Math.round(800_000 * (1 + 0.5 * e)));
  assert.deepEqual(actsAt(events, 'At').map(event => event.erpMs), [160]);
  assert.deepEqual(actsAt(events, 'No').map(event => event.erpMs), [900]);
  // The sinus focus schedules with the scale in force at each firing (steps apply before captures).
  let t = 0;
  const expected = [];
  while (t <= 12000) {
    expected.push(t);
    const elapsed = t - 1000;
    const scale = elapsed < 100 ? 1 : 1 + 0.5 * envelope(Math.floor(elapsed / 100) * 100);
    t = ms(tick(t) + Math.round(800_000 * scale));
  }
  assert.deepEqual(timesAt(events, 'Sx'), expected);
});

test('V11-G Slow the current: non-nodal delays x (1 + 0.3 dose (1 + max(0, (400 - CL) / 400))) after a 3000 ms ramp', () => {
  const world = v11World('slow', [site('P', 200), site('Q', 100), site('Nd', 100, { tissue: 'nodal' })],
    [join('PQ', 'P', 'Q', way(60)), join('PN', 'P', 'Nd', way(60))]);
  const { events, engine } = play(world, 'slow', [{ commandId: 'ic', tMs: 0, type: 'applyAgent', agent: 'slow', doseScale: 1 },
    pulseAt('a', 4000, 'P'), pulseAt('b', 4500, 'P'), pulseAt('c', 4800, 'P')], [6000]);
  const ramp = ofType(events, 'parameter_changed');
  assert.deepEqual(ramp.map(event => [event.tMs, event.linkId, event.parameter, event.value]),
    Array.from({ length: 30 }, (_, k) => [100 * (k + 1), 'PQ', 'slowing', k === 29 ? 1 : (k + 1) / 30]));
  const parts = link => ofType(events, 'conduction_launched').filter(event => event.linkId === link).map(event => event.delayParts.agentMs);
  const agent = cycle => ms(Math.round(60_000 * 0.3 * 1 * (1 + (cycle === null ? 0 : Math.max(0, (400 - cycle) / 400)))));
  assert.deepEqual(parts('PQ'), [agent(null), agent(500), agent(300)]);
  assert.deepEqual(parts('PQ'), [18, 18, 22.5]);
  assert.deepEqual(parts('PN'), [0, 0, 0], 'nodal links are not slowed');
  assert.equal(engine.diagnostics().pendingItems, 0, 'the ramp ends; the level persists until reset');
});

// ---------------------------------------------------------------- ordering within one instant (11d)

test('V11-O1 edits, including setTone, agent and lesion steps, apply in submission order before collisions', () => {
  const world = v11World('order', [site('A', 100), site('B', 100)], [join('L', 'A', 'B', way(100), way(100))]);
  const commands = [
    ablate('burn', 0, 'L', 500, 0.5),
    pulseAt('a', 200, 'A'), pulseAt('b', 200, 'B'),
    { commandId: 'tone', tMs: 250, type: 'setTone', value: -0.5 },
    { commandId: 'delay', tMs: 250, type: 'setDirectionDelay', linkId: 'L', direction: 'ab', delayMs: 80 },
    { commandId: 'ic', tMs: 150, type: 'applyAgent', agent: 'slow', doseScale: 1 },
  ];
  const { events } = play(world, 'order', commands, [1000]);
  assert.deepEqual(events.filter(event => event.tMs === 250).map(event => [event.type, event.parameter ?? null, event.commandId ?? null, event.cause ?? null]), [
    ['parameter_changed', 'delayMs', 'burn', 'lesion'],
    ['parameter_changed', 'delayMs', 'burn', 'lesion'],
    ['lesion_changed', null, null, null],
    ['parameter_changed', 'tone', 'tone', 'command'],
    ['parameter_changed', 'delayMs', 'delay', 'command'],
    ['parameter_changed', 'slowing', 'ic', 'agent'],
    ['conduction_collision', null, null, null],
  ]);
  // The lesion multiplies the edited base delay: 80 x (1 + 3 x 0.25^2) at p = 0.25.
  const delay = events.find(event => event.commandId === 'delay');
  assert.deepEqual([delay.previous, delay.value], [ms(Math.round(100_000 * (1 + 3 * 0.25 ** 2))), ms(Math.round(80_000 * (1 + 3 * 0.25 ** 2)))]);
});

test('V11-O3 restitution is computed in determineOutcomes from pre-capture state, after same-instant edits', () => {
  const world = v11World('pre', [site('A', 300, { restitution: { erpMaxMs: 300, amplitudeMs: 200, tauMs: 60, erpMinMs: 50 } }), site('B', 50)],
    [join('BA', 'B', 'A', way(40))]);
  const commands = [pulseAt('s1', 0, 'A'), pulseAt('b', 340, 'B'), pulseAt('s2', 380, 'A'),
    { commandId: 'law', tMs: 380, type: 'setRestitution', nodeId: 'A', erpMaxMs: 300, amplitudeMs: 100, tauMs: 60, erpMinMs: 50 }];
  const { events } = play(world, 'pre', commands, [1000]);
  const [, second] = actsAt(events, 'A');
  assert.equal(second.source, 'mixed', 'stimulus and arrival merge into one capture');
  assert.equal(second.diastolicIntervalMs, 80, 'DI from the refractory end at 300, before this capture');
  assert.equal(second.erpMs, ms(Math.round(300_000 - 100_000 * Math.exp(-80 / 60))), 'the edit at the same instant applies first');
});

test('V11-O4 entry slowing uses destination state after every outcome of the launching batch', () => {
  const world = v11World('after', [site('A', 100), site('B', 100)], [join('AB', 'A', 'B', way(60, { entry: { maxExtraMs: 30, tauMs: 40 } }))]);
  const { events } = play(world, 'after', [pulseAt('b0', 0, 'B'), pulseAt('a', 150, 'A'), pulseAt('b', 150, 'B')], [400]);
  const [launch] = ofType(events, 'conduction_launched');
  // Pre-batch state (refractory end 100) would give 30 e^(-110/40) ms; B was captured at 150, so the arrival at 210 meets ERP to 250.
  assert.notEqual(Math.round(30_000 * Math.exp(-110 / 40)), 0);
  assert.equal(launch.delayParts.entryMs, 0);
  assert.deepEqual(ofType(events, 'activation_blocked').map(({ tMs, nodeId, remainingErpMs }) => [tMs, nodeId, remainingErpMs]), [[210, 'B', 40]]);
});

test('V11-O5 coupling follows launches and precedes schedules; a focus reset in the same batch is reset, then modulated', () => {
  const focus = { cycleMs: 1000, firstAttemptMs: 0, resetOnCapture: true };
  const world = v11World('modulate', [site('F', 200, { automaticity: { ...focus } }), site('G', 200, { automaticity: { ...focus } }), site('H', 50)],
    [join('GH', 'G', 'H', way(30))], { coupling: [{ id: 'GF', from: 'G', to: 'F', amplitude: 0.2 }] });
  const { events } = play(world, 'modulate', [], [1500]);
  assert.deepEqual(events.filter(event => event.tMs === 0).map(event => event.type),
    ['stimulus_attempted', 'stimulus_attempted', 'activation', 'activation', 'conduction_launched', 'phase_modulated']);
  const [first] = ofType(events, 'phase_modulated');
  assert.deepEqual([first.phase, first.shiftMs, first.nextAttemptMs], [0, 0, 1000]);
  assert.deepEqual(timesAt(events, 'F'), [0, 1000]);
});

test('V11-O6 overdrive updates suppression at outcomes and schedules T + S at finalization', () => {
  const { events } = play(focusWorld(), 'od-order', [pulseAt('p', 500, 'S'), pulseAt('q', 900, 'S')], [4000]);
  // 500: I = 500, S = 18, next 1318 (superseded); 900: I = 400, S = 18 + 24 = 42, next 900 + 800 + 42 = 1742.
  // Spontaneous firings then decay S before scheduling: 0.6 x 42 = 25.2, 0.6 x 25.2 = 15.12.
  const expected = [0, 1_742_000];
  for (const s of [25_200, 15_120]) expected.push(expected.at(-1) + 800_000 + s);
  assert.deepEqual(autoAttempts(events).map(tick), expected);
});

// ---------------------------------------------------------------- determinism and annotations

test('V11-Z 1.1.0 traces are identical under small, irregular and single-step advancement', () => {
  const world = hemiolaWorld(0.17);
  world.nodes.find(node => node.id === 'A').tissue = 'sinus';
  world.links.push(join('A1B1', 'A1', 'B1', way(90, { entry: { maxExtraMs: 20, tauMs: 60 } }), way(90)));
  const commands = [train('drive', 100, 'A1', 1000, 333, 12), { commandId: 'still', tMs: 2000, type: 'applyAgent', agent: 'stillness', doseScale: 0.7 },
    ablate('burn', 3000, 'A1B1', 1100, 1), { commandId: 'tone', tMs: 3500, type: 'setTone', value: 0.4 },
    { commandId: 'ic', tMs: 4000, type: 'applyAgent', agent: 'slow', doseScale: 0.5 }, { commandId: 'k', tMs: 6000, type: 'setCoupling', couplingId: 'AB', value: 0.21 }];
  const through = 20000;
  const whole = play(world, 'z', commands, [through]).events;
  const small = play(world, 'z', commands, Array.from({ length: through / 10 + 1 }, (_, i) => i * 10)).events;
  const pattern = [1, 127, 4, 0.001, 77.781, 346, 13, 2];
  const irregular = [0];
  while (irregular.at(-1) < through) irregular.push(Math.min(through, irregular.at(-1) + pattern[irregular.length % pattern.length]));
  assert.deepEqual(small, whole);
  assert.deepEqual(play(world, 'z', commands, irregular).events, whole);
  for (const launch of ofType(whole, 'conduction_launched')) {
    const { baseMs, sourceMs, entryMs, lesionMs, agentMs } = launch.delayParts;
    assert.equal(tick(launch.arrivalMs) - tick(launch.departureMs), tick(baseMs) + tick(sourceMs) + tick(entryMs) + tick(lesionMs) + tick(agentMs));
  }
  assert.ok(ofType(whole, 'parameter_changed').every(event => ['command', 'agent', 'lesion'].includes(event.cause)));
  assert.ok(ofType(whole, 'activation').every(event => Object.hasOwn(event, 'diastolicIntervalMs')));
});

test('V11-Z v0.1 spec claims hold on the 1.1.0 engine: Conduction paced from A is 1:1 from 600 to 280 ms; Echo jumps below 300 ms', () => {
  for (const cycle of [600, 500, 450, 400, 370, 350, 330, 310, 300, 290, 280]) {
    const world = createConductionWorld();
    world.nodes.find(node => node.id === 'S').automaticity = null;
    const commands = Array.from({ length: 120 }, (_, k) => pulseAt(`c${k}`, 100 + k * cycle, 'A'));
    const { events } = play(world, 'wb', commands, [100 + 120 * cycle]);
    assert.equal(timesAt(events, 'H').length, 120, `1:1 at ${cycle} ms`);
  }
  assert.equal(conductionWorld.nodes.find(node => node.id === 'H').erpMs, 180);
  // Echo as tuned on v0.1 (design/plates/src/echo.mjs with fp 300, sl 160, His ERP 250).
  const both = (id, a, b, delayMs, decrement = null, reverse = true) =>
    ({ id, a, b, enabled: true, ab: { enabled: true, delayMs, decrement }, ba: { enabled: reverse, delayMs, decrement } });
  const echo = {
    worldId: 'echo',
    nodes: [site('S', 200, { automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } }), site('HRA', 230), site('CSp', 230),
      site('FP', 300), site('SP', 240), site('LCP', 250), site('H', 250), site('V', 250)],
    links: [both('SH', 'S', 'HRA', 25, null, false), both('HC', 'HRA', 'CSp', 30), both('CF', 'CSp', 'FP', 10),
      both('FL', 'FP', 'LCP', 30, { maxExtraMs: 30, tauMs: 100 }), both('CS', 'CSp', 'SP', 50), both('SL', 'SP', 'LCP', 160, { maxExtraMs: 60, tauMs: 120 }),
      both('LH', 'LCP', 'H', 40, null, false), both('HV', 'H', 'V', 35, null, false)],
  };
  const ah = s2 => {
    const last = 200 + 600 * 7;
    const commands = [...Array.from({ length: 8 }, (_, k) => pulseAt(`s1-${k}`, 200 + 600 * k, 'CSp')), pulseAt('s2', last + s2, 'CSp')];
    const { events } = playV1(echo, 'echo', commands.map(command => ({ runId: 'echo', ...command })), [last + s2 + 800]);
    const h = timesAt(events, 'H').find(t => t > last + s2);
    return h - (last + s2);
  };
  assert.equal(ah(300), 110);
  near(ah(296), 288, 0.5, 'AH at 296 ms');
  near(ah(296) - ah(300), 178, 0.5, 'jump');
  assert.ok(ah(299) - ah(300) > 150, 'at 1 ms resolution the jump is at the first S2 below the fast-pathway ERP');
});

test('V11-Z committed 1.1.0 evidence regenerates byte for byte', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('engine-v11-evidence.js', import.meta.url))], { maxBuffer: 1 << 28 });
  assert.ok(output.equals(readFileSync(new URL('../evidence/engine-v11-02.json', import.meta.url))));
});

test('V11-Z every new event type and annotation appears in at least one oracle scene', () => {
  const seen = new Set();
  const note = events => events.forEach(event => seen.add(event.type === 'parameter_changed' ? `parameter_changed:${event.parameter}` : event.type));
  note(play(lesionRingWorld(), 'n1', [...induction, ablate('burn', 2000, 'L5', 2000, 1)], [5000]).events);
  note(play(hemiolaWorld(0.17), 'n2', [{ commandId: 'k', tMs: 10, type: 'setCoupling', couplingId: 'AB', value: 0.2 }], [3000]).events);
  note(play(restitutionWorld(), 'n3', [train('t', 0, 'A', 0, 340, 3), { commandId: 'r', tMs: 10, type: 'setRestitution', nodeId: 'A', erpMaxMs: 290, amplitudeMs: 100, tauMs: 60, erpMinMs: 50 }], [2000]).events);
  note(play(lesionRingWorld(), 'n5', [...induction, { commandId: 'ic', tMs: 300, type: 'applyAgent', agent: 'slow', doseScale: 1 }], [1000]).events);
  note(play(chainWorld(), 'n4', [{ commandId: 'd', tMs: 0, type: 'setDecrement', linkId: 'N12', direction: 'ab', maxExtraMs: 20, tauMs: 90 },
    { commandId: 'e', tMs: 0, type: 'setEntry', linkId: 'N23', direction: 'ab', maxExtraMs: 50, tauMs: 60 },
    { commandId: 'tone', tMs: 0, type: 'setTone', value: 0.2 }, { commandId: 'ic', tMs: 0, type: 'applyAgent', agent: 'slow', doseScale: 1 },
    { commandId: 'st', tMs: 0, type: 'applyAgent', agent: 'stillness', doseScale: 1 }], [1000]).events);
  note(play(hemiolaWorld(0.17), 'n6', [{ commandId: 'b', tMs: 10, type: 'setAutonomic', value: { breathPeriodMs: 4000, depth: 0.05, targets: ['sinus'] } },
    { commandId: 'p', tMs: 20, type: 'setAutomaticity', nodeId: 'B', cycleMs: null }], [100]).events);
  for (const type of ['phase_modulated', 'lesion_changed', 'train_completed', 'link_changed', 'conduction_canceled', 'parameter_changed:delayMs',
    'parameter_changed:coupling', 'parameter_changed:restitution', 'parameter_changed:decrement', 'parameter_changed:entry',
    'parameter_changed:tone', 'parameter_changed:slowing', 'parameter_changed:erpMs', 'parameter_changed:autonomic',
    'parameter_changed:protected']) assert.ok(seen.has(type), type);
});

// ---------------------------------------------------------------- 11e lead decisions before the 1.1.0 freeze

describe('11e', () => {
  const sinusNodal = () => v11World('tone-11e', [
    site('S', 200, { tissue: 'sinus', automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } }),
    site('N', 300, { tissue: 'nodal' }),
    site('H', 200, { tissue: 'hisPurkinje' }),
  ], [join('SN', 'S', 'N', way(20)), join('NH', 'N', 'H', way(60, { decrement: { maxExtraMs: 90, tauMs: 120 } }))]);

  test('11e-1 tone sign: positive is sympathetic (shorter cycle, less nodal decrement), negative is vagal', () => {
    for (const v of [0.5, -0.5, 1, -1]) {
      const { events } = play(sinusNodal(), 'tone', [{ commandId: 'tone', tMs: 100, type: 'setTone', value: v }], [6000]);
      const cycle = Math.round(800_000 * (1 - 0.2 * v));
      const expected = [0, 800_000];
      while (expected.at(-1) + cycle <= 6_000_000) expected.push(expected.at(-1) + cycle);
      assert.deepEqual(autoAttempts(events).map(tick), expected, `tone ${v}`);
      if (v > 0) assert.ok(cycle < 800_000, 'sympathetic shortens'); else assert.ok(cycle > 800_000, 'vagal lengthens');
      const [, second, third] = ofType(events, 'conduction_launched').filter(event => event.linkId === 'NH');
      assert.equal(tick(second.delayParts.sourceMs), Math.round(90_000 * (1 - 0.5 * v) * Math.exp(-500 / 120)));
      assert.equal(tick(third.delayParts.sourceMs), Math.round(90_000 * (1 - 0.5 * v) * Math.exp(-(cycle - 300_000) / 120_000)));
    }
  });

  test('11e-2 cancelTrain emits train_completed { cancelled: true } with the partial count in the cancel batch; completion says cancelled: false', () => {
    const world = v11World('cancel-11e', [site('A', 100), site('B', 100), site('C', 100)]);
    const commands = [
      train('mid', 0, 'A', 100, 200, 10), { commandId: 'stopMid', tMs: 500, type: 'cancelTrain', trainId: 'mid' },
      train('early', 0, 'B', 1000, 200, 3), { commandId: 'stopEarly', tMs: 600, type: 'cancelTrain', trainId: 'early' },
      train('last', 0, 'C', 2000, 200, 3), { commandId: 'stopLast', tMs: 2400, type: 'cancelTrain', trainId: 'last' },
      train('done', 0, 'A', 3000, 200, 2), { commandId: 'late', tMs: 3500, type: 'cancelTrain', trainId: 'done' },
      { commandId: 'again', tMs: 3600, type: 'cancelTrain', trainId: 'mid' },
      train('pair', 0, 'B', 4000, 200, 2), train('cut', 0, 'C', 4000, 200, 9), { commandId: 'stopCut', tMs: 4200, type: 'cancelTrain', trainId: 'cut' },
    ];
    const { events } = play(world, 'cancel-11e', commands, [6000]);
    const closed = ofType(events, 'train_completed').map(({ tMs, commandId, trainId, delivered, count, cancelled }) => [tMs, commandId, trainId, delivered, count, cancelled]);
    assert.deepEqual(closed, [
      [500, 'mid', 'mid', 2, 10, true],
      [600, 'early', 'early', 0, 3, true],
      [2400, 'last', 'last', 2, 3, true], // the cancel at the last pulse's instant suppresses it
      [3200, 'done', 'done', 2, 2, false], // cancelling a finished train (and cancelling twice) emits nothing
      [4200, 'cut', 'cut', 1, 9, true], // cancellations close before completions of the same batch
      [4200, 'pair', 'pair', 2, 2, false],
    ]);
    const pulses = id => ofType(events, 'stimulus_attempted').filter(event => event.triggerId.startsWith(`${id}#`)).length;
    for (const [, id, , delivered] of closed) assert.equal(pulses(id), delivered, `${id} delivered`);
    const at4200 = events.filter(event => event.tMs === 4200).map(event => event.type);
    assert.deepEqual(at4200.slice(-2), ['train_completed', 'train_completed'], 'train_completed closes the batch');
  });

  test('11e-3 setAutonomic toggles Breath live; the breath phase follows absolute sim time, so replay matches', () => {
    const breath = { breathPeriodMs: 4000, depth: 0.05, targets: ['sinus'] };
    const world = v11World('breath-11e', [site('S', 200, { tissue: 'sinus', automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } })]);
    const commands = [{ commandId: 'on', tMs: 1000, type: 'setAutonomic', value: breath }, { commandId: 'same', tMs: 2000, type: 'setAutonomic', value: { ...breath, targets: ['sinus'] } },
      { commandId: 'off', tMs: 9000, type: 'setAutonomic', value: null }];
    const { events } = play(world, 'breath', commands, [14000]);
    const on = t => t >= 1_000_000 && t < 9_000_000;
    const expected = [0];
    while (expected.at(-1) <= 14_000_000) {
      const t = expected.at(-1);
      expected.push(t + Math.round(800_000 * (on(t) ? 1 + 0.05 * Math.sin((2 * Math.PI * t) / 4_000_000) : 1)));
    }
    assert.deepEqual(autoAttempts(events).map(tick), expected.filter(t => t <= 14_000_000));
    assert.deepEqual(ofType(events, 'parameter_changed').map(({ tMs, parameter, generation, previous, value, commandId, cause }) => [tMs, parameter, generation, previous, value, commandId, cause]), [
      [1000, 'autonomic', 1, null, breath, 'on', 'command'],
      [9000, 'autonomic', 2, breath, null, 'off', 'command'],
    ], 'an identical value is a no-op');
    const steps = play(world, 'breath', commands, Array.from({ length: 141 }, (_, k) => k * 100)).events;
    assert.deepEqual(steps, events);
    const engine = createEngine();
    engine.reset(world, 'r');
    for (const [value, pattern] of [[{ ...breath, depth: 0.6 }, /depth/], [{ ...breath, targets: ['his'] }, /targets/], [{ breathPeriodMs: 4000, depth: 0.1 }, /must have fields/], [true, /must have fields/]]) {
      assert.throws(() => engine.enqueue({ runId: 'r', commandId: 'x', tMs: 1, type: 'setAutonomic', value }), pattern);
    }
    engine.reset(circulationWorld, 'v1');
    assert.throws(() => engine.enqueue({ runId: 'v1', commandId: 'x', tMs: 1, type: 'setAutonomic', value: null }), /requires a contract 1\.1\.0 world/);
  });

  test('11e-4 a complete lesion stays closed: setLinkEnabled(true) is rejected once the log shows p = 1; reset reopens', () => {
    const world = lesionRingWorld();
    const engine = createEngine();
    engine.reset(world, 'closed');
    engine.enqueue({ runId: 'closed', ...ablate('burn', 100, 'L5', 2000, 1) });
    engine.enqueue({ runId: 'closed', commandId: 'early', tMs: 1000, type: 'setLinkEnabled', linkId: 'L5', enabled: true });
    for (const tMs of [2100, 5000]) {
      assert.throws(() => engine.enqueue({ runId: 'closed', commandId: `open${tMs}`, tMs, type: 'setLinkEnabled', linkId: 'L5', enabled: true }),
        /closed by the complete lesion burn; reset the run/);
    }
    engine.enqueue({ runId: 'closed', commandId: 'cutOther', tMs: 5000, type: 'setLinkEnabled', linkId: 'L4', enabled: false });
    const events = engine.advanceTo(6000);
    assert.deepEqual(ofType(events, 'link_changed').map(({ tMs, linkId, value, cause }) => [tMs, linkId, value, cause]),
      [[2100, 'L5', false, 'lesion'], [5000, 'L4', false, 'command']], 'the enable at 1000 was a no-op (already enabled)');
    assert.deepEqual(engine.readAt(6000).links.L5.lesion, { progress: 1, completeness: 1 });
    engine.reset(world, 'fresh');
    engine.enqueue({ runId: 'fresh', commandId: 'open', tMs: 5000, type: 'setLinkEnabled', linkId: 'L5', enabled: true });
    // An enable enqueued before the ablate that closes the line earlier is a no-op when it applies.
    const late = play(world, 'late', [{ commandId: 'open', tMs: 5000, type: 'setLinkEnabled', linkId: 'L5', enabled: true },
      { commandId: 'cut', tMs: 10, type: 'setLinkEnabled', linkId: 'L5', enabled: false }, ablate('burn', 0, 'L5', 2000, 1)], [6000]);
    assert.deepEqual(ofType(late.events, 'link_changed').map(({ tMs, value, commandId }) => [tMs, value, commandId]), [[10, false, 'cut']]);
    assert.equal(late.engine.readAt(6000).links.L5.enabled, false);
  });

  test('11e-4 ablating an already-disabled link records the lesion and emits lesion_changed but no link_changed', () => {
    const world = v11World('burn-off', [site('A', 100), site('B', 100)], [join('L', 'A', 'B', way(100), way(100))]);
    const { events, engine } = play(world, 'burn-off', [{ commandId: 'cut', tMs: 0, type: 'setLinkEnabled', linkId: 'L', enabled: false },
      ablate('burn', 100, 'L', 500, 1)], [1000]);
    assert.deepEqual(ofType(events, 'lesion_changed').map(({ tMs, progress }) => [tMs, progress]), [[350, 0.5], [600, 1]]);
    assert.deepEqual(ofType(events, 'parameter_changed').map(({ tMs, direction, value, cause }) => [tMs, direction, value, cause]),
      [[350, 'ab', ms(Math.round(100_000 * 1.75)), 'lesion'], [350, 'ba', 175, 'lesion'], [600, 'ab', 400, 'lesion'], [600, 'ba', 400, 'lesion']]);
    assert.deepEqual(ofType(events, 'link_changed').map(event => event.commandId), ['cut']);
    assert.deepEqual(engine.readAt(1000).links.L.lesion, { progress: 1, completeness: 1 });
    assert.throws(() => engine.enqueue({ runId: 'burn-off', commandId: 'open', tMs: 1001, type: 'setLinkEnabled', linkId: 'L', enabled: true }), /closed/);
    // An incomplete lesion of a disabled link may be reopened; it then conducts with the lesioned delay.
    const gap = play(world, 'gap', [{ commandId: 'cut', tMs: 0, type: 'setLinkEnabled', linkId: 'L', enabled: false }, ablate('burn', 100, 'L', 500, 0.5),
      { commandId: 'open', tMs: 700, type: 'setLinkEnabled', linkId: 'L', enabled: true }, pulseAt('a', 800, 'A')], [1500]);
    const [launch] = ofType(gap.events, 'conduction_launched');
    assert.deepEqual(launch.delayParts, { baseMs: 100, sourceMs: 0, entryMs: 0, lesionMs: 75, agentMs: 0 });
  });

  test('11e-5 L2: setNodeERP under restitution reverses exactly; the 1 ms floor clamp keeps the offset', () => {
    const { events, engine } = play(restitutionWorld(), 'l2', [
      { commandId: 'down', tMs: 10, type: 'setNodeERP', nodeId: 'A', erpMs: 100 },
      pulseAt('p1', 20, 'A'), pulseAt('p2', 140, 'A'),
      { commandId: 'up', tMs: 500, type: 'setNodeERP', nodeId: 'A', erpMs: 300 },
    ], [1000]);
    assert.deepEqual(engine.readAt(100).nodes.A.restitution, { erpMaxMs: 100, amplitudeMs: 200, tauMs: 60, erpMinMs: 1 });
    // p2: DI = 20 ms; 100 - 200 e^(-20/60) < 0, so ERP sits on the clamped 1 ms floor.
    assert.equal(actsAt(events, 'A')[1].erpMs, 1);
    assert.deepEqual(engine.readAt(1000).nodes.A.restitution, { erpMaxMs: 300, amplitudeMs: 200, tauMs: 60, erpMinMs: 50 });
  });

  test('11e-5 L3: setRestitution that moves erpMs also emits parameter_changed erpMs; one that keeps it does not', () => {
    const { events, engine } = play(restitutionWorld(), 'l3', [
      { commandId: 'shape', tMs: 10, type: 'setRestitution', nodeId: 'A', erpMaxMs: 300, amplitudeMs: 100, tauMs: 60, erpMinMs: 50 },
      { commandId: 'move', tMs: 20, type: 'setRestitution', nodeId: 'A', erpMaxMs: 280, amplitudeMs: 100, tauMs: 60, erpMinMs: 50 },
      { commandId: 'same', tMs: 30, type: 'setRestitution', nodeId: 'A', erpMaxMs: 280, amplitudeMs: 100, tauMs: 60, erpMinMs: 50 },
    ], [100]);
    assert.deepEqual(ofType(events, 'parameter_changed').map(({ tMs, parameter, generation, commandId, previous, value }) =>
      [tMs, parameter, generation, commandId, parameter === 'erpMs' ? [previous, value] : value.erpMaxMs]), [
      [10, 'restitution', 1, 'shape', 300],
      [20, 'restitution', 2, 'move', 280],
      [20, 'erpMs', 1, 'move', [300, 280]],
    ]);
    assert.equal(engine.readAt(100).nodes.A.erpMs, 280);
  });

  test('11e-5 L4: a protected focus whose automaticity is set to null becomes unprotected (parameter_changed protected)', () => {
    const world = v11World('unprotect', [site('P', 200, { tissue: 'atrial', automaticity: { cycleMs: 1000, firstAttemptMs: 100, resetOnCapture: true, protected: true } }),
      site('Q', 50, { tissue: 'atrial' })], [join('PQ', 'P', 'Q', way(50), way(50))]);
    const { events } = play(world, 'unprotect', [{ commandId: 'off', tMs: 500, type: 'setAutomaticity', nodeId: 'P', cycleMs: null },
      pulseAt('q', 1200, 'Q'), { commandId: 'on', tMs: 2000, type: 'setAutomaticity', nodeId: 'P', cycleMs: 1000 }, pulseAt('q2', 2600, 'Q')], [4000]);
    assert.deepEqual(ofType(events, 'parameter_changed').map(({ tMs, parameter, generation, nodeId, previous, value, commandId, cause }) =>
      [tMs, parameter, generation, nodeId, previous, value, commandId, cause]), [
      [500, 'cycleMs', 1, 'P', 1000, null, 'off', 'command'],
      [500, 'protected', 1, 'P', true, false, 'off', 'command'],
      [2000, 'cycleMs', 2, 'P', null, 1000, 'on', 'command'],
    ], 'restoring automaticity does not restore protection');
    assert.equal(ofType(events, 'activation_blocked').filter(event => event.cause === 'protected').length, 0);
    assert.deepEqual(actsAt(events, 'P').slice(1).map(event => event.source), ['conduction', 'conduction', 'automaticity'], 'conduction now captures P');
    assert.deepEqual(timesAt(events, 'P'), [100, 1250, 2650, 3650]);
  });

  test('11e-5 L6: contractVersion "1.0.0" declares a 1.0.0 world explicitly and may not carry 1.1.0 fields', () => {
    const commands = fixture('A.commands');
    const expected = fixture('A.presentation');
    const { events, initial } = playV1({ ...circulationWorld, contractVersion: '1.0.0' }, commands[0].runId, commands, [expected.throughMs]);
    assert.equal(JSON.stringify(events), JSON.stringify(engineEvidence.traces.A.events));
    assert.deepEqual(Object.keys(initial.nodes.R0), ['lastActivationMs', 'refractoryUntilMs', 'erpMs', 'recoveryTailMs', 'recovery', 'excitable']);
    const engine = createEngine();
    engine.reset({ ...circulationWorld, contractVersion: '1.0.0' }, 'v1');
    assert.throws(() => engine.enqueue({ runId: 'v1', commandId: 'x', tMs: 1, type: 'setTone', value: 0.1 }), /requires a contract 1\.1\.0 world/);
    const tagged = createCirculationWorld();
    tagged.contractVersion = '1.0.0';
    tagged.nodes[0].tissue = 'atrial';
    assert.throws(() => engine.reset(tagged, 'bad'), /must not carry 1\.1\.0 fields/);
    assert.throws(() => engine.reset({ ...circulationWorld, contractVersion: '1.0.0', limits: {} }, 'bad'), /must not carry 1\.1\.0 fields/);
  });

  test('11e-5 L7: the concurrent-train limit lives in the world (default 4); the engine option only caps it', () => {
    const at = (commandId, nodeId) => ({ runId: 'r', ...train(commandId, 0, nodeId, 0, 200, 5) });
    const admitted = (world, options) => {
      const engine = createEngine(options);
      engine.reset(world, 'r');
      const accepted = [];
      for (const [k, id] of ['t1', 't2', 't3', 't4', 't5', 't6'].entries()) {
        try { engine.enqueue(at(id, k % 2 === 0 ? 'A' : 'B')); accepted.push(id); } catch (error) { assert.match(error.message, /trains may overlap/); }
      }
      return accepted;
    };
    const base = v11World('cap', [site('A', 100), site('B', 100)]);
    assert.deepEqual(admitted(base), ['t1', 't2', 't3', 't4'], 'default 4');
    assert.deepEqual(admitted({ ...base, limits: { maxConcurrentTrains: 1 } }), ['t1']);
    assert.deepEqual(admitted({ ...base, limits: { maxConcurrentTrains: 6 } }), ['t1', 't2', 't3', 't4', 't5', 't6']);
    assert.deepEqual(admitted({ ...base, limits: { maxConcurrentTrains: 2 } }, { maxConcurrentTrains: 3 }), ['t1', 't2'], 'a higher host cap admits exactly what the world says');
    assert.throws(() => createEngine({ maxConcurrentTrains: 3 }).reset(base, 'r'), /exceeds this engine's cap of 3/);
    assert.throws(() => createEngine().reset({ ...base, limits: { maxConcurrentTrains: 17 } }, 'r'), /integer from 1 to 16/);
    assert.throws(() => createEngine().reset({ ...base, limits: { trains: 2 } }, 'r'), /must have fields/);
    const inferred = { worldId: 'w', nodes: [site('A', 100)], links: [], limits: {} };
    assert.ok(Object.hasOwn(createEngine().reset(inferred, 'r').nodes.A, 'suppressionMs'), 'limits marks a 1.1.0 world');
    assert.doesNotThrow(() => createEngine({ maxConcurrentTrains: 1 }).reset(circulationWorld, 'v1'), 'a 1.0.0 world runs no trains and is not capped');
  });

  test('11e-6 lintStudyWorld reports every site without an explicit tissue, in world order', () => {
    assert.deepEqual(lintStudyWorld(chainWorld()), []);
    assert.deepEqual(lintStudyWorld(hemiolaWorld(0.17)).map(finding => finding.nodeId), hemiolaWorld(0.17).nodes.map(node => node.id));
    const mixed = v11World('mixed', [site('S', 200, { tissue: 'sinus' }), site('X', 200), site('V', 250, { tissue: 'ventricular' }), site('Y', 200, { tissue: undefined })]);
    const findings = lintStudyWorld(mixed);
    assert.deepEqual(findings.map(({ code, nodeId }) => [code, nodeId]), [['MISSING_TISSUE', 'X']], 'a key present with value undefined counts as declared by hasOwn');
    assert.match(findings[0].message, /Site X does not declare tissue/);
    assert.ok(Object.isFrozen(findings));
    assert.deepEqual(lintStudyWorld({}), []);
  });

  test('11e-7 the overdrive accelerando is 1250, 1070, 962 and 897.2 ms exactly (no tolerance needed)', () => {
    const { events } = play(focusWorld(), 'od', [train('drive', 0, 'S', 500, 500, 30)], [21000]);
    const spontaneous = autoAttempts(events).map(tick);
    assert.deepEqual(diffs([15_000_000, ...spontaneous.slice(1, 5)]), [1_250_000, 1_070_000, 962_000, 897_200]);
    assert.equal(Math.round(Math.round(Math.round(450_000 * 0.6) * 0.6) * 0.6), 97_200, 'S = 0.6^3 x 450 ms = 97.2 ms, one round per law');
  });
});
