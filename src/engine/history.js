import { clampUnit, toMs } from './time.js';

const CHECKPOINT_INTERVAL = 64;

function nodeState(node) {
  return { erp: node.erp, tail: node.tail, last: node.last, until: node.until };
}

function directionState(direction) {
  const decrement = direction.decrement === null ? null : Object.freeze({
    maxExtraMs: toMs(direction.decrement.maxExtra),
    tauMs: toMs(direction.decrement.tau),
  });
  return Object.freeze({
    enabled: direction.enabled,
    delayMs: toMs(direction.delay),
    decrement,
  });
}

function linkState(link) {
  return Object.freeze({
    a: link.a,
    b: link.b,
    enabled: link.enabled,
    generation: link.generation,
    ab: directionState(link.ab),
    ba: directionState(link.ba),
  });
}

export function recoveryAt(node, tick) {
  return node.last === null ? 1 : clampUnit((tick - node.until) / node.tail);
}

function copyState(state) {
  return {
    nodes: new Map(state.nodes),
    links: new Map(state.links),
    transits: new Map(state.transits),
  };
}

function applyChanges(state, { nodes, links, transits }) {
  for (const [id, value] of nodes) state.nodes.set(id, value);
  for (const [id, value] of links) state.links.set(id, value);
  for (const [id, value] of transits) {
    if (value === null) state.transits.delete(id);
    else state.transits.set(id, value);
  }
}

function readSnapshot(run, tick, state) {
  const nodes = Array.from(state.nodes, ([id, node]) => [id, Object.freeze({
    lastActivationMs: toMs(node.last),
    refractoryUntilMs: toMs(node.until),
    erpMs: toMs(node.erp),
    recoveryTailMs: toMs(node.tail),
    recovery: recoveryAt(node, tick),
    excitable: node.until === null || tick >= node.until,
  })]);
  return Object.freeze({
    runId: run.id,
    worldId: run.worldId,
    tMs: toMs(tick),
    nodes: Object.freeze(Object.fromEntries(nodes)),
    links: Object.freeze(Object.fromEntries(state.links)),
    activeTransits: Object.freeze(Array.from(state.transits.values())),
  });
}

export class History {
  #floor = 0;
  #batches = [];
  #count = 0;
  #base;
  #head;
  #limit;

  constructor(run, limit) {
    this.#limit = limit;
    this.#base = {
      nodes: new Map(Array.from(run.nodes, ([id, node]) => [id, nodeState(node)])),
      links: new Map(Array.from(run.links, ([id, link]) => [id, linkState(link)])),
      transits: new Map(),
    };
    this.#head = copyState(this.#base);
  }

  get size() {
    return this.#batches.length;
  }

  get earliestTick() {
    return this.#floor;
  }

  record(tick, batch) {
    if (batch.nodes.size === 0 && batch.links.size === 0 && batch.transits.size === 0) return;
    const entry = {
      tick,
      nodes: Array.from(batch.nodes, node => [node.id, nodeState(node)]),
      links: Array.from(batch.links, link => [link.id, linkState(link)]),
      transits: batch.transits,
      checkpoint: null,
    };
    applyChanges(this.#head, entry);
    this.#count++;
    if (this.#count % CHECKPOINT_INTERVAL === 0) entry.checkpoint = copyState(this.#head);
    this.#batches.push(entry);
    if (this.#batches.length > this.#limit) {
      const oldest = this.#batches.shift();
      applyChanges(this.#base, oldest);
      this.#floor = oldest.tick;
    }
  }

  snapshot(run, tick) {
    if (tick < this.#floor) throw new RangeError('Read time is outside retained simulation history');
    const batches = this.#batches;
    let lower = 0;
    let upper = batches.length;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (batches[middle].tick <= tick) lower = middle + 1;
      else upper = middle;
    }
    const end = lower;
    let checkpoint = end - 1;
    while (checkpoint >= 0 && batches[checkpoint].checkpoint === null) checkpoint--;
    const state = copyState(batches[checkpoint]?.checkpoint ?? this.#base);
    for (let index = checkpoint + 1; index < end; index++) applyChanges(state, batches[index]);
    return readSnapshot(run, tick, state);
  }
}
