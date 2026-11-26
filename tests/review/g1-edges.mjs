// G1 independent review: semantics, validation and edge-case probes for contract 1.1.0.
// Prints one line per probe: OK (behaves as the spec/README says), NOTE (behaviour worth
// recording, not a contract violation), or BUG. Exit code 1 if any BUG.
// Run: node tests/review/g1-edges.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine as rawCreate } from '../../src/engine/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const emitted = [];
// Every engine made here records its events for schema validation at the end.
function createEngine(options) {
  const e = rawCreate(options);
  const advance = e.advanceTo.bind(e);
  e.advanceTo = h => { const ev = advance(h); if (emitted.length < 60000) emitted.push(...ev); return ev; };
  return e;
}

const lines = [];
let bugs = 0;
const ok = (name, detail = '') => lines.push(`OK    ${name}${detail ? ` — ${detail}` : ''}`);
const note = (name, detail) => lines.push(`NOTE  ${name} — ${detail}`);
const bug = (name, detail) => { bugs++; lines.push(`BUG   ${name} — ${detail}`); };
const check = (cond, name, detail = '') => (cond ? ok(name, detail) : bug(name, detail || 'failed'));

const N = (id, erpMs, more = {}) => ({ id, erpMs, recoveryTailMs: 100, automaticity: null, ...more });
const D = (delayMs, more = {}) => ({ enabled: true, delayMs, decrement: null, ...more });
const L = (id, a, b, ab, ba = { enabled: false, delayMs: ab.delayMs, decrement: null }) => ({ id, a, b, enabled: true, ab, ba });
const W = (worldId, nodes, links = [], more = {}) => ({ contractVersion: '1.1.0', worldId, nodes, links, ...more });
const mk = (world, options = {}) => { const e = createEngine({ processingBudget: 1_000_000, ...options }); e.reset(world, 'r'); return e; };
const cmd = (commandId, tMs, type, more) => ({ runId: 'r', commandId, tMs, type, ...more });
const train = (id, tMs, nodeId, startMs, cycleMs, count) => cmd(id, tMs, 'stimulateTrain', { nodeId, startMs, cycleMs, count, label: '' });
const throws = fn => { try { fn(); return null; } catch (e) { return e; } };
const of = (ev, type) => ev.filter(e => e.type === type);

const two = () => W('two', [N('A', 100), N('B', 100)], [L('L', 'A', 'B', D(50), D(50))]);

