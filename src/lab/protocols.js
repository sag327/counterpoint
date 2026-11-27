// Lab protocol runner (ticket 14e). Every step builds a fresh Engine from the
// world parameters it is given, never from live state, with a fixed run ID, so
// results are deterministic and a shared performance reproduces its plots.
//
// runProtocolSync(world, protocol, options) -> result
// runProtocol(world, protocol, options)     -> Promise<result>, yields between steps
// protocolCsv(result)                       -> CSV text
//
// A result is { protocol, worldId, columns, rows, summary, text }. Rows hold
// plain numbers, strings, booleans and null only, so they survive
// structuredClone (Worker) and JSON (performance files).

import { Engine } from '../engine/index.js';
import {
  activationOrder, activationTimes, conductionPattern, descendantsOf, descendantActivations, detectJumps,
  effectiveRefractoryPeriod, entrainmentResult, firstDescendant, functionalRefractoryPeriod, lockingRatio, median,
  round3, simpleFraction, stimulusAttempts, tachycardiaCycle, wenckebachCycle, intervals,
} from './measure.js';

const V11_WORLD_KEYS = ['contractVersion', 'coupling', 'autonomic', 'limits'];
const V11_NODE_KEYS = ['tissue', 'audible', 'restitution'];
const TRAIN_MIN_CYCLE = 150;
const TRAIN_MAX_COUNT = 64;
const CHUNK_MS = 1000;

// Mirrors readWorld: a world is 1.1.0 when it declares so or carries any 1.1.0 field.
export function isV11World(world) {
  if (V11_WORLD_KEYS.some(key => Object.hasOwn(world, key))) return true;
  for (const node of world.nodes) {
    if (V11_NODE_KEYS.some(key => Object.hasOwn(node, key))) return true;
    if (node.automaticity && ('overdrive' in node.automaticity || 'protected' in node.automaticity)) return true;
  }
  return world.links.some(link => 'entry' in link.ab || 'entry' in link.ba);
}

export function rangeValues({ fromMs, toMs, stepMs }) {
  if (!(stepMs > 0)) throw new RangeError('Range step must be positive');
  const values = [];
  const down = fromMs > toMs;
  const count = Math.floor(Math.abs(toMs - fromMs) / stepMs + 1e-9);
  for (let index = 0; index <= count; index++) values.push(round3(down ? fromMs - index * stepMs : fromMs + index * stepMs));
  return values;
}

// Pacing commands. On 1.1.0 worlds a train is one stimulateTrain (pulse k has
// triggerId `${id}#k`). Otherwise, or outside train limits, single stimuli
// carry the same IDs, so analysis code never needs to know which was used.
export function pacingCommands(world, { id, nodeId, startMs, cycleMs, count, label = id }, useTrain = isV11World(world)) {
  if (useTrain && cycleMs >= TRAIN_MIN_CYCLE && count >= 1 && count <= TRAIN_MAX_COUNT) {
    return [{ commandId: id, tMs: startMs, type: 'stimulateTrain', nodeId, startMs, cycleMs, count, label: String(label).slice(0, 120) }];
  }
  return Array.from({ length: count }, (_, k) => ({ commandId: `${id}#${k + 1}`, tMs: round3(startMs + k * cycleMs), type: 'stimulate', nodeId }));
}

// One deterministic engine run. Commands omit runId. Advancing in chunks keeps
// each advance under the engine's processing budget; a fault ends the run and
// is reported on the row, never thrown.
export function simulate(world, commands, untilMs, { runId = 'lab', engineOptions = {} } = {}) {
  const engine = new Engine(engineOptions);
  engine.reset(world, runId);
  for (const command of [...commands].sort((a, b) => a.tMs - b.tMs)) engine.enqueue({ runId, ...command });
  const events = [];
  let fault = null;
  for (let t = Math.min(CHUNK_MS, untilMs); ; t = Math.min(t + CHUNK_MS, untilMs)) {
    try {
      for (const event of engine.advanceTo(t)) events.push(event);
    } catch (error) {
      if (error?.events) for (const event of error.events) events.push(event);
      fault = error?.code ?? 'SIMULATION_FAULT';
      break;
    }
    if (t >= untilMs) break;
  }
  return { events, fault };
}

function rootOf(events, triggerId) {
  return events.find(event => event.type === 'stimulus_attempted' && event.triggerId === triggerId) ?? null;
}

function outcome(event) {
  if (event === null) return null;
  return event.type === 'activation' ? 'captured' : 'blocked';
}

