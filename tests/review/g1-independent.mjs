// G1 independent review: oracle numbers re-derived from design/study-2-spec.md.
//
// Written by the G1 reviewer without reading tests/engine-v11*.js expectations.
// Worlds are built here. Every "expected" number comes from a hand recurrence or
// closed form written in this file from the spec formulas; the engine is only run
// to produce the "engine" column. The one place where this file follows the
// implementer rather than the spec is the §D out-of-cycle phase rule (phi outside
// [0, 1) ignored), which is evaluated on its own below (periodic-sine variant).
//
// Run: node tests/review/g1-independent.mjs [--json]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../../src/engine/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const T = 1000; // ticks per ms
const ms = tick => tick / T;
const table = [];
const allEvents = [];
const row = (oracle, spec, independent, engine, pass) => {
  table.push({ oracle, spec, independent, engine, pass });
  if (!pass) process.exitCode = 1;
};

// ---------- tiny world builders (independent of tests/engine-v11-scenes.js) ----------
const N = (id, erpMs, more = {}) => ({ id, erpMs, recoveryTailMs: 100, automaticity: null, ...more });
const D = (delayMs, more = {}) => ({ enabled: true, delayMs, decrement: null, ...more });
const OFF = delayMs => ({ enabled: false, delayMs, decrement: null });
const L = (id, a, b, ab, ba) => ({ id, a, b, enabled: true, ab, ba: ba ?? OFF(ab.delayMs) });
const W11 = (worldId, nodes, links = [], more = {}) => ({ contractVersion: '1.1.0', worldId, nodes, links, ...more });

function run(world, commands, horizons, { runId = 'g1', budget = 50_000_000, keep = true } = {}) {
  const engine = createEngine({ processingBudget: budget });
  engine.reset(world, runId);
  for (const c of commands) engine.enqueue({ runId, ...c });
  const events = [];
  for (const h of [].concat(horizons)) events.push(...engine.advanceTo(h));
  if (keep) allEvents.push(...events);
  return { engine, events };
}
const acts = (events, id) => events.filter(e => e.type === 'activation' && e.nodeId === id);
const times = (events, id) => acts(events, id).map(e => e.tMs);
const stim = (commandId, tMs, nodeId) => ({ commandId, tMs, type: 'stimulate', nodeId });
const trainCmd = (commandId, tMs, nodeId, startMs, cycleMs, count) => ({ commandId, tMs, type: 'stimulateTrain', nodeId, startMs, cycleMs, count, label: 'S1' });
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const r3 = x => Math.round(x * 1000) / 1000;

// ======================= §A restitution =======================
// Hand iteration of ERP_n = clamp(Emax - A e^(-DI/tau)), DI_n = t_n - refractoryUntil_{n-1}, in ticks, one round.
function restitutionHand(cl, count, { Emax, A, tau, Emin }) {
  const erps = [];
  let until = null;
  for (let k = 0; k < count; k++) {
    const t = k * cl * T;
    if (until !== null && t < until) { erps.push(null); continue; } // blocked pulse
    const erp = until === null ? Emax * T : Math.min(Emax * T, Math.max(Emin * T, Math.round(Emax * T - A * T * Math.exp(-(t - until) / (tau * T)))));
    erps.push(erp);
    until = t + erp;
  }
  return erps.map(e => e === null ? null : ms(e));
}
// Continuous fixed point E* = Emax - A exp(-(CL - E*)/tau), bisection; slope at DI*.
function restitutionFixedPoint(cl, { Emax, A, tau }) {
  let lo = 0; let hi = cl;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const g = Emax - A * Math.exp(-(cl - mid) / tau) - mid;
    if (g > 0) lo = mid; else hi = mid;
  }
  const erp = (lo + hi) / 2;
  return { erp, slope: (A / tau) * Math.exp(-(cl - erp) / tau) };
}
{
  const law = { Emax: 300, A: 200, tau: 60, Emin: 20 };
  const world = W11('rest', [N('X', 300, { restitution: { erpMaxMs: 300, amplitudeMs: 200, tauMs: 60, erpMinMs: 20 } })]);
  for (const cl of [340, 300]) {
    const count = 64;
    const { events } = run(world, [trainCmd('S1', 0, 'X', 0, cl, count)], count * cl);
    const engineErps = [];
    let ai = 0;
    const a = acts(events, 'X');
    const blocks = events.filter(e => e.type === 'activation_blocked' && e.nodeId === 'X').map(e => e.tMs);
    for (let k = 0; k < count; k++) {
      const t = k * cl;
      if (blocks.includes(t)) engineErps.push(null);
      else { engineErps.push(a[ai].erpMs); ai++; }
    }
    const hand = restitutionHand(cl, count, law);
    const fp = restitutionFixedPoint(cl, law);
    const tail = hand.slice(-6);
    const sameSeq = JSON.stringify(hand) === JSON.stringify(engineErps);
    // DI annotations agree with the definition DI = t - previous refractoryUntil.
    const diOk = a.every((e, i) => i === 0 ? e.diastolicIntervalMs === null
      : near(e.diastolicIntervalMs, e.tMs - a[i - 1].refractoryUntilMs, 1e-9));
    if (cl === 340) {
      const stable = Math.abs(hand.at(-1) - hand.at(-2)) <= 0.001;
      row(`§A restitution CL 340 (E 300, A 200, tau 60)`, 'stable, ERP ~253, slope ~0.78',
        `fixed point ${r3(fp.erp)} ms, slope ${r3(fp.slope)}; iteration ends ${tail.slice(-2).join(', ')}`,
        `${engineErps.slice(-2).join(', ')}; 64/64 beats identical to iteration: ${sameSeq}; DI field ok: ${diOk}`,
        sameSeq && diOk && stable && near(fp.erp, 253, 0.5) && near(fp.slope, 0.78, 0.01) && near(hand.at(-1), fp.erp, 0.002));
    } else {
      const even = hand.at(-2); const odd = hand.at(-1);
      const alternates = hand.slice(-20).every((e, i, xs) => i < 2 || e === xs[i - 2]) && Math.abs(even - odd) > 50;
      row(`§A restitution CL 300`, 'alternans; steady ERP ~233, slope ~1.1',
        `fixed point ${r3(fp.erp)} ms, slope ${r3(fp.slope)} (>1); iteration settles to ${even} / ${odd}`,
        `${engineErps.slice(-2).join(' / ')}; 64/64 identical: ${sameSeq}; blocked pulses: ${blocks.length}`,
        sameSeq && diOk && alternates && fp.slope > 1 && near(fp.erp, 233, 1) && near(fp.slope, 1.1, 0.01));
    }
  }
}