// ---------- trains ----------
{
  const e = mk(two());
  e.enqueue(train('T', 0, 'A', 0, 200, 5));
  e.enqueue(cmd('c', 400, 'cancelTrain', { trainId: 'T' }));
  const ev = e.advanceTo(2000);
  const pulses = of(ev, 'stimulus_attempted').filter(x => x.triggerId.startsWith('T#')).map(x => [x.tMs, x.triggerId]);
  check(JSON.stringify(pulses) === JSON.stringify([[0, 'T#1'], [200, 'T#2']]) && of(ev, 'train_completed').length === 0,
    'cancelTrain at the tick of pulse 3: pulses at or after the cancel instant are not delivered, nothing emitted', JSON.stringify(pulses));
}
{
  const e = mk(two());
  e.enqueue(train('T', 0, 'A', 0, 200, 3));
  e.enqueue(cmd('c', 400, 'cancelTrain', { trainId: 'T' }));
  const ev = e.advanceTo(2000);
  check(of(ev, 'train_completed').length === 0 && of(ev, 'stimulus_attempted').length === 2,
    'cancel at the tick of the last pulse suppresses it and train_completed');
}
{
  const e = mk(two());
  e.enqueue(train('T', 0, 'A', 0, 200, 3));
  const ev = e.advanceTo(400);
  const tc = of(ev, 'train_completed');
  const lastPulse = ev.findIndex(x => x.triggerId === 'T#3');
  check(tc.length === 1 && tc[0].delivered === 3 && tc[0].tMs === 400 && ev.indexOf(tc[0]) === ev.length - 1 && lastPulse >= 0,
    'train_completed closes the batch of the last pulse', `delivered ${tc[0]?.delivered}`);
}
{
  // Admission: 4 overlapping trains fine, 5th rejected without consuming its id; a cancelled train frees its slot.
  const e = mk(W('many', ['A', 'B', 'C', 'D', 'E', 'F'].map(id => N(id, 100))));
  for (const [i, id] of ['A', 'B', 'C', 'D'].entries()) e.enqueue(train(`T${i}`, 0, id, 100, 200, 10));
  const fifth = throws(() => e.enqueue(train('T4', 0, 'E', 1000, 200, 10)));
  const reuse = throws(() => e.enqueue(train('T4', 0, 'E', 5000, 200, 10))); // after all windows: accepted, same id reused
  e.enqueue(cmd('stop', 1, 'cancelTrain', { trainId: 'T0' }));
  const sixth = throws(() => e.enqueue(train('T5', 2, 'F', 300, 200, 10)));
  check(fifth instanceof RangeError && reuse === null && sixth === null, 'maxConcurrentTrains = 4: 5th overlapping rejected (id not consumed); cancel frees the slot',
    `${fifth?.message}`);
  const budget = mk(two(), { processingBudget: 100 });
  budget.enqueue(train('T', 0, 'B', 0, 150, 64));
  const fault = throws(() => budget.advanceTo(64 * 150));
  check(fault?.code === 'PROCESSING_BUDGET', 'train pulses are charged to the processing budget', fault?.message);
  const bad = [
    ['count 65', train('x', 0, 'A', 0, 200, 65)], ['count 0', train('x', 0, 'A', 0, 200, 0)], ['count 2.5', train('x', 0, 'A', 0, 200, 2.5)],
    ['cycle 149', train('x', 0, 'A', 0, 149, 3)], ['cycle 10001', train('x', 0, 'A', 0, 10001, 3)], ['start before tMs', train('x', 10, 'A', 5, 200, 3)],
    ['label 121 chars', { ...train('x', 0, 'A', 0, 200, 3), label: 'x'.repeat(121) }], ['label number', { ...train('x', 0, 'A', 0, 200, 3), label: 1 }],
    ['unknown node', train('x', 0, 'Z', 0, 200, 3)], ['extra key', { ...train('x', 0, 'A', 0, 200, 3), extra: 1 }],
    ['cancel unknown train', cmd('x', 0, 'cancelTrain', { trainId: 'nope' })],
    ['tone 1.01', cmd('x', 0, 'setTone', { value: 1.01 })], ['tone NaN', cmd('x', 0, 'setTone', { value: NaN })], ['tone string', cmd('x', 0, 'setTone', { value: '0' })],
    ['ablate completeness 0', cmd('x', 0, 'ablate', { target: 'L', durationMs: 100, completeness: 0 })],
    ['ablate completeness 1.01', cmd('x', 0, 'ablate', { target: 'L', durationMs: 100, completeness: 1.01 })],
    ['ablate duration 0', cmd('x', 0, 'ablate', { target: 'L', durationMs: 0, completeness: 1 })],
    ['ablate duration 60001', cmd('x', 0, 'ablate', { target: 'L', durationMs: 60001, completeness: 1 })],
    ['ablate unknown link', cmd('x', 0, 'ablate', { target: 'Q', durationMs: 100, completeness: 1 })],
    ['agent unknown', cmd('x', 0, 'applyAgent', { agent: 'adenosine', doseScale: 1 })],
    ['dose 0', cmd('x', 0, 'applyAgent', { agent: 'slow', doseScale: 0 })], ['dose 2.01', cmd('x', 0, 'applyAgent', { agent: 'slow', doseScale: 2.01 })],
    ['setCoupling unknown', cmd('x', 0, 'setCoupling', { couplingId: 'K', value: 0.1 })],
    ['restitution erpMin > erpMax', cmd('x', 0, 'setRestitution', { nodeId: 'A', erpMaxMs: 200, amplitudeMs: 50, tauMs: 50, erpMinMs: 250 })],
    ['restitution erpMax 49', cmd('x', 0, 'setRestitution', { nodeId: 'A', erpMaxMs: 49, amplitudeMs: 50, tauMs: 50, erpMinMs: 20 })],
    ['restitution tau 9', cmd('x', 0, 'setRestitution', { nodeId: 'A', erpMaxMs: 200, amplitudeMs: 50, tauMs: 9, erpMinMs: 20 })],
    ['restitution amplitude -1', cmd('x', 0, 'setRestitution', { nodeId: 'A', erpMaxMs: 200, amplitudeMs: -1, tauMs: 50, erpMinMs: 20 })],
    ['decrement maxExtra 301', cmd('x', 0, 'setDecrement', { linkId: 'L', direction: 'ab', maxExtraMs: 301, tauMs: 50 })],
    ['entry bad direction', cmd('x', 0, 'setEntry', { linkId: 'L', direction: 'xy', maxExtraMs: 10, tauMs: 50 })],
    ['entry tau 1001', cmd('x', 0, 'setEntry', { linkId: 'L', direction: 'ab', maxExtraMs: 10, tauMs: 1001 })],
  ];
  const accepted = [];
  for (const [label, c] of bad) { const f = mk(two()); if (throws(() => f.enqueue(c)) === null) accepted.push(label); }
  check(accepted.length === 0, `input validation rejects ${bad.length} malformed 1.1.0 commands`, accepted.join(', '));
  const v10 = { worldId: 'old', nodes: [N('A', 100), N('B', 100)], links: [L('L', 'A', 'B', D(50), D(50))] };
  const nine = [train('x', 0, 'A', 0, 200, 3), cmd('x', 0, 'cancelTrain', { trainId: 'x' }), cmd('x', 0, 'setTone', { value: 0 }),
    cmd('x', 0, 'ablate', { target: 'L', durationMs: 100, completeness: 1 }), cmd('x', 0, 'applyAgent', { agent: 'slow', doseScale: 1 }),
    cmd('x', 0, 'setCoupling', { couplingId: 'K', value: 0 }), cmd('x', 0, 'setRestitution', { nodeId: 'A', erpMaxMs: 200, amplitudeMs: 50, tauMs: 50, erpMinMs: 20 }),
    cmd('x', 0, 'setDecrement', { linkId: 'L', direction: 'ab', maxExtraMs: 10, tauMs: 50 }), cmd('x', 0, 'setEntry', { linkId: 'L', direction: 'ab', maxExtraMs: 10, tauMs: 50 })];
  const v10accepted = nine.filter(c => throws(() => mk(v10).enqueue(c)) === null).map(c => c.type);
  check(v10accepted.length === 0, 'a 1.0.0 run rejects all nine 1.1.0 commands', v10accepted.join(','));
  const worlds = [
    ['restitution erpMax != erpMs', W('w', [N('A', 100, { restitution: { erpMaxMs: 120, amplitudeMs: 10, tauMs: 10, erpMinMs: 10 } })])],
    ['restitution erpMin > erpMax', W('w', [N('A', 100, { restitution: { erpMaxMs: 100, amplitudeMs: 10, tauMs: 10, erpMinMs: 110 } })])],
    ['tissue unknown', W('w', [N('A', 100, { tissue: 'purkinje' })])],
    ['audible string', W('w', [N('A', 100, { audible: 'no' })])],
    ['coupling to non-automatic', W('w', [N('A', 100, { automaticity: { cycleMs: 500, firstAttemptMs: 0, resetOnCapture: true } }), N('B', 100)], [], { coupling: [{ id: 'k', from: 'A', to: 'B', amplitude: 0.1 }] })],
    ['coupling amplitude 1.5', W('w', [N('A', 100), N('B', 100, { automaticity: { cycleMs: 500, firstAttemptMs: 0, resetOnCapture: true } })], [], { coupling: [{ id: 'k', from: 'A', to: 'B', amplitude: 1.5 }] })],
    ['coupling self', W('w', [N('B', 100, { automaticity: { cycleMs: 500, firstAttemptMs: 0, resetOnCapture: true } })], [], { coupling: [{ id: 'k', from: 'B', to: 'B', amplitude: 0.1 }] })],
    ['autonomic depth 0.6', W('w', [N('A', 100)], [], { autonomic: { breathPeriodMs: 4000, depth: 0.6, targets: ['sinus'] } })],
    ['autonomic duplicate target', W('w', [N('A', 100)], [], { autonomic: { breathPeriodMs: 4000, depth: 0.1, targets: ['sinus', 'sinus'] } })],
    ['autonomic period 0', W('w', [N('A', 100)], [], { autonomic: { breathPeriodMs: 0, depth: 0.1, targets: [] } })],
    ['overdrive gain 1.5', W('w', [N('A', 100, { automaticity: { cycleMs: 500, firstAttemptMs: 0, resetOnCapture: true, overdrive: { gainPerBeat: 1.5, maxMs: 100, warmupFactor: 0.5 } } })])],
    ['entry negative', W('w', [N('A', 100), N('B', 100)], [L('L', 'A', 'B', D(50, { entry: { maxExtraMs: -1, tauMs: 10 } }))])],
    ['contractVersion 2.0.0', { ...W('w', [N('A', 100)]), contractVersion: '2.0.0' }],
  ];
  const accW = worlds.filter(([, w]) => throws(() => createEngine().reset(w, 'r')) === null).map(([l]) => l);
  check(accW.length === 0, `world validation rejects ${worlds.length} malformed 1.1.0 worlds`, accW.join(', '));
  const declared10 = throws(() => createEngine().reset({ ...v10, contractVersion: '1.0.0' }, 'r'));
  if (declared10) note('contractVersion "1.0.0"', `a world that declares contractVersion "1.0.0" is rejected (${declared10.message}); harmless because world.v1 forbids the key, but a producer that always writes the version must write "1.1.0" or omit it`);
}