function lastPulseTime(events, id) {
  const pulses = stimulusAttempts(events, id);
  return pulses.length === 0 ? null : pulses[pulses.length - 1].tMs;
}

// ---------------------------------------------------------------------------
// S1–S2 (and S3)

const s1s2 = {
  columns(p) {
    const base = ['s2Ms'];
    if (p.s3 !== undefined) base.push('s3Ms');
    return [...base, 'captured', 'a1h1Ms', 'a2h2Ms', 'h1h2Ms', 'v1v2Ms', 'echoes', 'sustained', ...p.erpSites.map(id => `site:${id}`), 'fault'];
  },
  normalize(world, p) {
    const sites = { atrium: p.siteId, ...(p.sites ?? {}) };
    return {
      startMs: 200, driveCount: 8, tailMs: 1500, labels: {}, ...p,
      sites,
      erpSites: p.erpSites ?? world.nodes.map(node => node.id).filter(id => id !== sites.sinus),
    };
  },
  steps(world, p) {
    const scanS3 = p.s3 !== undefined && typeof p.s3 === 'object';
    const values = rangeValues(scanS3 ? p.s3 : p.s2);
    return values.map(value => (scanS3 ? { s2Ms: p.s2, s3Ms: value } : { s2Ms: value, s3Ms: p.s3 ?? null }));
  },
  run(world, p, step, index, engineOptions) {
    const lastS1 = p.startMs + p.driveCycleMs * (p.driveCount - 1);
    const s2At = round3(lastS1 + step.s2Ms);
    const commands = [
      ...pacingCommands(world, { id: 'S1', nodeId: p.siteId, startMs: p.startMs, cycleMs: p.driveCycleMs, count: p.driveCount, label: 'S1 drive' }),
      { commandId: 'S2', tMs: s2At, type: 'stimulate', nodeId: p.siteId },
    ];
    let lastAt = s2At;
    if (step.s3Ms !== null) {
      lastAt = round3(s2At + step.s3Ms);
      commands.push({ commandId: 'S3', tMs: lastAt, type: 'stimulate', nodeId: p.siteId });
    }
    const horizon = round3(lastAt + p.tailMs);
    const { events, fault } = simulate(world, commands, horizon, { runId: `lab-s1s2-${index}`, engineOptions });
    const r1 = rootOf(events, `S1#${p.driveCount}`);
    const rTest = rootOf(events, step.s3Ms === null ? 'S2' : 'S3');
    const rPrev = step.s3Ms === null ? r1 : rootOf(events, 'S2');
    const dPrev = descendantsOf(events, rPrev ? [rPrev.eventId] : []);
    const dTest = descendantsOf(events, rTest ? [rTest.eventId] : []);
    const { atrium, his, ventricle } = p.sites;
    const first = (set, id) => (id ? firstDescendant(events, set, id, ['activation']) : null);
    const a1 = first(dPrev, atrium);
    const a2 = first(dTest, atrium);
    const h1 = first(dPrev, his);
    const h2 = first(dTest, his);
    const v1 = first(dPrev, ventricle);
    const v2 = first(dTest, ventricle);
    const echoes = a2 === null ? [] : descendantActivations(events, dTest, atrium).filter(event => event !== a2 && event.tMs > a2.tMs);
    const echoCycle = median(intervals(echoes.map(event => event.tMs)));
    const lastEcho = echoes.length === 0 ? null : echoes[echoes.length - 1].tMs;
    const row = { s2Ms: step.s2Ms };
    if (p.s3 !== undefined) row.s3Ms = step.s3Ms;
    Object.assign(row, {
      captured: a2 !== null,
      a1h1Ms: a1 && h1 ? round3(h1.tMs - a1.tMs) : null,
      a2h2Ms: a2 && h2 ? round3(h2.tMs - a2.tMs) : null,
      h1h2Ms: h1 && h2 ? round3(h2.tMs - h1.tMs) : null,
      v1v2Ms: v1 && v2 ? round3(v2.tMs - v1.tMs) : null,
      echoes: echoes.length,
      sustained: echoes.length >= 3 && echoCycle !== null && lastEcho >= horizon - 2 * echoCycle,
    });
    for (const id of p.erpSites) row[`site:${id}`] = outcome(firstDescendant(events, dTest, id));
    row.fault = fault;
    return row;
  },
  summarize(world, p, rows) {
    const coupling = p.s3 !== undefined && typeof p.s3 === 'object' ? 's3Ms' : 's2Ms';
    const erps = {};
    for (const id of p.erpSites) {
      // ERP of a site: the longest coupling at which the wave reached it and was refused.
      const points = rows.filter(row => row[`site:${id}`] !== null).map(row => ({ couplingMs: row[coupling], ok: row[`site:${id}`] === 'captured' }));
      const erp = effectiveRefractoryPeriod(points);
      if (erp !== null) erps[id] = { ...erp, label: p.labels[id] ?? id };
    }
    const conduction = effectiveRefractoryPeriod(rows.filter(row => row.captured).map(row => ({ couplingMs: row[coupling], ok: row.a2h2Ms !== null })));
    const frp = functionalRefractoryPeriod(rows.map(row => ({ couplingMs: row[coupling], outputMs: row.h1h2Ms })));
    const jumps = detectJumps(rows.map(row => ({ couplingMs: row[coupling], valueMs: row.a2h2Ms })), p.jump ?? {});
    const echoWindow = rows.filter(row => row.echoes > 0).map(row => row[coupling]);
    const sustainedAt = rows.filter(row => row.sustained).map(row => row[coupling]);
    return {
      erps,
      conductionErp: conduction === null ? null : { ...conduction, label: `${p.labels[p.sites.atrium] ?? p.sites.atrium} to ${p.labels[p.sites.his] ?? p.sites.his}` },
      frp,
      jump: jumps[0] ?? null,
      jumps,
      echoCouplingsMs: echoWindow,
      sustainedCouplingsMs: sustainedAt,
    };
  },
  text(p, s) {
    const parts = [];
    if (s.jump) parts.push(`Jump of ${Math.round(s.jump.jumpMs)} ms at ${s.jump.couplingMs} ms`);
    else parts.push('No jump');
    for (const [id, erp] of Object.entries(s.erps)) parts.push(`${erp.label} ERP ${erp.erpMs} ms`);
    return `${parts.join('; ')}.`;
  },
};