// ======================= §C overdrive and pauses =======================
// Hand: S_driven += round(g (T - I)) capped; spontaneous S = round(w S); next = t + T + S.
{
  const T0 = 800; const g = 0.06; const Smax = 450; const w = 0.6;
  const focus = (resetOnCapture, overdrive, erpMs = 200) => W11('focus', [N('F', erpMs, {
    tissue: 'sinus', automaticity: { cycleMs: T0, firstAttemptMs: 0, resetOnCapture, ...(overdrive ? { overdrive: { gainPerBeat: g, maxMs: Smax, warmupFactor: w } } : {}) },
  })]);
  // 30 pulses at 500 ms, the first 500 ms after the focus's spontaneous beat at 0.
  let S = 0; let t = 0; let last = 0;
  for (let k = 1; k <= 30; k++) { t = 500 * k * T; S = Math.min(Smax * T, S + Math.round(g * (T0 * T - (t - last)))); last = t; }
  const handReturns = [];
  let next = t + T0 * T + S;
  handReturns.push(ms(next - t));
  for (let k = 0; k < 4; k++) { const fire = next; S = Math.round(w * S); next = fire + T0 * T + S; handReturns.push(ms(next - fire)); }
  const { events } = run(focus(true, true), [trainCmd('drive', 0, 'F', 500, 500, 30)], 15000 + 6000);
  const f = times(events, 'F');
  const lastPaced = 15000;
  const after = f.filter(x => x > lastPaced);
  const eng = [after[0] - lastPaced, ...after.slice(1, 5).map((x, i) => r3(x - after[i]))];
  const spec = [1250, 1070, 962, 897];
  const within = spec.map((s, i) => Math.abs(eng[i] - s) * T);
  row('§C overdrive: 30 x 500 ms into 800 ms focus (g .06, Smax 450, w .6)', '1250, 1070, 962, 897 (±1 tick)',
    handReturns.slice(0, 4).join(', '), eng.slice(0, 4).join(', '),
    JSON.stringify(eng.slice(0, 4)) === JSON.stringify(handReturns.slice(0, 4)) && within.slice(0, 3).every(x => x <= 1));
  table.at(-1).note = `897 vs 897.2: the law gives S = 0.6^3 x 450 = 97.2 ms exactly; the spec's "897 (±1 tick)" is 200 ticks off its own formula`;

  // Pauses. Sinus beat at 0, premature stimulus at c = 400, ERP 450 so the 800 attempt is refractory.
  const c = 450;
  const nonReset = times(run(focus(false, false, 400), [stim('pvc', c, 'F')], 2500).events, 'F');
  const reset = times(run(focus(true, false, 400), [stim('pvc', c, 'F')], 2500).events, 'F');
  const handNon = 2 * T0; const handReset = T0 + c;
  const pauseNon = nonReset.find(x => x > c) - 0;
  const pauseReset = reset.find(x => x > c) - 0;
  row('§C compensatory pause, non-reset focus (CL 800, ERP 400, coupling 450)', 'exactly 2 x cycle', `${handNon} (beat-to-beat around the PVC)`, `${pauseNon}`, pauseNon === handNon);
  row('§C non-compensatory pause, reset focus', 'cycle + coupling interval', `${handReset}`, `${pauseReset}`, pauseReset === handReset);
}