// ---------- coupling edge cases ----------
{
  const w = W('cpl', [N('A', 100, { automaticity: { cycleMs: 300, firstAttemptMs: 0, resetOnCapture: true } }),
    N('B', 100, { automaticity: { cycleMs: 1000, firstAttemptMs: 100, resetOnCapture: true, protected: true } })], [], { coupling: [{ id: 'k', from: 'A', to: 'B', amplitude: 0.2 }] });
  const e = mk(w);
  e.enqueue(cmd('off', 50, 'setAutomaticity', { nodeId: 'B', cycleMs: null }));
  e.enqueue(cmd('poke', 500, 'stimulate', { nodeId: 'B' }));
  const ev = e.advanceTo(3000);
  check(of(ev, 'phase_modulated').filter(x => x.tMs > 50).length === 0, 'coupling to a focus whose automaticity was set to null emits nothing (no crash)');
  const blk = of(ev, 'activation_blocked').find(x => x.nodeId === 'B' && x.tMs === 500);
  note('protected focus after setAutomaticity null', `B stays protected, so a stimulus at 500 is ${blk ? `blocked with cause ${blk.cause}` : 'captured'}: with no automaticity left it can never be captured again (README is silent; suggest clearing protection with the cycle or documenting it)`);
  e.enqueue(cmd('on', 3100, 'setAutomaticity', { nodeId: 'B', cycleMs: 1000 }));
  const ev2 = e.advanceTo(6000);
  const pm = of(ev2, 'phase_modulated');
  check(pm.length > 0 && pm.every(x => x.phase >= 0 && x.phase < 1), 'coupling resumes after automaticity is restored, phase origin = edit instant');
  // same-batch reset + modulation: A and B fire at the same tick
  const w2 = W('same', [N('A', 100, { automaticity: { cycleMs: 500, firstAttemptMs: 0, resetOnCapture: true } }),
    N('B', 100, { automaticity: { cycleMs: 1000, firstAttemptMs: 0, resetOnCapture: true, protected: true } })], [], { coupling: [{ id: 'k', from: 'A', to: 'B', amplitude: 0.2 }] });
  const ev3 = mk(w2).advanceTo(0);
  const p0 = of(ev3, 'phase_modulated')[0];
  check(p0 && p0.phase === 0 && p0.shiftMs === 0 && p0.nextAttemptMs === 1000, 'same-tick reset then modulation: phi 0, shift 0, next = t + T');
}