// ---------------------------------------------------------------------------
// Incremental pacing

const incremental = {
  columns() {
    return ['cycleMs', 'inputs', 'outputs', 'ratio', 'kind', 'firstMs', 'lastMs', 'steadyMs', 'sequenceMs', 'fault'];
  },
  normalize(world, p) {
    return { startMs: 200, beats: 24, tailMs: 1000, ...p };
  },
  steps(world, p) {
    return rangeValues(p.cycles).map(cycleMs => ({ cycleMs }));
  },
  run(world, p, { cycleMs }, index, engineOptions) {
    const commands = pacingCommands(world, { id: 'INC', nodeId: p.siteId, startMs: p.startMs, cycleMs, count: p.beats, label: 'incremental pacing' });
    const horizon = round3(p.startMs + cycleMs * (p.beats - 1) + p.tailMs);
    const { events, fault } = simulate(world, commands, horizon, { runId: `lab-inc-${index}`, engineOptions });
    const beats = [];
    for (const pulse of stimulusAttempts(events, 'INC')) {
      const set = descendantsOf(events, [pulse.eventId]);
      const input = firstDescendant(events, set, p.siteId, ['activation']);
      if (input === null || !input.causeIds.includes(pulse.eventId)) continue;
      const output = firstDescendant(events, set, p.outputId, ['activation']);
      beats.push({ conducted: output !== null, intervalMs: output === null ? null : round3(output.tMs - input.tMs) });
    }
    const pattern = conductionPattern(beats);
    const conducted = beats.filter(beat => beat.conducted).map(beat => beat.intervalMs);
    return {
      cycleMs,
      inputs: beats.length,
      outputs: pattern.outputs,
      ratio: pattern.ratio,
      kind: pattern.kind,
      firstMs: conducted[0] ?? null,
      lastMs: conducted[conducted.length - 1] ?? null,
      steadyMs: pattern.kind === '1:1' ? conducted[conducted.length - 1] ?? null : null,
      sequenceMs: beats.slice(-12).map(beat => (beat.conducted ? beat.intervalMs : 'x')).join(' '),
      fault,
    };
  },
  summarize(world, p, rows) {
    const wb = wenckebachCycle(rows.map(row => ({ cycleMs: row.cycleMs, pattern: row.ratio, kind: row.kind })));
    const firstWenckebach = rows.filter(row => row.kind === 'wenckebach').sort((a, b) => b.cycleMs - a.cycleMs)[0] ?? null;
    return { blockCycle: wb, wenckebachCycleMs: firstWenckebach?.cycleMs ?? null };
  },
  text(p, s) {
    if (s.blockCycle === null) return 'Conduction stayed 1:1 at every cycle.';
    return `Conduction first fails at ${s.blockCycle.cycleMs} ms (${s.blockCycle.pattern}${s.blockCycle.kind === 'wenckebach' ? ', Wenckebach' : ''}).`;
  },
};

