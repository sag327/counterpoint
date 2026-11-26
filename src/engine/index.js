import { Agenda } from './agenda.js';
import { History, recoveryAt } from './history.js';
import { readCommand, readWorld, requireId } from './input.js';
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

function scheduleAutomatic(run, node, tick) {
  const token = {};
  node.auto.token = token;
  run.agenda.push({ tick, phase: AUTOMATIC, order: node.order, node, token });
}

function scheduleNextAutomatic(run, node, tick) {
  scheduleAutomatic(run, node, addTicks(tick, node.auto.cycle));
}

function removeTransit(batch, transit) {
  transit.link.active.delete(transit.ordinal);
  batch.transits.set(transit.event.transitId, null);
}

function transitPosition(transit, tick) {
  const progress = clampUnit((tick - transit.departure) / (transit.arrival - transit.departure));
  return transit.direction === 'ab' ? progress : 1 - progress;
}

function applyEdit(run, batch, command) {
  const { commandId, direction, target, type, value } = command;
  if (type === 'setLinkEnabled') {
    if (target.enabled === value) return;
    const previous = target.enabled;
    target.enabled = value;
    const generation = ++target.generation;
    batch.links.add(target);
    emit(run, batch, 'link_changed', { linkId: target.id, previous, value, generation, commandId });
    if (!value) {
      target.collision = null;
      for (const transit of target.active.values()) {
        emit(run, batch, 'conduction_canceled', {
          linkId: target.id,
          transitId: transit.event.transitId,
          cause: 'cut',
          position: transitPosition(transit, batch.tick),
        });
        removeTransit(batch, transit);
      }
    }
    return;
  }

  const targetRef = type === 'setDirectionDelay' ? { linkId: target.id, direction } : { nodeId: target.id };
  let parameter;
  let previous;
  let generation;
  switch (type) {
    case 'setNodeERP':
      previous = target.erp;
      if (previous === value) return;
      target.erp = value;
      parameter = 'erpMs';
      generation = ++target.erpGeneration;
      batch.nodes.add(target);
      break;
    case 'setDirectionDelay':
      previous = target[direction].delay;
      if (previous === value) return;
      target[direction].delay = value;
      parameter = 'delayMs';
      generation = ++target[direction].generation;
      batch.links.add(target);
      break;
    case 'setAutomaticity':
      previous = target.auto.cycle;
      if (previous === value) return;
      target.auto.cycle = value;
      target.auto.token = null;
      parameter = 'cycleMs';
      generation = ++target.cycleGeneration;
      if (value !== null) scheduleNextAutomatic(run, target, batch.tick);
      break;
  }
  emit(run, batch, 'parameter_changed', {
    parameter, commandId, generation, ...targetRef, previous: toMs(previous), value: toMs(value),
  });
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
    causes = { ids: [], sources: new Set(), links: new Set() };
    batch.causes.set(node, causes);
  }
  causes.ids.push(event.eventId);
  causes.sources.add(source);
  if (event.type === 'conduction_arrived') causes.links.add(event.linkId);
}

function attempt(run, batch, node, source, triggerId) {
  const event = emit(run, batch, 'stimulus_attempted', { nodeId: node.id, source, triggerId });
  addCause(batch, node, event, source);
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
    node.last = batch.tick;
    node.until = addTicks(batch.tick, node.erp);
    batch.nodes.add(node);
    const activation = emit(run, batch, 'activation', {
      ...common,
      priorActivationMs: toMs(previous),
      intervalMs: previous === null ? null : toMs(batch.tick - previous),
      erpMs: toMs(node.erp),
      refractoryUntilMs: toMs(node.until),
      recoveryBefore,
    });
    captures.push({ node, activation, priorUntil, incoming: causes.links });
  }
  return captures;
}

function transitDuration(settings, tick, priorUntil) {
  const { decrement, delay } = settings;
  if (decrement === null || priorUntil === null) return delay;
  const recoveryInterval = Math.max(0, tick - priorUntil);
  return addTicks(delay, Math.round(decrement.maxExtra * Math.exp(-recoveryInterval / decrement.tau)));
}

function launch(run, batch, capture, link, direction) {
  const ordinal = ++run.transitSeq;
  const departure = batch.tick;
  const arrival = addTicks(departure, transitDuration(link[direction], departure, capture.priorUntil));
  const to = run.nodes.get(direction === 'ab' ? link.b : link.a);
  const event = emit(run, batch, 'conduction_launched', {
    transitId: `t${ordinal}`,
    activationId: capture.activation.eventId,
    linkId: link.id,
    linkGeneration: link.generation,
    fromNodeId: capture.node.id,
    toNodeId: to.id,
    departureMs: toMs(departure),
    arrivalMs: toMs(arrival),
  });
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

function processBatch(run, tick, budget) {
  const batch = { tick, budget, events: [], nodes: new Set(), links: new Set(), transits: new Map(), causes: new Map() };
  drain(run, batch, EDIT, edit => applyEdit(run, batch, edit));
  drain(run, batch, COLLISION, collision => applyCollision(run, batch, collision));
  drain(run, batch, STIMULUS, item => attempt(run, batch, item.target, 'stimulus', item.commandId));
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
  for (const node of resetAutomatic) scheduleNextAutomatic(run, node, tick);
  return batch;
}

function requireLimit(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer`);
  return value;
}

export class Engine {
  #run = null;
  #options;

  constructor({ processingBudget = 10_000, historyBatches = 4096, maxNodes = 4096, maxLinks = 8192 } = {}) {
    this.#options = {
      processingBudget: requireLimit(processingBudget, 'Processing budget'),
      historyBatches: requireLimit(historyBatches, 'History batch limit'),
      maxNodes: requireLimit(maxNodes, 'Maximum nodes'),
      maxLinks: requireLimit(maxLinks, 'Maximum links'),
    };
  }

  reset(world, freshRunId) {
    requireId(freshRunId, 'runId');
    const { worldId, nodes, links } = readWorld(world, this.#options);
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
    };
    for (const link of links) {
      run.nodes.get(link.a).incident.push({ link, direction: 'ab' });
      run.nodes.get(link.b).incident.push({ link, direction: 'ba' });
    }
    for (const [order, node] of nodes.entries()) {
      node.order = order;
      if (node.auto.firstAttempt !== null) scheduleAutomatic(run, node, node.auto.firstAttempt);
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

  enqueue(command) {
    const run = this.#running();
    const accepted = readCommand(command, run);
    const order = run.commandIds.size;
    run.commandIds.add(accepted.commandId);
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