// ---------- lesions ----------
{
  const e = mk(two());
  e.enqueue(cmd('cut', 0, 'setLinkEnabled', { linkId: 'L', enabled: false }));
  e.enqueue(cmd('burn', 10, 'ablate', { target: 'L', durationMs: 600, completeness: 1 }));
  const ev = e.advanceTo(1000);
  const steps = of(ev, 'lesion_changed').map(x => [x.tMs, x.progress]);
  check(JSON.stringify(steps) === JSON.stringify([[260, 250 / 600], [510, 500 / 600], [610, 1]]), 'lesion steps every 250 ms, last step exactly at durationMs', JSON.stringify(steps));
  const lc = of(ev, 'link_changed');
  e.enqueue(cmd('restore', 1100, 'setLinkEnabled', { linkId: 'L', enabled: true }));
  e.enqueue(cmd('s', 1200, 'stimulate', { nodeId: 'A' }));
  const ev2 = e.advanceTo(2000);
  const launch = of(ev2, 'conduction_launched')[0];
  note('ablate on a disabled link, then setLinkEnabled true', `completion emits ${lc.length - 1} lesion link_changed (link already off), and a later setLinkEnabled(true) re-opens a complete (p = 1) lesion: the wave launches with delay ${launch ? launch.arrivalMs - launch.departureMs : 'none'} ms (50 x 4). A complete lesion is not permanent against setLinkEnabled; a second ablate cannot close it again because completeness 1 <= current target is a no-op`);
  const again = mk(two());
  again.enqueue(cmd('b1', 0, 'ablate', { target: 'L', durationMs: 1000, completeness: 1 }));
  again.enqueue(cmd('re', 1500, 'setLinkEnabled', { linkId: 'L', enabled: true }));
  again.enqueue(cmd('b2', 1600, 'ablate', { target: 'L', durationMs: 1000, completeness: 1 }));
  const ev3 = again.advanceTo(4000);
  note('re-ablation after re-enable', `second complete ablate emits ${of(ev3, 'lesion_changed').filter(x => x.tMs > 1600).length} lesion_changed and the link ends ${again.readAt(4000).links.L.enabled ? 'ENABLED' : 'disabled'}`);
  // deeper pass mid-lesion
  const d = mk(two());
  d.enqueue(cmd('p1', 0, 'ablate', { target: 'L', durationMs: 1000, completeness: 0.5 }));
  d.enqueue(cmd('p2', 600, 'ablate', { target: 'L', durationMs: 500, completeness: 1 }));
  d.enqueue(cmd('p0', 700, 'ablate', { target: 'L', durationMs: 500, completeness: 0.4 }));
  const evd = d.advanceTo(2000);
  const prog = of(evd, 'lesion_changed').map(x => [x.tMs, +x.progress.toFixed(4), x.completeness]);
  check(JSON.stringify(prog) === JSON.stringify([[250, 0.125, 0.5], [500, 0.25, 0.5], [850, 0.625, 1], [1100, 1, 1]]),
    'a deeper pass continues from the current progress; old plan dropped; a shallower pass is a no-op', JSON.stringify(prog));
  // setDirectionDelay during a lesion edits the pre-lesion delay
  const s = mk(two());
  s.enqueue(cmd('p1', 0, 'ablate', { target: 'L', durationMs: 250, completeness: 0.5 }));
  s.enqueue(cmd('dd', 300, 'setDirectionDelay', { linkId: 'L', direction: 'ab', delayMs: 100 }));
  s.enqueue(cmd('st', 400, 'stimulate', { nodeId: 'A' }));
  const evs = s.advanceTo(1000);
  const pcd = of(evs, 'parameter_changed').find(x => x.commandId === 'dd');
  const ln = of(evs, 'conduction_launched')[0];
  check(pcd.previous === 87.5 && pcd.value === 175 && ln.arrivalMs - ln.departureMs === 175 && ln.delayParts.baseMs === 100 && ln.delayParts.lesionMs === 75,
    'setDirectionDelay under a lesion: base edited, reported values lesioned', `${pcd.previous}→${pcd.value}`);
}