// ======================= §B entry slowing: ring recurrence =======================
// One wave in a ring. At capture of site i at t: DI and ERP by §A. Launch to j: nominal = t + d;
// if j activated and nominal >= until_j, entry = round(M e^(-(nominal-until_j)/tauE)); arrival = nominal + entry.
function ringHand({ n, d, M, tauE, Emax, A, tau, Emin, start, laps }) {
  const until = Array(n).fill(null);
  const r0 = [];
  let i = start; let t = 0;
  for (let step = 0; step < n * laps + 1; step++) {
    if (until[i] !== null && t < until[i]) break;
    const erp = until[i] === null ? Emax * T : Math.min(Emax * T, Math.max(Emin * T, Math.round(Emax * T - A * T * Math.exp(-(t - until[i]) / (tau * T)))));
    until[i] = t + erp;
    if (i === 0) r0.push(t);
    const j = (i + 1) % n;
    const nominal = t + d * T;
    const entry = until[j] !== null && nominal >= until[j] ? Math.round(M * T * Math.exp(-(nominal - until[j]) / (tauE * T))) : 0;
    t = nominal + entry; i = j;
  }
  return r0.map(ms);
}
function ringWorld({ n, d, M, tauE, Emax, A, tau, Emin, oneWay }) {
  const nodes = []; const links = [];
  for (let i = 0; i < n; i++) {
    nodes.push(N(`R${i}`, Emax, { restitution: { erpMaxMs: Emax, amplitudeMs: A, tauMs: tau, erpMinMs: Emin } }));
    const dir = enabled => ({ enabled, delayMs: d, decrement: null, entry: M === 0 ? null : { maxExtraMs: M, tauMs: tauE } });
    // ring direction R_i -> R_(i+1); reverse disabled on every link (oneWay) or only on the last one
    links.push({ id: `K${i}`, a: `R${i}`, b: `R${(i + 1) % n}`, enabled: true, ab: dir(true), ba: dir(!(oneWay || i === n - 1)) });
  }
  return W11('ring', nodes, links);
}
{
  for (const p of [
    { n: 8, d: 35, M: 20, tauE: 60, Emax: 220, A: 80, tau: 60, Emin: 100, label: 'implementer ring 8 x 35 (entry 20/60)' },
    { n: 10, d: 28, M: 30, tauE: 50, Emax: 230, A: 80, tau: 60, Emin: 80, label: 'reviewer ring 10 x 28 (entry 30/50)' },
  ]) {
    const laps = 12;
    const hand = ringHand({ ...p, start: 0, laps });
    const { events } = run(ringWorld({ ...p, oneWay: true }), [stim('S', 0, 'R0')], hand.at(-1) + 1);
    const eng = times(events, 'R0');
    const identical = JSON.stringify(eng) === JSON.stringify(hand);
    const lapsHand = hand.slice(1).map((x, k) => r3(x - hand[k]));
    const varAfter3 = Math.max(...lapsHand.slice(3).map((x, k, xs) => k === 0 ? 0 : Math.abs(x - xs[k - 1])));
    const varies = new Set(lapsHand).size > 1;
    // delayParts must sum to arrival - departure and the entry part must match the law.
    const launches = events.filter(e => e.type === 'conduction_launched');
    const partsOk = launches.every(e => near(e.delayParts.baseMs + e.delayParts.sourceMs + e.delayParts.entryMs + e.delayParts.lesionMs + e.delayParts.agentMs, e.arrivalMs - e.departureMs, 1e-9));
    row(`§B entry ring, ${p.label}`, 'lap-to-lap variation, < 5 ms after lap 3',
      `laps ${lapsHand.slice(0, 5).join(', ')} … ${lapsHand.at(-1)}; max |Δlap| after lap 3 = ${r3(varAfter3)} ms`,
      `R0 times identical to recurrence (${eng.length} captures): ${identical}; delayParts sum ok: ${partsOk}`,
      identical && varies && varAfter3 < 5 && partsOk);
  }
  // Resetting curve: bidirectional ring (reverse disabled on one link only). Stimulus at R0 at
  // coupling c after an R0 capture in steady reentry; return = next R0 capture after S2 minus S2.
  const p = { n: 8, d: 35, M: 20, tauE: 60, Emax: 220, A: 80, tau: 60, Emin: 100 };
  const world = ringWorld({ ...p, oneWay: false });
  const base = run(world, [stim('S1', 0, 'R0')], 6000, { keep: false });
  const r0 = times(base.events, 'R0');
  const anchor = r0.find(x => x > 3000);
  const lap = r3(r0[r0.indexOf(anchor) + 1] - anchor);
  const curve = [];
  for (let c = Math.round(lap) - 5; c >= 150; c -= 5) {
    const { events } = run(world, [stim('S1', 0, 'R0'), stim('S2', anchor + c, 'R0')], anchor + c + 1500, { keep: false });
    const s2 = anchor + c;
    const captured = acts(events, 'R0').some(e => e.tMs === s2);
    if (!captured) break;
    const ret = times(events, 'R0').find(x => x > s2);
    if (ret === undefined) { curve.push([c, null]); break; }
    curve.push([c, r3(ret - s2)]);
  }
  const valid = curve.filter(([, r]) => r !== null);
  const monotone = valid.every(([, r], k) => k === 0 || r >= valid[k - 1][1]);
  const strict = valid.every(([, r], k) => k === 0 || r > valid[k - 1][1]);
  const noEntry = ringWorld({ ...p, M: 0, oneWay: false });
  const ne = run(noEntry, [stim('S1', 0, 'R0')], 6000, { keep: false });
  const neR0 = times(ne.events, 'R0'); const neAnchor = neR0.find(x => x > 3000);
  const flat = [];
  for (const c of [250, 220, 200]) {
    const { events } = run(noEntry, [stim('S1', 0, 'R0'), stim('S2', neAnchor + c, 'R0')], neAnchor + c + 1500, { keep: false });
    const ret = times(events, 'R0').find(x => x > neAnchor + c);
    flat.push(ret === undefined ? null : r3(ret - neAnchor - c));
  }
  row('§B resetting curve (S2 scan, 5 ms steps)', 'monotonic, rising as S2 gets earlier',
    `no-entry control is flat at n x d = ${p.n * p.d}: ${flat.join(', ')}`,
    `${valid.length} couplings ${valid[0][0]}→${valid.at(-1)[0]} ms: return ${valid[0][1]} → ${valid.at(-1)[1]} ms; strictly rising: ${strict}`,
    monotone && strict && valid.length >= 5 && flat.every(x => x === p.n * p.d));
}

