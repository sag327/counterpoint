// Lab measurements. Pure functions over engine event arrays (contract 1.0.0 or
// 1.1.0) and over protocol rows. Nothing here reads the engine or the clock.
//
// Times are milliseconds on the wire. Laws are evaluated in integer ticks
// with one Math.round, exactly as src/engine/laws.js does, so a dot produced by
// the engine and a point on a law line can be compared to within one tick.

export const TICK_MS = 0.001;
const TICKS = 1000;

const tick = ms => Math.round(ms * TICKS);
const fromTick = value => value / TICKS;

// ---------------------------------------------------------------------------
// Parameter laws in ms (mirrors of the contract 1.1.0 laws)

// §A. ERP after a diastolic interval; null DI (first capture) gives erpMax.
export function restitutionErp(law, diMs) {
  if (diMs === null || diMs === undefined) return law.erpMaxMs;
  const erp = Math.round(tick(law.erpMaxMs) - tick(law.amplitudeMs) * Math.exp(-tick(diMs) / tick(law.tauMs)));
  return fromTick(Math.min(tick(law.erpMaxMs), Math.max(tick(law.erpMinMs), erp)));
}

// Slope of the unclamped §A law, (A/τ)·e^(−DI/τ). Alternans needs slope > 1.
export function restitutionSlope(law, diMs) {
  return (law.amplitudeMs / law.tauMs) * Math.exp(-diMs / law.tauMs);
}

// v1.0 source decrement against recovery since the source's ERP ended.
export function decrementExtra(law, recoveryMs) {
  if (law === null || law === undefined) return 0;
  return fromTick(Math.round(tick(law.maxExtraMs) * Math.exp(-Math.max(0, tick(recoveryMs)) / tick(law.tauMs))));
}

// §B entry slowing against slack = nominal arrival − destination refractoryUntil (≥ 0).
export function entryExtra(law, slackMs) {
  if (law === null || law === undefined) return 0;
  return fromTick(Math.round(tick(law.maxExtraMs) * Math.exp(-tick(slackMs) / tick(law.tauMs))));
}

// §D phase-response law: Δ = T·a·sin 2πφ (before the t + 1 tick floor).
export function phaseShift(cycleMs, amplitude, phase) {
  return fromTick(Math.round(tick(cycleMs) * amplitude * Math.sin(2 * Math.PI * phase)));
}

// ---------------------------------------------------------------------------
// Small statistics

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function round3(value) {
  return value === null || value === undefined ? null : Math.round(value * TICKS) / TICKS;
}

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

// Nearest simple fraction p/q (q ≤ maxDenominator) within tolerance, else null.
export function simpleFraction(value, { maxDenominator = 8, tolerance = 0.002 } = {}) {
  if (!Number.isFinite(value) || value <= 0) return null;
  let best = null;
  for (let q = 1; q <= maxDenominator; q++) {
    const p = Math.round(value * q);
    if (p === 0) continue;
    const error = Math.abs(value - p / q);
    if (error <= tolerance && (best === null || error < best.error - 1e-12)) {
      const d = gcd(p, q);
      best = { p: p / d, q: q / d, error };
    }
  }
  return best === null ? null : { numerator: best.p, denominator: best.q, label: `${best.p}:${best.q}` };
}

// ---------------------------------------------------------------------------
// Event queries

export function activationsAt(events, nodeId) {
  return events.filter(event => event.type === 'activation' && event.nodeId === nodeId);
}

export function activationTimes(events, nodeId) {
  return activationsAt(events, nodeId).map(event => event.tMs);
}

export function intervals(times) {
  const result = [];
  for (let index = 1; index < times.length; index++) result.push(round3(times[index] - times[index - 1]));
  return result;
}

// Stimulus attempts whose triggerId equals id, or starts with `${id}#` for train pulses.
export function stimulusAttempts(events, id) {
  return events.filter(event => event.type === 'stimulus_attempted' &&
    (event.triggerId === id || event.triggerId.startsWith(`${id}#`)));
}

// Causal descendants of the given root event IDs, in one pass. Causes always
// precede their effects in emission order: activation and block → causeIds;
// launch → activationId; arrival → its launch through transitId.
export function descendantsOf(events, rootIds) {
  const set = new Set(rootIds);
  const launchByTransit = new Map();
  for (const event of events) {
    if (set.has(event.eventId)) {
      if (event.type === 'conduction_launched') launchByTransit.set(event.transitId, event.eventId);
      continue;
    }
    let parents = null;
    switch (event.type) {
      case 'activation':
      case 'activation_blocked': parents = event.causeIds; break;
      case 'conduction_launched':
        launchByTransit.set(event.transitId, event.eventId);
        parents = [event.activationId];
        break;
      case 'conduction_arrived': parents = [launchByTransit.get(event.transitId)]; break;
      default: parents = null;
    }
    if (parents !== null && parents.some(id => set.has(id))) set.add(event.eventId);
  }
  return set;
}