// ---------- restitution and setNodeERP ----------
{
  const w = W('r', [N('A', 300, { restitution: { erpMaxMs: 300, amplitudeMs: 200, tauMs: 60, erpMinMs: 50 } })]);
  const e = mk(w);
  e.enqueue(cmd('e1', 10, 'setNodeERP', { nodeId: 'A', erpMs: 100 }));
  e.enqueue(cmd('e2', 20, 'setNodeERP', { nodeId: 'A', erpMs: 300 }));
  e.advanceTo(30);
  const r = e.readAt(30).nodes.A.restitution;
  if (r.erpMinMs !== 50) note('setNodeERP under restitution is not invertible', `300→100→300 leaves erpMin ${r.erpMinMs} (was 50): the 1 ms floor clamp at erpMax 100 loses the offset. Edits are logged, so replay is still exact`);
  else ok('setNodeERP round trip restores erpMin');
  const e2 = mk(w);
  e2.enqueue(cmd('p', 0, 'stimulate', { nodeId: 'A' }));
  e2.enqueue(cmd('law', 100, 'setRestitution', { nodeId: 'A', erpMaxMs: 250, amplitudeMs: 100, tauMs: 50, erpMinMs: 100 }));
  const ev = e2.advanceTo(200);
  const snap = e2.readAt(150).nodes.A;
  check(of(ev, 'parameter_changed').length === 1 && snap.erpMs === 250 && snap.refractoryUntilMs === 300,
    'setRestitution is prospective: current refractory period kept, readAt erpMs = new erpMax');
  note('setRestitution changes erpMax', 'it emits only parameter_changed restitution, not erpMs, although readAt erpMs changes; consumers that track erpMs from parameter_changed must also watch restitution');
}

