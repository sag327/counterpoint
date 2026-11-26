import { Agenda } from './agenda.js';
import { History, recoveryAt } from './history.js';
import { readCommand, readWorld, requireId } from './input.js';
import {
  AGENT_STEP, LESION_STEP, SLOW_RAMP, STILLNESS_ATRIAL_ERP, STILLNESS_END, STILLNESS_NODAL_ERP, STILLNESS_SINUS_CYCLE,
  TONE_CYCLE, TONE_DECREMENT, agentCycle, agentErp, breathFactor, decrementExtra, entryExtra, lesionDelay, phaseShift,
  restedErp, restitutionErp, slowExtra, stillnessEnvelope,
} from './laws.js';
import { addTicks, clampUnit, toMs, toTick } from './time.js';

const EDIT = 0;
const COLLISION = 1;
const STIMULUS = 2;
const AUTOMATIC = 3;
const ARRIVAL = 4;
const EMPTY_EVENTS = Object.freeze([]);

function byId(a, b) {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

class ProcessingBudgetError extends Error {}

export class SimulationFault extends Error {
  constructor(cause, tick, committed, events) {
    super(`Simulation stopped at ${toMs(tick)} ms. ${cause.message}`, { cause });
    this.name = 'SimulationFault';
    this.code = cause instanceof ProcessingBudgetError ? 'PROCESSING_BUDGET' : 'SIMULATION_FAULT';
    this.tMs = toMs(tick);
    this.committedThroughMs = toMs(committed);
    this.events = Object.freeze(events);
  }
}

function charge(batch) {
  if (--batch.budget.remaining < 0) throw new ProcessingBudgetError('Processing budget exhausted. Reset the run to continue.');
}

function emit(run, batch, type, payload) {
  charge(batch);
  const seq = ++run.eventSeq;
  const event = Object.freeze({
    runId: run.id,
    worldId: run.worldId,
    seq,
    eventId: `e${seq}`,
    tMs: toMs(batch.tick),
    type,
    ...payload,
  });
  batch.events.push(event);
  return event;
}

// Contract 1.1.0 annotations are added only to 1.1.0 runs, so 1.0.0 traces stay byte-identical.
function withCause(run, payload, cause) {
  return run.v11 ? { ...payload, cause } : payload;
}

function scheduleAutomatic(run, node, tick) {
  const token = {};
  node.auto.token = token;
  node.auto.next = tick;
  run.agenda.push({ tick, phase: AUTOMATIC, order: node.order, node, token });
}

// §C: sinus foci follow tone, Stillness and breath at scheduling time.
function effectiveCycle(run, node, tick) {
  const cycle = node.auto.cycle;
  if (!run.v11 || node.tissue !== 'sinus') return cycle;
  let factor = node.agentCycleScale;
  if (run.tone !== 0) factor *= 1 + TONE_CYCLE * run.tone;
  if (run.autonomic?.sinus) factor *= breathFactor(run.autonomic, tick);
  return factor === 1 ? cycle : Math.round(cycle * factor);
}

// The phase origin is the instant the pending cycle started. Suppression is 0 without overdrive.
function planNextAutomatic(run, node, tick) {
  node.auto.origin = tick;
  return addTicks(tick, effectiveCycle(run, node, tick) + node.auto.suppression);
}

function scheduleNextAutomatic(run, node, tick) {
  scheduleAutomatic(run, node, planNextAutomatic(run, node, tick));
}

function removeTransit(batch, transit) {
  transit.link.active.delete(transit.ordinal);
  batch.transits.set(transit.event.transitId, null);
}

function transitPosition(transit, tick) {
  const progress = clampUnit((tick - transit.departure) / (transit.arrival - transit.departure));
  return transit.direction === 'ab' ? progress : 1 - progress;
}

function parameterChanged(run, batch, parameter, commandId, generation, targetRef, previous, value, cause) {
  emit(run, batch, 'parameter_changed', withCause(run, { parameter, commandId, generation, ...targetRef, previous, value }, cause));
}

function changeLinkEnabled(run, batch, link, value, commandId, cause) {
  if (link.enabled === value) return;
  const previous = link.enabled;
  link.enabled = value;
  const generation = ++link.generation;
  batch.links.add(link);
  emit(run, batch, 'link_changed', withCause(run, { linkId: link.id, previous, value, generation, commandId }, cause));
  if (!value) {
    link.collision = null;
    for (const transit of link.active.values()) {
      emit(run, batch, 'conduction_canceled', {
        linkId: link.id,
        transitId: transit.event.transitId,
        cause: cause === 'lesion' ? 'lesion' : 'cut',
        position: transitPosition(transit, batch.tick),
      });
      removeTransit(batch, transit);
    }
  }
}

const lawMs = law => law === null ? null : Object.freeze({
  erpMaxMs: toMs(law.erpMax), amplitudeMs: toMs(law.amplitude), tauMs: toMs(law.tau), erpMinMs: toMs(law.erpMin),
});
const extraMs = law => law === null ? null : Object.freeze({ maxExtraMs: toMs(law.maxExtra), tauMs: toMs(law.tau) });
const sameLaw = (a, b) => a !== null && Object.keys(b).every(key => a[key] === b[key]);

// Under restitution, setNodeERP moves erpMax and shifts erpMin by the same amount (§A).
function editErp(run, batch, { target: node, value, commandId }) {
  if (node.erp === value) return;
  const previous = restedErp(node);
  const law = node.restitution;
  if (law !== null) {
    law.erpMin = Math.max(1000, law.erpMin + value - law.erpMax);
    law.erpMax = value;
  }
  node.erp = value;
  batch.nodes.add(node);
  parameterChanged(run, batch, 'erpMs', commandId, ++node.erpGeneration, { nodeId: node.id },
    toMs(previous), toMs(restedErp(node)), 'command');
}

function editDelay(run, batch, { target: link, direction, value, commandId }) {
  const settings = link[direction];
  if (settings.delay === value) return;
  const progress = link.lesion?.progress ?? 0;
  const previous = lesionDelay(settings.delay, progress);
  settings.delay = value;
  batch.links.add(link);
  parameterChanged(run, batch, 'delayMs', commandId, ++settings.generation, { linkId: link.id, direction },
    toMs(previous), toMs(lesionDelay(value, progress)), 'command');
}

function editCycle(run, batch, { target: node, value, commandId }) {
  const auto = node.auto;
  if (auto.cycle === value) return;
  const previous = agentCycle(node, auto.cycle);
  auto.cycle = value;
  auto.token = null;
  const generation = ++node.cycleGeneration;
  if (value !== null) scheduleNextAutomatic(run, node, batch.tick);
  parameterChanged(run, batch, 'cycleMs', commandId, generation, { nodeId: node.id },
    toMs(previous), toMs(agentCycle(node, value)), 'command');
}

function editRestitution(run, batch, { target: node, value, commandId }) {
  const previous = node.restitution;
  if (sameLaw(previous, value)) return;
  node.restitution = { ...value };
  node.erp = value.erpMax;
  batch.nodes.add(node);
  parameterChanged(run, batch, 'restitution', commandId, ++node.restitutionGeneration, { nodeId: node.id },
    lawMs(previous), lawMs(node.restitution), 'command');
}

function editExtraLaw(run, batch, { target: link, direction, value, commandId, type }) {
  const key = type === 'setDecrement' ? 'decrement' : 'entry';
  const settings = link[direction];
  const previous = settings[key];
  if (sameLaw(previous, value)) return;
  settings[key] = { ...value };
  batch.links.add(link);
  const generation = key === 'decrement' ? ++settings.decrementGeneration : ++settings.entryGeneration;
  parameterChanged(run, batch, key, commandId, generation, { linkId: link.id, direction },
    extraMs(previous), extraMs(value), 'command');
}

function editCoupling(run, batch, { target: coupling, value, commandId }) {
  if (coupling.amplitude === value) return;
  const previous = coupling.amplitude;
  coupling.amplitude = value;
  parameterChanged(run, batch, 'coupling', commandId, ++coupling.generation, { couplingId: coupling.id }, previous, value, 'command');
}

function editTone(run, batch, { value, commandId }) {
  if (run.tone === value) return;
  const previous = run.tone;
  run.tone = value;
  parameterChanged(run, batch, 'tone', commandId, ++run.toneGeneration, {}, previous, value, 'command');
}

// §F. A lesion advances from its current progress to the commanded completeness.
function scheduleLesionStep(run, plan) {
  plan.step++;
  const elapsed = Math.min(plan.step * LESION_STEP, plan.duration);
  run.agenda.push({ tick: addTicks(plan.start, elapsed), phase: EDIT, order: plan.order, type: 'lesionStep', plan, elapsed });
}

// A lesion never shrinks: a pass at or below the current target is a no-op.
function startLesion(run, batch, { target: link, value: { duration, completeness }, commandId, order }) {
  if (completeness <= (link.lesion?.completeness ?? 0)) return;
  const progress = link.lesion?.progress ?? 0;
  const plan = { link, commandId, order, start: batch.tick, duration, from: progress, to: completeness, step: 0 };
  link.lesion = { progress, completeness, plan };
  batch.links.add(link);
  scheduleLesionStep(run, plan);
}

function stepLesion(run, batch, { plan, elapsed }) {
  const { link } = plan;
  const lesion = link.lesion;
  if (lesion.plan !== plan) return;
  const before = lesion.progress;
  const progress = elapsed === plan.duration ? plan.to : plan.from + (plan.to - plan.from) * elapsed / plan.duration;
  lesion.progress = progress;
  batch.links.add(link);
  for (const direction of ['ab', 'ba']) {
    const settings = link[direction];
    const previous = lesionDelay(settings.delay, before);
    const value = lesionDelay(settings.delay, progress);
    if (previous !== value) {
      parameterChanged(run, batch, 'delayMs', plan.commandId, ++settings.generation, { linkId: link.id, direction },
        toMs(previous), toMs(value), 'lesion');
    }
  }
  emit(run, batch, 'lesion_changed', { linkId: link.id, progress, completeness: plan.to });
  if (elapsed < plan.duration) {
    scheduleLesionStep(run, plan);
    return;
  }
  lesion.plan = null;
  if (plan.to === 1) changeLinkEnabled(run, batch, link, false, plan.commandId, 'lesion');
}

function scheduleAgentStep(run, plan, type) {
  plan.step++;
  run.agenda.push({ tick: addTicks(plan.start, plan.step * AGENT_STEP), phase: EDIT, order: plan.order, type, plan });
}

function startAgent(run, batch, { value: { agent, dose }, commandId, order }) {
  if (agent === 'stillness') {
    const plan = { start: batch.tick, dose, commandId, order, step: 0 };
    run.stillness.push(plan);
    scheduleAgentStep(run, plan, 'stillnessStep');
  } else {
    run.slowRamp = { start: batch.tick, from: run.slowLevel, to: dose, commandId, order, step: 0 };
    scheduleAgentStep(run, run.slowRamp, 'slowStep');
  }
}

function setErpModifier(run, batch, node, add, scale, commandId) {
  const previous = restedErp(node);
  node.agentErpAdd = add;
  node.agentErpScale = scale;
  const value = restedErp(node);
  if (previous === value) return;
  batch.nodes.add(node);
  parameterChanged(run, batch, 'erpMs', commandId, ++node.erpGeneration, { nodeId: node.id }, toMs(previous), toMs(value), 'agent');
}

function setCycleModifier(run, batch, node, scale, commandId) {
  const previous = agentCycle(node, node.auto.cycle);
  node.agentCycleScale = scale;
  const value = agentCycle(node, node.auto.cycle);
  if (previous === value) return;
  parameterChanged(run, batch, 'cycleMs', commandId, ++node.cycleGeneration, { nodeId: node.id }, toMs(previous), toMs(value), 'agent');
}

// Stillness: the strongest active envelope sets e(t) for every site, in node ID order.
function stepStillness(run, batch, { plan }) {
  const ended = plan.step * AGENT_STEP >= STILLNESS_END;
  if (ended) run.stillness.splice(run.stillness.indexOf(plan), 1);
  let level = 0;
  for (const active of run.stillness) level = Math.max(level, active.dose * stillnessEnvelope(batch.tick - active.start));
  for (const node of run.nodes.values()) {
    if (node.tissue === 'nodal') setErpModifier(run, batch, node, Math.round(STILLNESS_NODAL_ERP * level), 1, plan.commandId);
    else if (node.tissue === 'atrial') setErpModifier(run, batch, node, 0, 1 - STILLNESS_ATRIAL_ERP * level, plan.commandId);
    else if (node.tissue === 'sinus') setCycleModifier(run, batch, node, 1 + STILLNESS_SINUS_CYCLE * level, plan.commandId);
  }
  if (!ended) scheduleAgentStep(run, plan, 'stillnessStep');
}

// Slow the current: the dose level ramps linearly and then persists until reset.
function stepSlow(run, batch, { plan }) {
  if (run.slowRamp !== plan) return;
  const steps = SLOW_RAMP / AGENT_STEP;
  const level = plan.step >= steps ? plan.to : plan.from + (plan.to - plan.from) * plan.step / steps;
  const previous = run.slowLevel;
  run.slowLevel = level;
  if (level !== previous) {
    for (const link of run.links.values()) {
      if (!link.nodal) parameterChanged(run, batch, 'slowing', plan.commandId, ++link.slowingGeneration, { linkId: link.id }, previous, level, 'agent');
    }
  }
  if (plan.step < steps) scheduleAgentStep(run, plan, 'slowStep');
  else run.slowRamp = null;
}

function applyEdit(run, batch, item) {
  switch (item.type) {
    case 'setLinkEnabled': return changeLinkEnabled(run, batch, item.target, item.value, item.commandId, 'command');
    case 'setNodeERP': return editErp(run, batch, item);
    case 'setDirectionDelay': return editDelay(run, batch, item);
    case 'setAutomaticity': return editCycle(run, batch, item);
    case 'setRestitution': return editRestitution(run, batch, item);
    case 'setDecrement':
    case 'setEntry': return editExtraLaw(run, batch, item);
    case 'setCoupling': return editCoupling(run, batch, item);
    case 'setTone': return editTone(run, batch, item);
    case 'cancelTrain': item.target.active = false; return undefined;
    case 'ablate': return startLesion(run, batch, item);
    case 'lesionStep': return stepLesion(run, batch, item);
    case 'applyAgent': return startAgent(run, batch, item);
    case 'stillnessStep': return stepStillness(run, batch, item);
    case 'slowStep': return stepSlow(run, batch, item);
  }
  throw new Error(`Unhandled edit ${item.type}`);
}

function intersection(a, b) {
  if (a.direction === b.direction ||
      Math.max(a.departure, b.departure) >= Math.min(a.arrival, b.arrival)) return null;
  const [ab, ba] = a.direction === 'ab' ? [a, b] : [b, a];
  const abDuration = BigInt(ab.arrival - ab.departure);
  const baDuration = BigInt(ba.arrival - ba.departure);
  // The exact rational keeps endpoint classification and half-tick rounding stable.
  const positionNumerator = BigInt(ba.arrival - ab.departure);
  const denominator = abDuration + baDuration;
  const elapsed = (2n * abDuration * positionNumerator + denominator) / (2n * denominator);
  const tick = ab.departure + Number(elapsed);
  return {
    tick,
    phase: COLLISION,
    order: Math.min(a.ordinal, b.ordinal),
    secondOrder: Math.max(a.ordinal, b.ordinal),
    first: a.ordinal < b.ordinal ? a : b,
    second: a.ordinal < b.ordinal ? b : a,
    position: Number(positionNumerator) / Number(denominator),
  };
}

function considerCollision(run, batch, link, a, b) {
  charge(batch);
  const candidate = intersection(a, b);
  if (candidate === null) return;
  const current = link.collision;
  if (current !== null && (candidate.tick - current.tick || candidate.order - current.order ||
    candidate.secondOrder - current.secondOrder) >= 0) return;
  link.collision = candidate;
  run.agenda.push(candidate);
}

function recomputeCollisions(run, batch, link) {
  const ab = [];
  const ba = [];
  for (const transit of link.active.values()) (transit.direction === 'ab' ? ab : ba).push(transit);
  for (const a of ab) {
    for (const b of ba) considerCollision(run, batch, link, a, b);
  }
}

function applyCollision(run, batch, collision) {
  const { first, second, position } = collision;
  const link = first.link;
  if (link.collision !== collision) return;
  link.collision = null;
  removeTransit(batch, first);
  removeTransit(batch, second);
  emit(run, batch, 'conduction_collision', {
    linkId: link.id,
    transitIds: Object.freeze([first.event.transitId, second.event.transitId]),
    position,
  });
  recomputeCollisions(run, batch, link);
}

function addCause(batch, node, event, source) {
  let causes = batch.causes.get(node);
  if (causes === undefined) {
    causes = { ids: [], sources: new Set(), links: new Set(), automatic: false };
    batch.causes.set(node, causes);
  }
  causes.ids.push(event.eventId);
  causes.sources.add(source);
  if (source === 'automaticity') causes.automatic = true;
  if (event.type === 'conduction_arrived') causes.links.add(event.linkId);
}

function attempt(run, batch, node, source, triggerId) {
  const event = emit(run, batch, 'stimulus_attempted', { nodeId: node.id, source, triggerId });
  addCause(batch, node, event, source);
}

// Pulses enter the stimulus phase by train command order; each schedules its successor.
function pulse(run, batch, { train, index }) {
  if (!train.active) return;
  attempt(run, batch, train.node, 'stimulus', `${train.commandId}#${index}`);
  if (index < train.count) {
    run.agenda.push({ tick: addTicks(batch.tick, train.cycle), phase: STIMULUS, order: train.order, train, index: index + 1 });
  } else {
    train.active = false;
    batch.trains.push(train);
  }
}

function arrive(run, batch, transit) {
  const link = transit.link;
  if (!link.active.has(transit.ordinal)) return;
  removeTransit(batch, transit);
  const event = emit(run, batch, 'conduction_arrived', {
    nodeId: transit.to.id,
    linkId: link.id,
    transitId: transit.event.transitId,
  });
  addCause(batch, transit.to, event, 'conduction');
}

// §C. A driven capture earlier than the cycle grows suppression; a spontaneous firing decays it.
function updateSuppression(run, node, spontaneous, interval, tick) {
  const auto = node.auto;
  const { gain, max, warmup } = auto.overdrive;
  if (spontaneous) {
    auto.suppression = Math.round(warmup * auto.suppression);
    return;
  }
  if (interval === null) return;
  const cycle = effectiveCycle(run, node, tick);
  if (interval < cycle) auto.suppression = Math.min(max, auto.suppression + Math.round(gain * (cycle - interval)));
}

function determineOutcomes(run, batch) {
  const captures = [];
  for (const node of [...batch.causes.keys()].sort(byId)) {
    const causes = batch.causes.get(node);
    const common = {
      nodeId: node.id,
      source: causes.sources.size === 1 ? causes.sources.values().next().value : 'mixed',
      causeIds: Object.freeze(causes.ids),
      incomingLinkIds: Object.freeze([...causes.links].sort()),
    };
    // §D entrance block: only the focus's own automatic attempt can capture it.
    if (node.auto.protected && !causes.automatic) {
      const refractory = node.until !== null && batch.tick < node.until;
      emit(run, batch, 'activation_blocked', {
        ...common,
        cause: 'protected',
        remainingErpMs: refractory ? toMs(node.until - batch.tick) : 0,
        refractoryUntilMs: toMs(node.until),
      });
      continue;
    }
    if (node.until !== null && batch.tick < node.until) {
      emit(run, batch, 'activation_blocked', {
        ...common,
        cause: 'refractory',
        remainingErpMs: toMs(node.until - batch.tick),
        refractoryUntilMs: toMs(node.until),
      });
      continue;
    }
    const priorUntil = node.until;
    const previous = node.last;
    const recoveryBefore = recoveryAt(node, batch.tick);
    const interval = previous === null ? null : batch.tick - previous;
    // §A uses the pre-capture state: DI is measured from the previous refractory end.
    const diastolicInterval = priorUntil === null ? null : batch.tick - priorUntil;
    const erp = node.restitution === null ? restedErp(node) : agentErp(node, restitutionErp(node.restitution, diastolicInterval));
    if (node.auto.overdrive !== null && node.auto.cycle !== null) {
      updateSuppression(run, node, causes.automatic, interval, batch.tick);
    }
    node.last = batch.tick;
    node.until = addTicks(batch.tick, erp);
    batch.nodes.add(node);
    const payload = {
      ...common,
      priorActivationMs: toMs(previous),
      intervalMs: interval === null ? null : toMs(interval),
      erpMs: toMs(erp),
      refractoryUntilMs: toMs(node.until),
      recoveryBefore,
    };
    if (run.v11) payload.diastolicIntervalMs = toMs(diastolicInterval);
    const activation = emit(run, batch, 'activation', payload);
    captures.push({ node, activation, priorUntil, incoming: causes.links, interval });
  }
  return captures;
}

function transitDuration(settings, tick, priorUntil) {
  const { decrement, delay } = settings;
  if (decrement === null || priorUntil === null) return delay;
  const recoveryInterval = Math.max(0, tick - priorUntil);
  return addTicks(delay, Math.round(decrement.maxExtra * Math.exp(-recoveryInterval / decrement.tau)));
}

function nodalFactor(run, node, tick) {
  if (node.tissue !== 'nodal') return 1;
  let factor = 1;
  if (run.tone !== 0) factor *= 1 + TONE_DECREMENT * run.tone;
  if (run.autonomic?.nodal) factor *= breathFactor(run.autonomic, tick);
  return factor;
}

// Contract 1.1.0 travel time: link delay (with lesion), Slow, source decrement, then §B entry
// slowing from the destination state after every outcome of this batch.
function delayParts(run, capture, link, direction, to, departure) {
  const settings = link[direction];
  const base = settings.delay;
  const linkDelay = link.lesion === null ? base : lesionDelay(base, link.lesion.progress);
  const agent = run.slowLevel > 0 && !link.nodal ? slowExtra(linkDelay, run.slowLevel, capture.interval) : 0;
  let source = 0;
  if (settings.decrement !== null && capture.priorUntil !== null) {
    source = decrementExtra(settings.decrement, Math.max(0, departure - capture.priorUntil), nodalFactor(run, capture.node, departure));
  }
  const nominal = addTicks(departure, linkDelay + agent + source);
  const entry = settings.entry !== null && to.until !== null && nominal >= to.until ? entryExtra(settings.entry, nominal - to.until) : 0;
  return { base, lesion: linkDelay - base, agent, source, entry };
}

function launch(run, batch, capture, link, direction) {
  const ordinal = ++run.transitSeq;
  const departure = batch.tick;
  const to = run.nodes.get(direction === 'ab' ? link.b : link.a);
  let parts = null;
  let duration;
  if (run.v11) {
    parts = delayParts(run, capture, link, direction, to, departure);
    duration = parts.base + parts.lesion + parts.agent + parts.source + parts.entry;
  } else {
    duration = transitDuration(link[direction], departure, capture.priorUntil);
  }
  const arrival = addTicks(departure, duration);
  const payload = {
    transitId: `t${ordinal}`,
    activationId: capture.activation.eventId,
    linkId: link.id,
    linkGeneration: link.generation,
    fromNodeId: capture.node.id,
    toNodeId: to.id,
    departureMs: toMs(departure),
    arrivalMs: toMs(arrival),
  };
  if (parts !== null) {
    payload.delayParts = Object.freeze({
      baseMs: toMs(parts.base), sourceMs: toMs(parts.source), entryMs: toMs(parts.entry),
      lesionMs: toMs(parts.lesion), agentMs: toMs(parts.agent),
    });
  }
  const event = emit(run, batch, 'conduction_launched', payload);
  const transit = { ordinal, event, direction, departure, arrival, link, to };
  for (const existing of link.active.values()) considerCollision(run, batch, link, existing, transit);
  link.active.set(ordinal, transit);
  batch.transits.set(event.transitId, event);
  run.agenda.push({ tick: arrival, phase: ARRIVAL, order: ordinal, transit });
}

function drain(run, batch, phase, process) {
  while (run.agenda.peek()?.tick === batch.tick && run.agenda.peek().phase === phase) {
    charge(batch);
    process(run.agenda.pop());
  }
}

// §D. Each accepted activation of a coupling source shifts the target's next attempt.
// Inputs outside the target's current cycle (phase < 0 or >= 1) leave it unchanged.
function modulate(run, batch, captures, planned) {
  for (const capture of captures) {
    for (const coupling of run.couplingsFrom.get(capture.node) ?? []) {
      charge(batch);
      const target = coupling.target;
      const auto = target.auto;
      if (coupling.amplitude === 0 || auto.cycle === null) continue;
      const pending = planned.has(target) ? planned.get(target) : (auto.token === null ? null : auto.next);
      if (pending === null) continue;
      const cycle = effectiveCycle(run, target, batch.tick);
      const phase = (batch.tick - auto.origin) / cycle;
      if (phase < 0 || phase >= 1) continue;
      const shift = phaseShift(cycle, coupling.amplitude, phase);
      const next = Math.max(addTicks(batch.tick, 1), addTicks(pending, shift));
      planned.set(target, next);
      emit(run, batch, 'phase_modulated', {
        nodeId: target.id,
        couplingId: coupling.id,
        sourceActivationId: capture.activation.eventId,
        phase,
        shiftMs: toMs(shift),
        nextAttemptMs: toMs(next),
      });
    }
  }
}

function processBatch(run, tick, budget) {
  const batch = {
    tick, budget, events: [], nodes: new Set(), links: new Set(), transits: new Map(), causes: new Map(), trains: [],
  };
  drain(run, batch, EDIT, edit => applyEdit(run, batch, edit));
  drain(run, batch, COLLISION, collision => applyCollision(run, batch, collision));
  drain(run, batch, STIMULUS, item => {
    if (item.train !== undefined) pulse(run, batch, item);
    else attempt(run, batch, item.target, 'stimulus', item.commandId);
  });
  const dueAutomatic = [];
  drain(run, batch, AUTOMATIC, ({ node, token }) => {
    if (node.auto.token !== token) return;
    dueAutomatic.push(node);
    attempt(run, batch, node, 'automaticity', `auto${++run.autoSeq}`);
  });
  drain(run, batch, ARRIVAL, item => arrive(run, batch, item.transit));
  const captures = determineOutcomes(run, batch);
  const resetAutomatic = new Set();
  for (const capture of captures) {
    for (const { link, direction } of capture.node.incident) {
      charge(batch);
      if (link.enabled && link[direction].enabled && !capture.incoming.has(link.id)) {
        launch(run, batch, capture, link, direction);
      }
    }
    if (capture.node.auto.cycle !== null && capture.node.auto.resetOnCapture) resetAutomatic.add(capture.node);
  }
  // A just-launched wave can meet another wave within half a tick of departure.
  // Finish that collision in this batch after its causal launch.
  drain(run, batch, COLLISION, collision => applyCollision(run, batch, collision));
  for (const node of dueAutomatic) resetAutomatic.add(node);
  // Reset first, then modulate (§D), then commit the schedules.
  const planned = new Map();
  for (const node of resetAutomatic) planned.set(node, planNextAutomatic(run, node, tick));
  if (run.couplingsFrom.size > 0) modulate(run, batch, captures, planned);
  for (const [node, next] of planned) scheduleAutomatic(run, node, next);
  for (const train of batch.trains) emit(run, batch, 'train_completed', { commandId: train.commandId, delivered: train.count });
  return batch;
}

function requireLimit(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer`);
  return value;
}

export class Engine {
  #run = null;
  #options;

  constructor({
    processingBudget = 10_000, historyBatches = 4096, maxNodes = 4096, maxLinks = 8192, maxConcurrentTrains = 4,
  } = {}) {
    this.#options = {
      processingBudget: requireLimit(processingBudget, 'Processing budget'),
      historyBatches: requireLimit(historyBatches, 'History batch limit'),
      maxNodes: requireLimit(maxNodes, 'Maximum nodes'),
      maxLinks: requireLimit(maxLinks, 'Maximum links'),
      maxConcurrentTrains: requireLimit(maxConcurrentTrains, 'Maximum concurrent trains'),
    };
  }

  reset(world, freshRunId) {
    requireId(freshRunId, 'runId');
    const { worldId, nodes, links, v11, coupling, autonomic } = readWorld(world, this.#options);
    nodes.sort(byId);
    links.sort(byId);
    const run = {
      id: freshRunId,
      worldId,
      nodes: new Map(nodes.map(node => [node.id, node])),
      links: new Map(links.map(link => [link.id, link])),
      committed: null,
      commandIds: new Set(),
      agenda: new Agenda(),
      eventSeq: 0,
      transitSeq: 0,
      autoSeq: 0,
      fault: null,
      v11,
      autonomic,
      tone: 0,
      toneGeneration: 0,
      couplings: new Map(coupling.map(entry => [entry.id, entry])),
      couplingsFrom: new Map(),
      trains: new Map(),
      stillness: [],
      slowRamp: null,
      slowLevel: 0,
    };
    for (const link of links) {
      run.nodes.get(link.a).incident.push({ link, direction: 'ab' });
      run.nodes.get(link.b).incident.push({ link, direction: 'ba' });
    }
    for (const entry of [...coupling].sort(byId)) {
      const from = run.nodes.get(entry.from);
      entry.target = run.nodes.get(entry.to);
      if (!run.couplingsFrom.has(from)) run.couplingsFrom.set(from, []);
      run.couplingsFrom.get(from).push(entry);
    }
    for (const [order, node] of nodes.entries()) {
      node.order = order;
      if (node.auto.firstAttempt !== null) {
        // Before its first attempt a focus is treated as having fired one cycle earlier.
        node.auto.origin = node.auto.firstAttempt - node.auto.cycle;
        scheduleAutomatic(run, node, node.auto.firstAttempt);
      }
    }
    run.history = new History(run, this.#options.historyBatches);
    const initial = run.history.snapshot(run, 0);
    this.#run = run;
    return initial;
  }

  #requireRun() {
    if (this.#run === null) throw new Error('Reset the engine with a world to start a run');
    return this.#run;
  }

  #running() {
    const run = this.#requireRun();
    if (run.fault !== null) throw new Error('Run is faulted. Reset the engine to continue.', { cause: run.fault });
    return run;
  }

  // Train admission depends only on earlier commands, never on the horizon, so a
  // command log is accepted identically live and on replay.
  #admitTrain(run, { value: { start, last } }) {
    let overlapping = 0;
    for (const train of run.trains.values()) {
      const end = Math.min(train.last, train.cancelTick - 1);
      if (end >= train.start && train.start <= last && start <= end) overlapping++;
    }
    if (overlapping >= this.#options.maxConcurrentTrains) {
      throw new RangeError(`At most ${this.#options.maxConcurrentTrains} trains may overlap in time`);
    }
  }

  enqueue(command) {
    const run = this.#running();
    const accepted = readCommand(command, run);
    if (accepted.type === 'stimulateTrain') this.#admitTrain(run, accepted);
    const order = run.commandIds.size;
    run.commandIds.add(accepted.commandId);
    if (accepted.type === 'stimulateTrain') {
      const { start, cycle, count, last } = accepted.value;
      const train = { commandId: accepted.commandId, node: accepted.target, start, cycle, count, last, order, active: true, cancelTick: Infinity };
      run.trains.set(train.commandId, train);
      run.agenda.push({ tick: start, phase: STIMULUS, order, train, index: 1 });
      return;
    }
    if (accepted.type === 'cancelTrain') accepted.target.cancelTick = Math.min(accepted.target.cancelTick, accepted.tick);
    run.agenda.push({ ...accepted, order, phase: accepted.type === 'stimulate' ? STIMULUS : EDIT });
  }

  advanceTo(tMs) {
    const run = this.#running();
    const horizon = toTick(tMs, 'Horizon');
    if (run.committed !== null && horizon < run.committed) throw new RangeError('Horizon cannot move backward');
    if (horizon === run.committed) return EMPTY_EVENTS;
    const events = [];
    const budget = { remaining: this.#options.processingBudget };
    while (run.agenda.peek()?.tick <= horizon) {
      const tick = run.agenda.peek().tick;
      try {
        const batch = processBatch(run, tick, budget);
        run.history.record(tick, batch);
        for (const event of batch.events) events.push(event);
        run.committed = tick;
      } catch (error) {
        run.fault = new SimulationFault(error, tick, run.committed, events);
        throw run.fault;
      }
    }
    run.committed = horizon;
    return Object.freeze(events);
  }

  committedThroughMs() {
    return toMs(this.#run?.committed ?? null);
  }

  readAt(tMs) {
    const run = this.#requireRun();
    const tick = toTick(tMs, 'Read time');
    if (run.committed === null || tick > run.committed) throw new RangeError('Read time is beyond the committed horizon');
    return run.history.snapshot(run, tick);
  }

  diagnostics() {
    const run = this.#requireRun();
    const fault = run.fault;
    return Object.freeze({
      runId: run.id,
      committedThroughMs: toMs(run.committed),
      retainedFromMs: toMs(run.history.earliestTick),
      retainedBatches: run.history.size,
      pendingItems: fault === null ? run.agenda.size : null,
      fault: fault === null ? null : Object.freeze({ code: fault.code, tMs: fault.tMs, message: fault.message }),
    });
  }
}

export function createEngine(options) {
  return new Engine(options);
}