// ---------------------------------------------------------------------------
// Burst

const burst = {
  columns() {
    return ['cycleMs', 'count', 'beatsAfter', 'cycleAfterMs', 'sustained', 'fault'];
  },
  normalize(world, p) {
    return { startMs: 200, tailMs: 6000, minBeats: 5, observeId: p.siteId, ...p };
  },
  steps(world, p) {
    return (p.cycles ?? [p.cycleMs]).map(cycleMs => ({ cycleMs }));
  },
  run(world, p, { cycleMs }, index, engineOptions) {
    const commands = pacingCommands(world, { id: 'BURST', nodeId: p.siteId, startMs: p.startMs, cycleMs, count: p.count, label: 'burst' });
    const lastStim = round3(p.startMs + cycleMs * (p.count - 1));
    const horizon = round3(lastStim + p.tailMs);
    const { events, fault } = simulate(world, commands, horizon, { runId: `lab-burst-${index}`, engineOptions });
    // Only beats caused by the burst count: a sinus rhythm that simply continues is not "sustained".
    const set = descendantsOf(events, stimulusAttempts(events, 'BURST').map(event => event.eventId));
    const after = descendantActivations(events, set, p.observeId).map(event => event.tMs).filter(time => time > lastStim + 0.0005);
    const cycle = median(intervals(after));
    const sustained = after.length >= p.minBeats && cycle !== null && after[after.length - 1] >= horizon - 2 * cycle;
    return { cycleMs, count: p.count, beatsAfter: after.length, cycleAfterMs: cycle === null ? null : round3(cycle), sustained, fault };
  },
  summarize(world, p, rows) {
    return { sustainedCyclesMs: rows.filter(row => row.sustained).map(row => row.cycleMs) };
  },
  text(p, s) {
    return s.sustainedCyclesMs.length > 0 ? `A rhythm sustained after the burst at ${s.sustainedCyclesMs.join(', ')} ms.` : 'No rhythm sustained after the burst.';
  },
};

// ---------------------------------------------------------------------------
// Circulating-rhythm baseline shared by resetting and entrainment

function baseline(world, p, engineOptions) {
  const horizon = p.settleMs + (p.baselineMs ?? 4000);
  return simulate(world, p.induction ?? [], horizon, { runId: 'lab-baseline', engineOptions });
}

function reference(events, siteId, settleMs) {
  const times = activationTimes(events, siteId);
  const refMs = times.find(time => time >= settleMs) ?? null;
  return { times, refMs, tclMs: refMs === null ? null : tachycardiaCycle(times, refMs, 5) };
}

// ---------------------------------------------------------------------------
// Resetting

const resetting = {
  columns() {
    return ['couplingMs', 'captured', 'returnMs', 'terminated', 'fault'];
  },
  normalize(world, p) {
    return { settleMs: 3000, recordId: p.siteId, ...p };
  },
  prepare(world, p, engineOptions) {
    const { events } = baseline(world, p, engineOptions);
    return reference(events, p.siteId, p.settleMs);
  },
  steps(world, p) {
    return rangeValues(p.couplings).map(couplingMs => ({ couplingMs }));
  },
  run(world, p, { couplingMs }, index, engineOptions, context) {
    if (context.refMs === null) return { couplingMs, captured: false, returnMs: null, terminated: null, fault: 'NO_RHYTHM' };
    const at = round3(context.refMs + couplingMs);
    const horizon = round3(at + 4 * context.tclMs + 200);
    const commands = [...(p.induction ?? []), { commandId: 'X', tMs: at, type: 'stimulate', nodeId: p.siteId }];
    const { events, fault } = simulate(world, commands, horizon, { runId: `lab-reset-${index}`, engineOptions });
    const root = rootOf(events, 'X');
    const captured = root !== null && events.some(event => event.type === 'activation' && event.nodeId === p.siteId && event.causeIds.includes(root.eventId));
    const times = activationTimes(events, p.recordId);
    const next = times.find(time => time > at + 0.0005);
    const late = times.filter(time => time > at + 3 * context.tclMs);
    return {
      couplingMs,
      captured,
      returnMs: next === undefined ? null : round3(next - at),
      terminated: late.length === 0,
      fault,
    };
  },
  summarize(world, p, rows, context) {
    const terminated = rows.filter(row => row.terminated).map(row => row.couplingMs);
    return {
      tclMs: context.tclMs,
      referenceMs: context.refMs,
      terminationWindowMs: terminated.length === 0 ? null : [Math.min(...terminated), Math.max(...terminated)],
    };
  },
  text(p, s) {
    const window = s.terminationWindowMs === null ? 'no termination' : `termination at ${s.terminationWindowMs[0]}–${s.terminationWindowMs[1]} ms`;
    return `Cycle ${s.tclMs} ms; ${window}.`;
  },
};