// ---------- agents ----------
{
  const w = W('ag', [N('Nd', 300, { tissue: 'nodal' })]);
  const e = mk(w);
  e.enqueue(cmd('a1', 0, 'applyAgent', { agent: 'stillness', doseScale: 0.5 }));
  e.enqueue(cmd('a2', 2050, 'applyAgent', { agent: 'stillness', doseScale: 1 }));
  const ev = e.advanceTo(15000);
  const pc = of(ev, 'parameter_changed');
  const envelope = el => el <= 0 ? 0 : el <= 1500 ? el / 1500 : el <= 3500 ? 1 : el < 9500 ? 1 - (el - 3500) / 6000 : 0;
  let worst = 0; let prev = 300;
  for (const x of pc) {
    const level = Math.max(0.5 * envelope(x.tMs), 1 * envelope(x.tMs - 2050));
    const expect = 300 + Math.round(600_000 * level) / 1000;
    worst = Math.max(worst, Math.abs(x.value - expect));
    if (x.previous !== prev) worst = Infinity; prev = x.value;
  }
  check(worst === 0 && pc.at(-1).value === 300 && pc.at(-1).tMs === 2050 + 9500, 'overlapping Stillness doses: strongest envelope wins at every step; returns to rest', `${pc.length} steps`);
  const s = mk(W('sl', [N('P', 150), N('Q', 100)], [L('PQ', 'P', 'Q', D(100))]));
  s.enqueue(cmd('s1', 0, 'applyAgent', { agent: 'slow', doseScale: 1 }));
  s.enqueue(cmd('s2', 1000, 'applyAgent', { agent: 'slow', doseScale: 0.5 }));
  const sev = s.advanceTo(6000);
  const lv = of(sev, 'parameter_changed').map(x => [x.tMs, +x.value.toFixed(6)]);
  check(Math.abs(lv.find(x => x[0] === 1000)?.[1] - 1 / 3) < 1e-6 && lv.at(-1)[0] === 4000 && lv.at(-1)[1] === 0.5,
    'second Slow dose ramps from the current level (1/3 at 1000) to the new dose over 3000 ms', `${lv.length} steps, last ${lv.at(-1)}`);
}

// ---------- one-instant rule 4: entry uses destination state after all outcomes of the batch ----------
{
  const w = W('o4', [N('A', 100), N('B', 100)], [L('L', 'A', 'B', D(120, { entry: { maxExtraMs: 40, tauMs: 50 } }))]);
  const e = mk(w);
  e.enqueue(cmd('a', 0, 'stimulate', { nodeId: 'A' }));
  e.enqueue(cmd('b', 0, 'stimulate', { nodeId: 'B' }));
  const ln = of(e.advanceTo(0), 'conduction_launched')[0];
  const expect = Math.round(40000 * Math.exp(-20 / 50)) / 1000;
  check(ln.delayParts.entryMs === expect, 'rule 4: B captured in the launching batch slows the A→B launch (entry from post-outcome state)', `${ln.delayParts.entryMs} = 40 e^(-20/50)`);
}

// ---------- tone ----------
{
  const w = W('tone', [N('S', 200, { tissue: 'sinus', automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } })]);
  const e = mk(w);
  e.enqueue(cmd('t', 100, 'setTone', { value: -1 }));
  const ev = e.advanceTo(4000);
  const s = ev.filter(x => x.type === 'activation').map(x => x.tMs);
  check(JSON.stringify(s) === JSON.stringify([0, 800, 1440, 2080, 2720, 3360, 4000]), 'setTone -1: pending beat unchanged, later cycles 640 ms', s.join(','));
  const pt = of(ev, 'parameter_changed')[0];
  check(pt.parameter === 'tone' && pt.previous === 0 && pt.value === -1 && pt.cause === 'command', 'setTone emits parameter_changed tone');
}