// ======================= §D coupling sweep on Duality cycles =======================
// Independent event-level iteration. A fires every 720 ms from 0 (nothing reaches A). B: cycle 1030,
// first attempt 170, protected, ERP 240, reset on own firing. Each A firing at t with
// phi = (t - origin)/T in [0,1) moves B's pending attempt to max(t + 1 tick, pending + round(T a sin 2 pi phi)).
// origin = B's last attempt (or firstAttempt - T before the first). periodic=true uses phi mod 1 instead.
function hemiolaHand(a, aCycles, periodic = false, endMs = null) {
  const TA = 720 * T; const TB = 1030 * T; const erpB = 240 * T;
  let pending = 170 * T; let origin = 170 * T - TB; let untilB = null;
  const bTimes = [];
  const end = endMs === null ? aCycles * TA : endMs * T;
  for (let k = 0; ; k++) {
    const tA = k * TA;
    while (pending <= Math.min(tA, end)) { // B attempts first (same-tick: reset, then modulated with phi 0)
      if (untilB === null || pending >= untilB) { bTimes.push(pending); untilB = pending + erpB; }
      origin = pending; pending = pending + TB;
    }
    if (tA > end) break;
    let phi = (tA - origin) / TB;
    if (periodic) phi -= Math.floor(phi);
    if (a === 0 || phi < 0 || phi >= 1) continue;
    const shift = Math.round(TB * a * Math.sin(2 * Math.PI * phi));
    pending = Math.max(tA + 1, pending + shift);
  }
  return bTimes.map(ms);
}
function dualityCoupled(a) {
  const nodes = [
    N('A', 180, { automaticity: { cycleMs: 720, firstAttemptMs: 0, resetOnCapture: true } }), N('A1', 200), N('A2', 220),
    N('B', 240, { automaticity: { cycleMs: 1030, firstAttemptMs: 170, resetOnCapture: true, protected: true } }), N('B1', 240), N('B2', 240),
  ];
  const links = [L('AA1', 'A', 'A1', D(45)), L('AA2', 'A', 'A2', D(85)), L('BB1', 'B', 'B1', D(60)), L('BB2', 'B', 'B2', D(110))];
  return W11('duality', nodes, links, { coupling: [{ id: 'AB', from: 'A', to: 'B', amplitude: a }] });
}
const ratioName = r => {
  for (const [p, q] of [[2, 3], [5, 7], [3, 4], [7, 10], [1, 2], [3, 5], [4, 5]]) if (Math.abs(r - p / q) < 1e-9) return `${p}:${q}`;
  return r.toFixed(4);
};
{
  const aCycles = 520; const lo = 100; const hi = 520;
  const count = bt => bt.filter(x => x >= lo * 720 && x < hi * 720).length / (hi - lo);
  const amplitudes = [];
  for (let k = 0; k <= 500; k++) amplitudes.push(Math.round(k * 5) / 10000); // 0 .. 0.25 step 0.0005
  const hand = new Map(); const periodic = new Map();
  for (const a of amplitudes) { hand.set(a, count(hemiolaHand(a, aCycles))); periodic.set(a, count(hemiolaHand(a, aCycles, true))); }
  // Engine on a 0.005 grid plus points near the window edges; B firing times compared exactly.
  const engineAmps = [...new Set([...amplitudes.filter((_, k) => k % 10 === 0), 0.1545, 0.155, 0.1825, 0.184, 0.1845, 0.205, 0.2075, 0.208, 0.21, 0.22, 0.222, 0.2225, 0.238, 0.2385])].sort((x, y) => x - y);
  let identical = 0;
  const mism = [];
  for (const a of engineAmps) {
    const { events } = run(dualityCoupled(a), [], aCycles * 720 - 1, { keep: a === 0.17 });
    const eng = times(events, 'B');
    const h = hemiolaHand(a, aCycles, false, aCycles * 720 - 1);
    if (JSON.stringify(eng) === JSON.stringify(h)) identical++; else mism.push(a);
  }
  const runs = []; // contiguous plateaus of the hand map
  for (const a of amplitudes) {
    const name = ratioName(hand.get(a));
    if (runs.length && runs.at(-1).name === name) runs.at(-1).to = a; else runs.push({ name, from: a, to: a });
  }
  const show = runs.filter(r => ['2:3', '5:7', '3:4'].includes(r.name)).map(r => `${r.name} ${r.from}–${r.to}`).join('; ');
  const in23 = amplitudes.filter(a => a >= 0.155 && a <= 0.205 && Math.abs(a - 0.1825) > 0.003).every(a => ratioName(hand.get(a)) === '2:3');
  const has57 = ratioName(hand.get(0.1825)) === '5:7';
  const in34 = amplitudes.filter(a => a >= 0.21 && a <= 0.22).every(a => ratioName(hand.get(a)) === '3:4');
  const uncoupled = hand.get(0);
  row('§D coupling sweep, Duality 720/1030, a = 0…0.25 (0.0005 step, 420 A cycles)',
    '2:3 at .155–.205 with narrow 5:7 near .1825; 3:4 at .21–.22; uncoupled 0.699 drifting',
    `uncoupled ${uncoupled.toFixed(4)}; ${show}`,
    `B firing times identical to the iteration at ${identical}/${engineAmps.length} amplitudes${mism.length ? ` (mismatch ${mism.join(',')})` : ''}`,
    identical === engineAmps.length && in23 && has57 && in34 && near(uncoupled, 0.699, 0.005));
  const pRuns = [];
  for (const a of amplitudes) {
    const name = ratioName(periodic.get(a));
    if (pRuns.length && pRuns.at(-1).name === name) pRuns.at(-1).to = a; else pRuns.push({ name, from: a, to: a });
  }
  const pShow = pRuns.filter(r => ['2:3', '5:7', '3:4'].includes(r.name)).map(r => `${r.name} ${r.from}–${r.to}`).join('; ');
  row('§D variant: periodic sine (phi mod 1), hand only', 'n/a (evaluates implementer decision)', pShow, 'not run (engine implements the in-cycle rule)', true);
  table.at(-1).info = true;
}