// ---------------------------------------------------------------------------
// Entrainment per candidate site

const entrainment = {
  columns() {
    return ['siteId', 'tclMs', 'pacingCycleMs', 'captured', 'sameOrder', 'ppiMs', 'ppiMinusTclMs', 'fault'];
  },
  normalize(world, p) {
    return { settleMs: 3000, offsetMs: 20, count: 12, circuitIds: null, ...p };
  },
  prepare(world, p, engineOptions) {
    const { events } = baseline(world, p, engineOptions);
    return { events };
  },
  steps(world, p) {
    return p.candidates.map(siteId => ({ siteId }));
  },
  run(world, p, { siteId }, index, engineOptions, context) {
    const { refMs, tclMs } = reference(context.events, siteId, p.settleMs);
    if (refMs === null || tclMs === null) {
      return { siteId, tclMs: null, pacingCycleMs: null, captured: false, sameOrder: null, ppiMs: null, ppiMinusTclMs: null, fault: 'NO_RHYTHM' };
    }
    const pacingCycleMs = round3(tclMs - p.offsetMs);
    const startMs = round3(refMs + pacingCycleMs);
    const commands = [...(p.induction ?? []), ...pacingCommands(world, { id: 'ENT', nodeId: siteId, startMs, cycleMs: pacingCycleMs, count: p.count, label: 'entrainment' })];
    const lastStim = round3(startMs + pacingCycleMs * (p.count - 1));
    const horizon = round3(lastStim + 3 * tclMs);
    const { events, fault } = simulate(world, commands, horizon, { runId: `lab-ent-${index}`, engineOptions });
    let orderBefore = null;
    let orderDuring = null;
    if (p.circuitIds) {
      orderBefore = activationOrder(context.events, p.circuitIds, refMs, tclMs);
      orderDuring = activationOrder(events, p.circuitIds, round3(lastStim - pacingCycleMs), pacingCycleMs);
    }
    const result = entrainmentResult({ times: activationTimes(events, siteId), pacingCycleMs, lastStimulusMs: lastPulseTime(events, 'ENT') ?? lastStim, tclMs, orderBefore, orderDuring });
    return { siteId, ...result, fault };
  },
  summarize(world, p, rows) {
    const near = rows.filter(row => row.captured && row.ppiMinusTclMs !== null && Math.abs(row.ppiMinusTclMs) <= 20).map(row => row.siteId);
    return { inCircuit: near };
  },
  text(p, s) {
    return s.inCircuit.length === 0 ? 'No site returned within 20 ms.' : `Returns within 20 ms at ${s.inCircuit.join(', ')}.`;
  },
};

// ---------------------------------------------------------------------------
// Coupling sweep (staircase)