// ---------- history / readAt / determinism fuzz over 1.1.0 state ----------
{
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = xs => xs[ri(0, xs.length - 1)];
  const tissues = ['sinus', 'atrial', 'nodal', 'hisPurkinje', 'ventricular', 'accessory'];
  let snapshotsCompared = 0; let cases = 0; let mismatch = null; let detMismatch = null;
  for (let c = 0; c < 150 && !mismatch && !detMismatch; c++) {
    const n = ri(3, 7);
    const nodes = Array.from({ length: n }, (_, i) => {
      const erp = ri(80, 300);
      return N(`N${i}`, erp, {
        tissue: pick(tissues),
        ...(rnd() < 0.5 ? { restitution: { erpMaxMs: erp, amplitudeMs: ri(0, 150), tauMs: ri(20, 120), erpMinMs: ri(30, erp) } } : {}),
        automaticity: rnd() < 0.35 ? { cycleMs: ri(300, 1100), firstAttemptMs: ri(0, 400), resetOnCapture: rnd() < 0.7,
          ...(rnd() < 0.5 ? { overdrive: { gainPerBeat: 0.06, maxMs: 300, warmupFactor: 0.6 } } : {}), ...(rnd() < 0.2 ? { protected: true } : {}) } : null,
      });
    });
    const links = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rnd() < 0.5) {
      const dir = () => D(ri(5, 90), { enabled: rnd() < 0.9, ...(rnd() < 0.3 ? { decrement: { maxExtraMs: ri(0, 60), tauMs: ri(30, 150) } } : {}),
        ...(rnd() < 0.4 ? { entry: { maxExtraMs: ri(0, 40), tauMs: ri(20, 100) } } : {}) });
      links.push({ id: `L${i}${j}`, a: `N${i}`, b: `N${j}`, enabled: true, ab: dir(), ba: dir() });
    }
    const autos = nodes.filter(x => x.automaticity);
    const coupling = autos.length && rnd() < 0.6 ? [{ id: 'k0', from: pick(nodes.filter(x => x !== autos[0])).id, to: autos[0].id, amplitude: rnd() * 0.25 }].filter(k => k.from !== k.to) : [];
    const world = W('fz', nodes, links, { coupling, ...(rnd() < 0.3 ? { autonomic: { breathPeriodMs: 4000, depth: 0.05, targets: ['sinus', 'nodal'] } } : {}) });
    const commands = [];
    let t = 0;
    for (let k = 0; k < ri(3, 30); k++) {
      t += pick([0, 1, 50, 100, 250, 400]);
      const id = `c${k}`; const nd = pick(nodes).id; const lk = links.length ? pick(links).id : null;
      const type = pick(['stimulate', 'stimulate', 'stimulateTrain', 'cancelTrain', 'setTone', 'ablate', 'applyAgent', 'setCoupling', 'setRestitution', 'setDecrement', 'setEntry', 'setNodeERP', 'setDirectionDelay', 'setLinkEnabled', 'setAutomaticity']);
      const trains = commands.filter(x => x.type === 'stimulateTrain');
      let more = null;
      if (type === 'stimulate') more = { nodeId: nd };
      else if (type === 'stimulateTrain') more = { nodeId: nd, startMs: t + ri(0, 200), cycleMs: ri(150, 500), count: ri(1, 20), label: '' };
      else if (type === 'cancelTrain' && trains.length) more = { trainId: pick(trains).commandId };
      else if (type === 'setTone') more = { value: Math.round((rnd() * 2 - 1) * 100) / 100 };
      else if (type === 'ablate' && lk) more = { target: lk, durationMs: ri(1, 2000), completeness: pick([0.25, 0.5, 1]) };
      else if (type === 'applyAgent') more = { agent: pick(['stillness', 'slow']), doseScale: pick([0.5, 1, 2]) };
      else if (type === 'setCoupling' && coupling.length) more = { couplingId: 'k0', value: rnd() * 0.25 };
      else if (type === 'setRestitution') { const m = ri(60, 400); more = { nodeId: nd, erpMaxMs: m, amplitudeMs: ri(0, 200), tauMs: ri(10, 200), erpMinMs: ri(10, m) }; }
      else if ((type === 'setDecrement' || type === 'setEntry') && lk) more = { linkId: lk, direction: pick(['ab', 'ba']), maxExtraMs: ri(0, 80), tauMs: ri(10, 200) };
      else if (type === 'setNodeERP') more = { nodeId: nd, erpMs: ri(50, 400) };
      else if (type === 'setDirectionDelay' && lk) more = { linkId: lk, direction: pick(['ab', 'ba']), delayMs: ri(1, 120) };
      else if (type === 'setLinkEnabled' && lk) more = { linkId: lk, enabled: rnd() < 0.5 };
      else if (type === 'setAutomaticity') more = { nodeId: nd, cycleMs: rnd() < 0.2 ? null : ri(300, 1200) };
      if (more) commands.push(cmd(id, t, type, more));
    }
    const horizon = t + ri(500, 8000);
    const play = (steps, history) => {
      const e = createEngine({ processingBudget: 5_000_000, historyBatches: history });
      e.reset(world, 'r');
      const out = []; const live = []; let ci = 0; let error = null;
      try {
        for (const h of steps) {
          while (ci < commands.length && commands[ci].tMs <= h) { try { e.enqueue(commands[ci]); } catch (err) { out.push(`rejected ${commands[ci].commandId}: ${err.message}`); } ci++; }
          out.push(...e.advanceTo(h));
          live.push([h, JSON.stringify(e.readAt(h))]);
        }
      } catch (err) { error = err.message; }
      return { e, out: JSON.stringify(out), live, error };
    };
    const fine = []; for (let h = 0; h <= horizon; h += 37) fine.push(h); if (fine.at(-1) !== horizon) fine.push(horizon);
    const coarse = [0, Math.floor(horizon / 3), horizon];
    const a = play(fine, 100000); const b = play(fine, 50); const z = play(coarse, 100000);
    cases++;
    // readAt for every past live instant equals what was read live (deep history, checkpoints every 64 batches)
    for (const [h, snap] of a.live) {
      snapshotsCompared++;
      if (JSON.stringify(a.e.readAt(h)) !== snap) { mismatch = { c, h }; break; }
      // run b keeps only 50 batches: every instant still retained must read the same
      if (!b.error && h >= b.e.diagnostics().retainedFromMs && JSON.stringify(b.e.readAt(h)) !== snap) { mismatch = { c, h, evicted: true }; break; }
    }
    // Commands are enqueued at different horizons in the coarse run, so only compare when none was rejected.
    if (!a.error && !z.error && !a.out.includes('rejected') && !z.out.includes('rejected')) {
      const strip = s => s; // events identical regardless of advancement schedule
      if (strip(a.out) !== strip(z.out) || a.out !== b.out) detMismatch = { c };
    }
  }
  check(!mismatch, `readAt after the fact equals the live snapshot (1.1.0 fuzz, ${cases} worlds, ${snapshotsCompared} instants)`, mismatch ? JSON.stringify(mismatch) : '');
  check(!detMismatch, '1.1.0 fuzz: events identical under fine (37 ms) and coarse advancement and under history limit 50', detMismatch ? JSON.stringify(detMismatch) : '');
}