// ======================= §E concealed conduction: 3-site nodal chain =======================
// Feed-forward chain A -> N1 -> N2 -> N3 -> H, one way. Per hop: nominal = t + d + dec(source recovery);
// entry if the destination is activated and nominal >= its until; block if arrival < until.
function chainHand(cl, pulses, P) {
  const order = ['A', 'N1', 'N2', 'N3', 'H'];
  const st = Object.fromEntries(order.map(id => [id, { until: null }]));
  const out = []; // per pulse: { H: time or null, blockedAt }
  for (let k = 0; k < pulses; k++) {
    let t = (100 + k * cl) * T; let blockedAt = null; let hTime = null;
    for (let i = 0; i < order.length; i++) {
      const id = order[i]; const s = st[id];
      if (s.until !== null && t < s.until) { blockedAt = id; break; }
      const prior = s.until;
      s.until = t + P.erp[id] * T;
      if (id === 'H') { hTime = t; break; }
      const hop = P.hops[i];
      const dec = hop.dec && prior !== null ? Math.round(hop.dec[0] * T * Math.exp(-Math.max(0, t - prior) / (hop.dec[1] * T))) : 0;
      const nominal = t + hop.d * T + dec;
      const dest = st[order[i + 1]];
      const entry = hop.entry && dest.until !== null && nominal >= dest.until ? Math.round(hop.entry[0] * T * Math.exp(-(nominal - dest.until) / (hop.entry[1] * T))) : 0;
      t = nominal + entry;
    }
    out.push({ ah: hTime === null ? null : ms(hTime) - (100 + k * cl), blockedAt });
  }
  return out;
}
function chainWorld(P) {
  const nodal = { tissue: 'nodal', audible: false };
  const ids = ['A', 'N1', 'N2', 'N3', 'H'];
  const nodes = ids.map(id => N(id, P.erp[id], id.startsWith('N') ? nodal : { tissue: id === 'A' ? 'atrial' : 'hisPurkinje' }));
  const links = P.hops.map((h, i) => L(`h${i}`, ids[i], ids[i + 1], D(h.d, {
    ...(h.dec ? { decrement: { maxExtraMs: h.dec[0], tauMs: h.dec[1] } } : {}),
    ...(h.entry ? { entry: { maxExtraMs: h.entry[0], tauMs: h.entry[1] } } : {}),
  })));
  return W11('chain', nodes, links);
}
const pattern = seq => seq.map(x => x.ah === null ? 'x' : 'C').join('');
{
  const P = {
    erp: { A: 200, N1: 200, N2: 220, N3: 260, H: 250 },
    hops: [{ d: 30 }, { d: 40, dec: [30, 100] }, { d: 50, dec: [40, 100], entry: [60, 60] }, { d: 30 }],
  };
  const pulses = 24;
  for (const cl of [300]) {
    const hand = chainHand(cl, pulses, P);
    const { events } = run(chainWorld(P), Array.from({ length: pulses }, (_, k) => stim(`p${k}`, 100 + k * cl, 'A')), 100 + pulses * cl + 500);
    const h = times(events, 'H');
    const engAh = []; let hi = 0;
    for (let k = 0; k < pulses; k++) {
      const t0 = 100 + k * cl; const next = 100 + (k + 1) * cl + 400;
      if (hi < h.length && h[hi] > t0 && h[hi] < next && hand[k].ah !== null) { engAh.push(r3(h[hi] - t0)); hi++; } else engAh.push(null);
    }
    const handAh = hand.map(x => x.ah === null ? null : r3(x.ah));
    const same = JSON.stringify(handAh) === JSON.stringify(engAh) && h.length === handAh.filter(x => x !== null).length;
    const pat = pattern(hand);
    const group = handAh.slice(4, 8);
    const prolong = group[0] < group[1] && group[1] < group[2] && group[3] === null && (group[1] - group[0]) > (group[2] - group[1]);
    const n3Blocks = events.filter(e => e.type === 'activation_blocked' && e.nodeId === 'N3').length;
    const concealed = hand.filter(x => x.blockedAt === 'N3').length;
    row(`§E 3-site nodal chain at CL ${cl} (decrement N1→N2, N2→N3; entry 60/60 into N3)`, '4:3 Wenckebach, progressive prolongation',
      `pattern ${pat.slice(0, 12)}…; group AH ${group.slice(0, 3).join(' → ')} then block at N3 (concealed: ${concealed}/${pulses})`,
      `AH sequence identical: ${same}; N3 blocks ${n3Blocks}`,
      same && /^(CCCx)+$/.test(pat.slice(pat.length % 4 === 0 ? 0 : 0)) && prolong && n3Blocks === concealed);
  }
  // Without entry slowing the same chain cannot show progressive prolongation at any cycle.
  const noEntry = { ...P, hops: P.hops.map(h => ({ ...h, entry: undefined })) };
  const report = [];
  let anyProgressive = false;
  for (let cl = 240; cl <= 420; cl += 5) {
    const hand = chainHand(cl, 60, noEntry).slice(20);
    const vals = hand.filter(x => x.ah !== null).map(x => r3(x.ah));
    const distinct = new Set(vals).size;
    if (distinct > 1) anyProgressive = true;
    report.push(`${cl}:${pattern(hand).slice(0, 4)}/${distinct}`);
  }
  row('§E control: same chain, entry slowing off, CL 240–420 (hand only)', 'spec: Wenckebach from decrement alone',
    `steady AH takes ${anyProgressive ? 'several' : 'one'} value per cycle at every CL; ratios: ${[...new Set(report.map(x => x.split(':')[1].split('/')[0]))].join(', ')}`,
    'not run', !anyProgressive);
  table.at(-1).info = true;
  // Chain is 1:1 at 320 and 3:2 at 280 (claim in the receipt).
  const at = cl => pattern(chainHand(cl, 40, P).slice(16));
  const e320 = run(chainWorld(P), Array.from({ length: 40 }, (_, k) => stim(`q${k}`, 100 + k * 320, 'A')), 100 + 40 * 320 + 500, { keep: false });
  row('§E same chain at CL 320 / 280', 'receipt: 1:1 / 3:2', `${at(320).slice(0, 6)} / ${at(280).slice(0, 6)}`,
    `H count at 320: ${times(e320.events, 'H').length}/40`, /^C+$/.test(at(320)) && /^(CCx|CxC|xCC)+/.test(at(280)) && times(e320.events, 'H').length === 40);
}