const couplingSweep = {
  columns() {
    return ['amplitude', 'driverBeats', 'drivenBeats', 'ratio', 'fraction', 'locked', 'fault'];
  },
  normalize(world, p) {
    const coupling = (world.coupling ?? []).find(entry => entry.id === p.couplingId);
    if (coupling === undefined) throw new RangeError(`Unknown coupling ${p.couplingId}`);
    const driver = world.nodes.find(node => node.id === coupling.from);
    const cycle = driver.automaticity?.cycleMs ?? 1000;
    return { cycles: 420, warmupCycles: 20, maxDenominator: 8, driverId: coupling.from, drivenId: coupling.to, driverCycleMs: cycle, ...p };
  },
  steps(world, p) {
    const values = p.values ?? [];
    if (values.length === 0) {
      const count = Math.round((p.to - p.from) / p.step);
      for (let index = 0; index <= count; index++) values.push(Math.round((p.from + index * p.step) * 1e6) / 1e6);
    }
    return values.map(amplitude => ({ amplitude }));
  },
  run(world, p, { amplitude }, index, engineOptions) {
    const copy = structuredClone(world);
    copy.coupling.find(entry => entry.id === p.couplingId).amplitude = amplitude;
    const fromMs = p.warmupCycles * p.driverCycleMs;
    const toMs = fromMs + p.cycles * p.driverCycleMs;
    const { events, fault } = simulate(copy, [], toMs, { runId: `lab-sweep-${index}`, engineOptions });
    const lock = lockingRatio(events, p.driverId, p.drivenId, { fromMs, toMs, maxDenominator: p.maxDenominator });
    return { amplitude, driverBeats: lock.driverBeats, drivenBeats: lock.drivenBeats, ratio: lock.ratio === null ? null : round3(lock.ratio * 1000) / 1000, fraction: lock.fraction, locked: lock.locked, fault };
  },
  summarize(world, p, rows) {
    const plateaus = [];
    for (const row of rows) {
      const last = plateaus[plateaus.length - 1];
      if (row.fraction !== null && last && last.fraction === row.fraction && last.end === rows[rows.indexOf(row) - 1]?.amplitude) last.end = row.amplitude;
      else if (row.fraction !== null) plateaus.push({ fraction: row.fraction, start: row.amplitude, end: row.amplitude });
    }
    return { plateaus };
  },
  text(p, s) {
    const wide = s.plateaus.filter(plateau => plateau.end > plateau.start);
    if (wide.length === 0) return 'No locking plateau in the sweep.';
    return `Locking plateaus: ${wide.map(plateau => `${plateau.fraction} for a ${plateau.start}–${plateau.end}`).join(', ')}.`;
  },
};

export const PROTOCOLS = Object.freeze({ s1s2, incremental, burst, resetting, entrainment, couplingSweep });

// ---------------------------------------------------------------------------
// Runner

function* iterate(world, protocol, { engineOptions = {} } = {}) {
  const kind = PROTOCOLS[protocol.type];
  if (kind === undefined) throw new RangeError(`Unknown protocol ${protocol.type}`);
  const p = kind.normalize(world, protocol);
  const steps = kind.steps(world, p);
  const total = steps.length + (kind.prepare ? 1 : 0);
  let done = 0;
  let context = null;
  if (kind.prepare) {
    context = kind.prepare(world, p, engineOptions);
    yield { done: ++done, total };
  }
  const rows = [];
  for (const [index, step] of steps.entries()) {
    rows.push(kind.run(world, p, step, index, engineOptions, context));
    yield { done: ++done, total };
  }
  const summary = kind.summarize(world, p, rows, context);
  return Object.freeze({
    protocol: structuredClone(protocol),
    worldId: world.worldId,
    columns: kind.columns(p),
    rows,
    summary,
    text: kind.text(p, summary),
  });
}

export function runProtocolSync(world, protocol, { onProgress = null, engineOptions } = {}) {
  const iterator = iterate(world, protocol, { engineOptions });
  for (;;) {
    const { value, done } = iterator.next();
    if (done) return value;
    onProgress?.(value);
  }
}

const defaultYield = () => new Promise(resolve => setTimeout(resolve, 0));

// Chunked execution: yields to the event loop after sliceMs of work, so it can
// run on the main thread when no Worker is available. signal is an AbortSignal.
export function runProtocol(world, protocol, { onProgress = null, signal = null, sliceMs = 12, engineOptions, yieldFn = defaultYield, now = () => Date.now() } = {}) {
  return new Promise((resolve, reject) => {
    let iterator;
    try {
      iterator = iterate(world, protocol, { engineOptions });
    } catch (error) {
      reject(error);
      return;
    }
    const pump = () => {
      const start = now();
      try {
        for (;;) {
          if (signal?.aborted) {
            reject(new DOMException('Protocol cancelled', 'AbortError'));
            return;
          }
          const { value, done } = iterator.next();
          if (done) {
            resolve(value);
            return;
          }
          onProgress?.(value);
          if (now() - start >= sliceMs) break;
        }
      } catch (error) {
        reject(error);
        return;
      }
      yieldFn().then(pump);
    };
    pump();
  });
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function protocolCsv(result) {
  const lines = [result.columns.map(csvCell).join(',')];
  for (const row of result.rows) lines.push(result.columns.map(column => csvCell(row[column])).join(','));
  return `${lines.join('\n')}\n`;
}
