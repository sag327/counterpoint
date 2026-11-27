import { lesionDelay, restedErp } from './laws.js';
import { clampUnit, toMs } from './time.js';

const CHECKPOINT_INTERVAL = 64;

function extraState(law) {
  return law === null ? null : Object.freeze({ maxExtraMs: toMs(law.maxExtra), tauMs: toMs(law.tau) });
}

// Contract 1.1.0 runs add restitution and suppression; 1.0.0 snapshots are unchanged.
function nodeState(node, v11) {
  const state = { erp: restedErp(node), tail: node.tail, last: node.last, until: node.until };
  if (v11) {
    const law = node.restitution;
    state.extra = Object.freeze({
      restitution: law === null ? null : Object.freeze({
        erpMaxMs: toMs(law.erpMax), amplitudeMs: toMs(law.amplitude), tauMs: toMs(law.tau), erpMinMs: toMs(law.erpMin),
      }),
      suppressionMs: node.auto.overdrive === null ? null : toMs(node.auto.suppression),
    });
  }
  return state;
}

function directionState(direction, link, v11) {
  const progress = link.lesion?.progress ?? 0;
  const state = {
    enabled: direction.enabled,
    delayMs: toMs(lesionDelay(direction.delay, progress)),
    decrement: extraState(direction.decrement),
  };
  if (v11) state.entry = extraState(direction.entry);
  return Object.freeze(state);
}

function linkState(link, v11) {
  const state = {
    a: link.a,
    b: link.b,
    enabled: link.enabled,
    generation: link.generation,
    ab: directionState(link.ab, link, v11),
    ba: directionState(link.ba, link, v11),
  };
  if (v11) {
    state.lesion = link.lesion === null ? null : Object.freeze({
      progress: link.lesion.progress,
      completeness: link.lesion.completeness,
    });
  }
  return Object.freeze(state);
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
    ...node.extra,
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
  #v11;

  constructor(run, limit) {
    this.#limit = limit;
    this.#v11 = run.v11;
    this.#base = {
      nodes: new Map(Array.from(run.nodes, ([id, node]) => [id, nodeState(node, run.v11)])),
      links: new Map(Array.from(run.links, ([id, link]) => [id, linkState(link, run.v11)])),
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
      nodes: Array.from(batch.nodes, node => [node.id, nodeState(node, this.#v11)]),
      links: Array.from(batch.links, link => [link.id, linkState(link, this.#v11)]),
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