// ======================= §F lesion on the Circulation ring =======================
// Circulation ring (8 sites, 60 ms links, R1 ERP 300, R0 180, others 220). S1 0, S2 240 at R0 leaves the wave
// R0 -> R7 -> R6 -> ... -> R1 -> R0, lap 480. L5 joins R5–R6; the wave crosses it R6 -> R5. Ablation from t0 over
// dur with steps every 250 ms; delay at departure = round(60 (1 + 3 p^2)), p the latest applied step.
function circulation() {
  const erp = [180, 300, 220, 220, 220, 220, 220, 220];
  const nodes = erp.map((e, i) => ({ id: `R${i}`, erpMs: e, recoveryTailMs: 120, automaticity: null }));
  const links = erp.map((_, i) => ({ id: `L${i}`, a: `R${i}`, b: `R${(i + 1) % 8}`, enabled: true, ab: D(60), ba: D(60) }));
  return W11('circulation', nodes, links);
}
function lesionHand(t0, dur, completeness, until) {
  const steps = [];
  for (let e = 250; ; e += 250) { const el = Math.min(e, dur); steps.push({ t: (t0 + el) * T, p: el === dur ? completeness : completeness * el / dur }); if (el === dur) break; }
  const pAt = t => { let p = 0; for (const s of steps) if (s.t <= t) p = s.p; return p; };
  const r0 = []; let tR0 = 240 * T; const off = (t0 + dur) * T;
  let lastCapture = null;
  while (tR0 <= until * T) {
    r0.push(tR0);
    const tR6 = tR0 + 120 * T; lastCapture = tR6;
    const p = pAt(tR6);
    const delay = Math.round(60 * T * (1 + 3 * p * p));
    const arrive = tR6 + delay;
    if (completeness === 1 && arrive > off && tR6 < off + 1) { return { r0: r0.map(ms), last: ms(tR6), cancelledAt: ms(off) }; }
    if (completeness === 1 && tR6 >= off) return { r0: r0.map(ms), last: ms(tR6), cancelledAt: null };
    tR0 = arrive + 300 * T;
  }
  return { r0: r0.map(ms), last: ms(lastCapture), cancelledAt: null };
}
{
  const world = circulation();
  const ind = [stim('S1', 0, 'R0'), stim('S2', 240, 'R0')];
  const full = lesionHand(2000, 2000, 1, 6000);
  const { events } = run(world, [...ind, { commandId: 'burn', tMs: 2000, type: 'ablate', target: 'L5', durationMs: 2000, completeness: 1 }], 6000);
  const r0 = times(events, 'R0').filter(t => t >= 240);
  const all = events.filter(e => e.type === 'activation');
  const lastAct = all.at(-1);
  const cancel = events.find(e => e.type === 'conduction_canceled');
  const steps = events.filter(e => e.type === 'parameter_changed' && e.cause === 'lesion' && e.direction === 'ba').map(e => [e.tMs, e.value]);
  const handSteps = []; for (let k = 1; k <= 8; k++) handSteps.push([2000 + 250 * k, ms(Math.round(60 * T * (1 + 3 * (k / 8) ** 2)))]);
  const ok = JSON.stringify(r0) === JSON.stringify(full.r0) && lastAct.tMs === full.last && cancel?.tMs === 4000 && cancel?.cause === 'lesion' &&
    JSON.stringify(steps) === JSON.stringify(handSteps.filter(([, v], i) => i === 0 || v !== handSteps[i - 1][1]));
  row('§F complete ablation of L5 (2000 ms, p = 1) during reentry', 'terminates on the first lap after p = 1',
    `R0 ${full.r0.slice(4).join(', ')}; last capture R6 ${full.last}; transit cut at ${full.cancelledAt}; delays ${handSteps.map(x => x[1]).join(', ')}`,
    `R0 ${r0.slice(4).join(', ')}; last ${lastAct.nodeId} ${lastAct.tMs}; canceled ${cancel?.tMs} (${cancel?.cause}); steps identical: ${ok}`, ok);
  const half = lesionHand(2000, 2000, 0.5, 9000);
  const h = run(world, [...ind, { commandId: 'pass', tMs: 2000, type: 'ablate', target: 'L5', durationMs: 2000, completeness: 0.5 }], 9000);
  const hr0 = times(h.events, 'R0').filter(t => t >= 240);
  const hl = hr0.slice(1).map((x, k) => r3(x - hr0[k]));
  const okHalf = JSON.stringify(hr0) === JSON.stringify(half.r0.filter(t => t <= 9000)) && hl.at(-1) === 7 * 60 + Math.round(60 * 1.75);
  row('§F incomplete ablation (completeness 0.5)', 'reentry persists with a longer cycle',
    `steady lap 7 x 60 + 60 x (1 + 3 x 0.25) = ${7 * 60 + 60 * 1.75}`, `laps … ${hl.slice(-3).join(', ')}; R0 identical to recurrence: ${okHalf}`, okHalf);
}