// First event of the given types at nodeId among a descendant set.
export function firstDescendant(events, set, nodeId, types = ['activation', 'activation_blocked']) {
  return events.find(event => set.has(event.eventId) && event.nodeId === nodeId && types.includes(event.type)) ?? null;
}

export function descendantActivations(events, set, nodeId) {
  return events.filter(event => set.has(event.eventId) && event.type === 'activation' && event.nodeId === nodeId);
}

// Conduction times between named sites ("AH", "HV" style): for each activation
// at fromNode, the first causally descended activation at toNode.
export function siteIntervals(events, fromNodeId, toNodeId) {
  const rows = [];
  for (const start of activationsAt(events, fromNodeId)) {
    const set = descendantsOf(events, [start.eventId]);
    const end = descendantActivations(events, set, toNodeId)[0] ?? null;
    rows.push({ fromMs: start.tMs, toMs: end?.tMs ?? null, intervalMs: end === null ? null : round3(end.tMs - start.tMs) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Refractory periods and jumps (rules from the spec, "Plot catalog")

// ERP: the longest coupling interval that fails. points: [{ couplingMs, ok }].
// resolutionMs is the gap to the next longer tested coupling, so the true
// threshold lies in [erpMs, erpMs + resolutionMs].
export function effectiveRefractoryPeriod(points) {
  const failing = points.filter(point => point.ok === false && Number.isFinite(point.couplingMs));
  if (failing.length === 0) return null;
  const erpMs = Math.max(...failing.map(point => point.couplingMs));
  const longer = points.filter(point => point.couplingMs > erpMs).map(point => point.couplingMs);
  const next = longer.length === 0 ? null : Math.min(...longer);
  return { erpMs, resolutionMs: next === null ? null : round3(next - erpMs), upperMs: next };
}

// FRP: the shortest output interval. points: [{ couplingMs, outputMs }].
export function functionalRefractoryPeriod(points) {
  const conducted = points.filter(point => Number.isFinite(point.outputMs));
  if (conducted.length === 0) return null;
  const best = conducted.reduce((a, b) => (b.outputMs < a.outputMs ? b : a));
  return { frpMs: best.outputMs, atCouplingMs: best.couplingMs };
}

// Jump: an increase of at least minJumpMs for a coupling at most maxStepMs shorter.
// points: [{ couplingMs, valueMs }] in any order. Returns every jump, longest coupling first.
export function detectJumps(points, { minJumpMs = 50, maxStepMs = 10 } = {}) {
  const sorted = points.filter(point => Number.isFinite(point.valueMs)).sort((a, b) => b.couplingMs - a.couplingMs);
  const jumps = [];
  for (let index = 1; index < sorted.length; index++) {
    const before = sorted[index - 1];
    const after = sorted[index];
    const step = before.couplingMs - after.couplingMs;
    const rise = after.valueMs - before.valueMs;
    if (step > 0 && step <= maxStepMs + 1e-9 && rise >= minJumpMs) {
      jumps.push({ fromCouplingMs: before.couplingMs, couplingMs: after.couplingMs, fromMs: before.valueMs, toMs: after.valueMs, jumpMs: round3(rise) });
    }
  }
  return jumps;
}

// ---------------------------------------------------------------------------
// Conduction ratios and Wenckebach periodicity

// Smallest period p (≤ maxPeriod) that repeats over the last `window` booleans.
export function repeatingPeriod(flags, { maxPeriod = 12, window = null } = {}) {
  const tail = window === null ? flags : flags.slice(-window);
  for (let period = 1; period <= maxPeriod && period * 2 <= tail.length; period++) {
    let periodic = true;
    for (let index = period; index < tail.length && periodic; index++) periodic = tail[index] === tail[index - period];
    if (periodic) return period;
  }
  return null;
}

// beats: [{ conducted, intervalMs }] per captured input, in order. Uses the
// second half of the sequence as steady state. kind is '1:1', 'wenckebach'
// (progressive prolongation before the dropped beat), 'fixed' (constant
// conduction with dropped beats, such as 2:1), 'none' or 'irregular'.
export function conductionPattern(beats, { maxPeriod = 12 } = {}) {
  const total = beats.length;
  if (total === 0) return { kind: 'none', ratio: null, period: null, inputs: 0, outputs: 0 };
  const outputs = beats.filter(beat => beat.conducted).length;
  const steady = beats.slice(Math.floor(total / 2));
  const flags = steady.map(beat => beat.conducted);
  if (flags.every(Boolean)) return { kind: '1:1', ratio: '1:1', period: 1, inputs: total, outputs };
  if (!flags.some(Boolean)) return { kind: 'none', ratio: `${steady.length}:0`, period: null, inputs: total, outputs };
  const period = repeatingPeriod(flags, { maxPeriod });
  if (period === null) return { kind: 'irregular', ratio: null, period: null, inputs: total, outputs };
  // Align one group so that it ends with its dropped beat.
  const lastDrop = flags.lastIndexOf(false);
  const group = steady.slice(lastDrop - period + 1, lastDrop + 1);
  const conducted = group.filter(beat => beat.conducted).length;
  const groupIntervals = group.filter(beat => beat.conducted).map(beat => beat.intervalMs);
  let prolonging = groupIntervals.length >= 2;
  for (let index = 1; index < groupIntervals.length; index++) {
    if (!(groupIntervals[index] > groupIntervals[index - 1] + TICK_MS / 2)) prolonging = false;
  }
  return {
    kind: prolonging ? 'wenckebach' : 'fixed',
    ratio: `${period}:${conducted}`,
    period,
    inputs: total,
    outputs,
    groupIntervalsMs: groupIntervals,
  };
}

// Wenckebach cycle: the longest drive cycle whose conduction is not 1:1,
// with the kind of the first non 1:1 pattern. rows: [{ cycleMs, pattern }].
export function wenckebachCycle(rows) {
  const blocked = rows.filter(row => row.pattern && row.pattern !== '1:1').sort((a, b) => b.cycleMs - a.cycleMs);
  if (blocked.length === 0) return null;
  return { cycleMs: blocked[0].cycleMs, pattern: blocked[0].pattern, kind: blocked[0].kind ?? null };
}

// ---------------------------------------------------------------------------
// Entrainment, cadence and locking

// TCL: median of the last n cycles that end at or before beforeMs.
export function tachycardiaCycle(times, beforeMs = Infinity, n = 5) {
  const before = times.filter(time => time <= beforeMs);
  const cycles = intervals(before).slice(-n);
  return cycles.length === 0 ? null : round3(median(cycles));
}

// PPI: from the last paced stimulus to the next activation at the paced site.
// The last stimulus captures in its own batch, so "next" is strictly later.
export function postPacingInterval(times, lastStimulusMs) {
  const next = times.find(time => time > lastStimulusMs + TICK_MS / 2);
  return next === undefined ? null : round3(next - lastStimulusMs);
}

// Capture: `cycles` consecutive cycles at the paced site equal to the pacing cycle (±1 tick).
export function pacedCapture(times, pacingCycleMs, lastStimulusMs, { cycles = 3, toleranceMs = TICK_MS } = {}) {
  const paced = times.filter(time => time <= lastStimulusMs + TICK_MS / 2);
  const last = intervals(paced).slice(-cycles);
  return last.length === cycles && last.every(cycle => Math.abs(cycle - pacingCycleMs) <= toleranceMs + 1e-9);
}

// Activation order of a set of sites within [fromMs, fromMs + cycleMs).
export function activationOrder(events, siteIds, fromMs, cycleMs) {
  const first = new Map();
  for (const event of events) {
    if (event.type !== 'activation' || !siteIds.includes(event.nodeId)) continue;
    if (event.tMs < fromMs - TICK_MS / 2 || event.tMs >= fromMs + cycleMs) continue;
    if (!first.has(event.nodeId)) first.set(event.nodeId, event.tMs);
  }
  return [...first].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([id]) => id);
}

// Two orders are the same circuit sequence if one is a rotation of the other.
export function sameCyclicOrder(a, b) {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const start = b.indexOf(a[0]);
  return start >= 0 && a.every((id, index) => b[(start + index) % b.length] === id);
}

export function entrainmentResult({ times, pacingCycleMs, lastStimulusMs, tclMs, orderBefore = null, orderDuring = null }) {
  const ppiMs = postPacingInterval(times, lastStimulusMs);
  const sameOrder = orderBefore === null || orderDuring === null ? null : sameCyclicOrder(orderBefore, orderDuring);
  const captured = pacedCapture(times, pacingCycleMs, lastStimulusMs) && sameOrder !== false;
  return {
    tclMs,
    pacingCycleMs,
    captured,
    sameOrder,
    ppiMs,
    ppiMinusTclMs: ppiMs === null || tclMs === null ? null : round3(ppiMs - tclMs),
  };
}

// The cadence after stopping ventricular pacing: chamber activations after the
// last paced ventricular beat, grouping same-chamber activations closer than
// groupMs into one note. chambers maps nodeId → 'A' | 'V'.
export function classifyCadence(events, { chambers, lastPacedMs, groupMs = 80, notes = 4 }) {
  const sequence = [];
  let last = null;
  for (const event of events) {
    if (event.type !== 'activation' || event.tMs < lastPacedMs - TICK_MS / 2) continue;
    const chamber = chambers[event.nodeId];
    if (chamber === undefined) continue;
    if (last !== null && last.chamber === chamber && event.tMs - last.tMs < groupMs) {
      last.tMs = event.tMs;
      continue;
    }
    last = { chamber, tMs: event.tMs, startMs: event.tMs };
    sequence.push(last);
    if (sequence.length >= notes) break;
  }
  const letters = sequence.map(note => note.chamber).join('');
  let cadence = 'other';
  if (letters.startsWith('VAAV')) cadence = 'VAAV';
  else if (letters.startsWith('VAV')) cadence = 'VAV';
  return { cadence, sequence: letters, timesMs: sequence.map(note => note.startMs) };
}

// Locking ratio: beats of the driven focus per beat of the driver in a window.
export function lockingRatio(events, driverId, drivenId, { fromMs = 0, toMs = Infinity, maxDenominator = 8 } = {}) {
  const inWindow = time => time >= fromMs && time < toMs;
  const driver = activationTimes(events, driverId).filter(inWindow).length;
  const driven = activationTimes(events, drivenId).filter(inWindow).length;
  const ratio = driver === 0 ? null : driven / driver;
  const fraction = ratio === null ? null : simpleFraction(ratio, { maxDenominator, tolerance: 1.5 / Math.max(driver, 1) });
  return { driverBeats: driver, drivenBeats: driven, ratio, fraction: fraction?.label ?? null, locked: fraction !== null };
}

// ---------------------------------------------------------------------------
// Engine dots for the model curves

// Every capture at a site: (DI, ERP). DI comes from diastolicIntervalMs on
// 1.1.0 runs and is reconstructed from the previous capture on 1.0.0 runs.
export function restitutionDots(events, nodeId) {
  const dots = [];
  let priorUntil = null;
  for (const event of events) {
    if (event.type !== 'activation' || event.nodeId !== nodeId) continue;
    const di = event.diastolicIntervalMs !== undefined
      ? event.diastolicIntervalMs
      : (priorUntil === null ? null : round3(event.tMs - priorUntil));
    priorUntil = event.refractoryUntilMs;
    if (di !== null) dots.push({ tMs: event.tMs, diMs: di, erpMs: event.erpMs, eventId: event.eventId });
  }
  return dots;
}

export function erpSequence(events, nodeId) {
  return activationsAt(events, nodeId).map(event => event.erpMs);
}

// Every launch on a link (optionally one direction). recoveryMs is departure −
// the source's previous refractoryUntil (the decrement argument). slackMs is
// nominal arrival − destination refractoryUntil after the batch's outcomes
// (the entry argument), null when the destination had not recovered or was
// never activated. Parts are present on 1.1.0 runs only.
export function conductionDots(events, linkId, direction = null) {
  const until = new Map();
  const priorUntil = new Map();
  const dots = [];
  for (const event of events) {
    if (event.type === 'activation') {
      priorUntil.set(event.eventId, until.has(event.nodeId) ? until.get(event.nodeId) : null);
      until.set(event.nodeId, event.refractoryUntilMs);
      continue;
    }
    if (event.type !== 'conduction_launched' || event.linkId !== linkId) continue;
    const sourceUntil = priorUntil.get(event.activationId) ?? null;
    const recoveryMs = sourceUntil === null ? null : round3(Math.max(0, event.departureMs - sourceUntil));
    const totalMs = round3(event.arrivalMs - event.departureMs);
    const parts = event.delayParts ?? null;
    let slackMs = null;
    if (parts !== null) {
      const nominal = event.departureMs + parts.baseMs + parts.lesionMs + parts.agentMs + parts.sourceMs;
      const destUntil = until.get(event.toNodeId);
      if (destUntil !== undefined && nominal >= destUntil - TICK_MS / 2) slackMs = round3(nominal - destUntil);
    }
    dots.push({
      tMs: event.departureMs,
      fromNodeId: event.fromNodeId,
      toNodeId: event.toNodeId,
      recoveryMs,
      slackMs,
      totalMs,
      parts,
      eventId: event.eventId,
    });
  }
  // direction: null for both, or the source node ID of the wanted direction.
  return direction === null ? dots : dots.filter(dot => dot.fromNodeId === direction);
}

// Pairs (interval n, interval n+1) for a return (Poincaré) plot.
export function returnPairs(values) {
  const pairs = [];
  for (let index = 1; index < values.length; index++) pairs.push([values[index - 1], values[index]]);
  return pairs;
}

// Every phase_modulated event of a focus as (phase, shift).
export function phaseDots(events, nodeId = null) {
  return events
    .filter(event => event.type === 'phase_modulated' && (nodeId === null || event.nodeId === nodeId))
    .map(event => ({ tMs: event.tMs, phase: event.phase, shiftMs: event.shiftMs, couplingId: event.couplingId }));
}