// delayParts sum exactly (as ms floats) to arrival - departure
{
  const launches = emitted.filter(e => e.type === 'conduction_launched' && e.delayParts);
  const inexact = launches.filter(e => { const p = e.delayParts; return p.baseMs + p.sourceMs + p.entryMs + p.lesionMs + p.agentMs !== e.arrivalMs - e.departureMs; });
  const offByTick = launches.filter(e => { const p = e.delayParts; return Math.round((p.baseMs + p.sourceMs + p.entryMs + p.lesionMs + p.agentMs) * 1000) !== Math.round((e.arrivalMs - e.departureMs) * 1000); });
  check(offByTick.length === 0, `delayParts sum to arrival - departure in ticks (${launches.length} launches)`);
  if (inexact.length) note('delayParts float sum', `${inexact.length}/${launches.length} launches differ from arrivalMs - departureMs by float rounding only (README says "exactly"; exact in integer ticks)`);
}
{
  const dir = join(here, '.g1-tmp-edges'); mkdirSync(dir, { recursive: true });
  const file = join(dir, 'events.json'); writeFileSync(file, JSON.stringify(emitted));
  try {
    const out = execFileSync('python3', ['-I', '-c', `
import json, sys
from jsonschema import Draft7Validator
v = Draft7Validator(json.load(open(sys.argv[1])))
ev = json.load(open(sys.argv[2]))
bad = [e for e in ev if not v.is_valid(e)]
print(len(ev), len(bad), json.dumps(bad[:2]))
`, join(here, '..', '..', 'contracts', 'event.v1_1.schema.json'), file]).toString().trim();
    const [n, bad] = out.split(' ');
    check(bad === '0', `event.v1_1 schema validates all ${n} events from these probes and the fuzz`, bad === '0' ? '' : out);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(lines.join('\n'));
if (bugs) process.exitCode = 1;