// ======================= v0.1 claims: Echo jump and Conduction 1:1 =======================
{
  // Echo topology from the spec's link table, restitution and entry off, His ERP 250, no sinus (pure drive).
  const both = (id, a, b, d, dec) => ({ id, a, b, enabled: true, ab: { enabled: true, delayMs: d, decrement: dec ?? null }, ba: { enabled: true, delayMs: d, decrement: dec ?? null } });
  const one = (id, a, b, d) => ({ id, a, b, enabled: true, ab: D(d), ba: OFF(d) });
  const echo = { worldId: 'echo', nodes: [N('HRA', 230), N('CSp', 230), N('FP', 300), N('SP', 240), N('LCP', 250), N('H', 250), N('V', 250)],
    links: [both('HC', 'HRA', 'CSp', 30), both('CF', 'CSp', 'FP', 10), both('FL', 'FP', 'LCP', 30, { maxExtraMs: 30, tauMs: 100 }),
      both('CS', 'CSp', 'SP', 50), both('SL', 'SP', 'LCP', 160, { maxExtraMs: 60, tauMs: 120 }), one('LH', 'LCP', 'H', 40), one('HV', 'H', 'V', 35)] };
  // Hand: S2 >= 300 conducts over FP (FP recovered exactly at S2 + 10 when S2 = 300, so its decrement is the full 30 ms):
  // AH = 10 + 30 + 30 e^(-(S2-300)/100) + 40. S2 < 300 blocks in FP; the slow path gives
  // AH = 50 + 160 + 60 e^(-(S2+50-290)/120) + 40 (SP last captured at drive + 50, ERP 240).
  const handAh = s2 => s2 >= 300 ? 80 + ms(Math.round(30 * T * Math.exp(-(s2 - 300) / 100)))
    : 250 + ms(Math.round(60 * T * Math.exp(-(s2 + 50 - 290) / 120)));
  const engineAh = (s2, v11) => {
    const world = v11 ? { ...echo, contractVersion: '1.1.0' } : echo;
    const last = 200 + 600 * 7;
    const cmds = [...Array.from({ length: 8 }, (_, k) => stim(`s1-${k}`, 200 + 600 * k, 'CSp')), stim('s2', last + s2, 'CSp')];
    const { events } = run(world, cmds, last + s2 + 800, { keep: v11 });
    return r3(times(events, 'H').find(t => t > last + s2) - (last + s2));
  };
  const pts = [310, 300, 299, 296, 290];
  const hand = pts.map(handAh).map(r3);
  const eng = pts.map(s => engineAh(s, false));
  const eng11 = pts.map(s => engineAh(s, true));
  const jump = r3(hand[3] - hand[1]);
  row('Echo (v0.1 tuning): AH at S2 = 310, 300, 299, 296, 290 ms, drive 600', 'AH 110 at 300; 288 at 296 (+178)',
    `${hand.join(', ')}; jump 300→296 = ${jump}`, `1.0.0: ${eng.join(', ')}; 1.1.0: ${eng11.join(', ')}`,
    JSON.stringify(hand) === JSON.stringify(eng) && JSON.stringify(eng) === JSON.stringify(eng11) && hand[1] === 110 && near(hand[3], 288, 0.5) && near(jump, 178, 0.5));

  // Conduction world paced from A (sinus off): hand recurrence for H and V1/V2.
  const cond = { worldId: 'conduction', nodes: [N('A', 220), N('N', 250), N('H', 180), N('V1', 260), N('V2', 260)],
    links: [one('AN', 'A', 'N', 35), { id: 'NH', a: 'N', b: 'H', enabled: true, ab: D(65, { decrement: { maxExtraMs: 90, tauMs: 120 } }), ba: OFF(65) },
      one('HV1', 'H', 'V1', 25), one('HV2', 'H', 'V2', 45)] };
  const report = []; let allOk = true;
  for (let cl = 600; cl >= 280; cl -= 10) {
    const k = 60;
    // hand: every site conducts iff each arrival >= until; N recovery at departure = t_N - (prev t_N + 250)
    let nUntil = null; const st = { A: null, N: null, H: null, V1: null, V2: null }; const erp = { A: 220, N: 250, H: 180, V1: 260, V2: 260 };
    const hHand = []; let ok = true;
    for (let j = 0; j < k; j++) {
      const tA = (100 + j * cl) * T;
      if (st.A !== null && tA < st.A) { ok = false; continue; } st.A = tA + erp.A * T;
      const tN = tA + 35 * T; if (st.N !== null && tN < st.N) { ok = false; continue; }
      const prior = nUntil; st.N = tN + erp.N * T; nUntil = st.N;
      const tH = tN + 65 * T + (prior === null ? 0 : Math.round(90 * T * Math.exp(-Math.max(0, tN - prior) / (120 * T))));
      if (st.H !== null && tH < st.H) { ok = false; continue; } st.H = tH + erp.H * T; hHand.push(ms(tH));
      for (const [v, d] of [['V1', 25], ['V2', 45]]) { const tv = tH + d * T; if (st[v] !== null && tv < st[v]) ok = false; else st[v] = tv + erp[v] * T; }
    }
    const { events } = run(cond, Array.from({ length: k }, (_, j) => stim(`a${j}`, 100 + j * cl, 'A')), 100 + k * cl + 500, { keep: cl === 280 });
    const same = JSON.stringify(times(events, 'H')) === JSON.stringify(hHand) && times(events, 'V1').length === k && times(events, 'V2').length === k;
    if (!(ok && same && hHand.length === k)) allOk = false;
    if (cl % 80 === 40 || cl === 280) report.push(`${cl}:${hHand.length}/${k}`);
  }
  row('Conduction (v0.1) paced from A, 600 → 280 ms in 10 ms steps', '1:1 at every cycle', `1:1 by hand at every cycle (${report.join(' ')})`,
    `H and V times identical to hand at all 33 cycles: ${allOk}`, allOk);
}

// ======================= Maneuvers: Stillness and Slow =======================
{
  // Stillness: e rises 0→1 over 1500, holds 2000, falls over 6000; 100 ms steps from the command.
  const e = el => el <= 0 ? 0 : el <= 1500 ? el / 1500 : el <= 3500 ? 1 : el < 9500 ? 1 - (el - 3500) / 6000 : 0;
  const world = W11('still', [N('At', 200, { tissue: 'atrial' }), N('Nd', 300, { tissue: 'nodal' }), N('Pk', 330, { tissue: 'hisPurkinje' }),
    N('Sx', 150, { tissue: 'sinus', automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } })]);
  const t0 = 1000;
  const { events } = run(world, [{ commandId: 'ad', tMs: t0, type: 'applyAgent', agent: 'stillness', doseScale: 1 }], 12000);
  const pc = id => events.filter(x => x.type === 'parameter_changed' && x.nodeId === id).map(x => [x.tMs, x.value]);
  const expNd = []; const expAt = []; const expSx = [];
  let pn = 300; let pa = 200; let ps = 800;
  for (let k = 1; k <= 95; k++) {
    const lv = e(k * 100);
    const vn = 300 + ms(Math.round(600 * T * lv)); const va = ms(Math.round(200 * T * (1 - 0.2 * lv))); const vs = ms(Math.round(800 * T * (1 + 0.5 * lv)));
    if (vn !== pn) expNd.push([t0 + k * 100, vn]); if (va !== pa) expAt.push([t0 + k * 100, va]); if (vs !== ps) expSx.push([t0 + k * 100, vs]);
    pn = vn; pa = va; ps = vs;
  }
  const okN = JSON.stringify(pc('Nd')) === JSON.stringify(expNd);
  const okA = JSON.stringify(pc('At')) === JSON.stringify(expAt);
  const okS = JSON.stringify(pc('Sx')) === JSON.stringify(expSx);
  const okP = pc('Pk').length === 0;
  // Sinus beats are scheduled with cycle x (1 + 0.5 e(t)) at the scheduling instant.
  const sx = times(events, 'Sx');
  const sOk = sx.every((t, i) => i === 0 || near(t - sx[i - 1], ms(Math.round(800 * T * (1 + 0.5 * e(Math.floor((sx[i - 1] - t0) / 100) * 100)))), 1e-9));
  row('Stillness (dose 1): nodal ERP + 600e, atrial ERP x (1 - 0.2e), sinus cycle x (1 + 0.5e), 100 ms steps',
    'spec Maneuvers: envelope 1500 / 2000 / 6000 ms', `peak nodal 900, atrial 160, sinus 1200; His untouched`,
    `nodal ${okN}, atrial ${okA}, sinus ${okS}, His none ${okP}, sinus beats on law ${sOk}; peak ${Math.max(...pc('Nd').map(x => x[1]))}`,
    okN && okA && okS && okP && sOk);

  // Slow: delay x (1 + 0.3 dose (1 + max(0, (400 - CL)/400))) on non-nodal links, ramp over 3000 ms.
  const sw = W11('slow', [N('P', 150), N('Q', 100), N('Nd', 100, { tissue: 'nodal' })], [L('PQ', 'P', 'Q', D(80)), L('PN', 'P', 'Nd', D(80))]);
  const cmds = [{ commandId: 'ic', tMs: 0, type: 'applyAgent', agent: 'slow', doseScale: 1.5 }, stim('a', 1500, 'P'), stim('b', 4000, 'P'), stim('c', 4300, 'P'), stim('d', 5000, 'P')];
  const s = run(sw, cmds, 6000);
  const launches = s.events.filter(x => x.type === 'conduction_launched');
  const pq = launches.filter(x => x.linkId === 'PQ').map(x => r3(x.arrivalMs - x.departureMs));
  const pn2 = launches.filter(x => x.linkId === 'PN').map(x => r3(x.arrivalMs - x.departureMs));
  const lev = t => Math.min(30, Math.floor(t / 100)) / 30 * 1.5;
  const hand = [[1500, null], [4000, 2500], [4300, 300], [5000, 700]].map(([t, cl]) =>
    ms(80 * T + Math.round(80 * T * 0.3 * lev(t) * (1 + (cl === null ? 0 : Math.max(0, (400 - cl) / 400))))));
  row('Slow the current (dose 1.5): non-nodal delay x (1 + 0.3 dose (1 + max(0,(400-CL)/400)))', 'spec Maneuvers', `PQ ${hand.join(', ')}; nodal PN 80`,
    `PQ ${pq.join(', ')}; PN ${[...new Set(pn2)].join(', ')}`, JSON.stringify(pq) === JSON.stringify(hand) && pn2.every(x => x === 80));
}

// ======================= event schema validation of everything emitted above =======================
{
  const scratch = join(here, '.g1-tmp'); mkdirSync(scratch, { recursive: true });
  const file = join(scratch, 'events.json');
  writeFileSync(file, JSON.stringify(allEvents));
  try {
    const out = execFileSync('python3', ['-I', '-c', `
import json, sys
from jsonschema import Draft7Validator
v = Draft7Validator(json.load(open(sys.argv[1])))
ev = json.load(open(sys.argv[2]))
bad = [e for e in ev if not v.is_valid(e)]
print(len(ev), len(bad), sorted({e['type'] for e in ev}))
`, join(root, 'contracts', 'event.v1_1.schema.json'), file]).toString().trim();
    const [n, bad] = out.split(' ');
    row('event.v1_1 schema validates every event emitted by this script', 'all valid', `${n} events`, out, bad === '0');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

if (process.argv.includes('--json')) console.log(JSON.stringify(table, null, 1));
else {
  for (const r of table) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}${r.info ? ' (info)' : ''}  ${r.oracle}\n   spec:        ${r.spec}\n   independent: ${r.independent}\n   engine:      ${r.engine}${r.note ? `\n   note:        ${r.note}` : ''}`);
  }
}
