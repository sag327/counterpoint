import { addTicks, toTick } from './time.js';

const ERP_EDIT = [50, 1000];
const DELAY_EDIT = [1, 500];
const CYCLE_EDIT = [200, 3000];
const commonCommandKeys = ['commandId', 'runId', 'tMs', 'type'];
const commandKeys = new Map([
  ['stimulate', ['nodeId']],
  ['setLinkEnabled', ['linkId', 'enabled']],
  ['setNodeERP', ['nodeId', 'erpMs']],
  ['setDirectionDelay', ['linkId', 'direction', 'delayMs']],
  ['setAutomaticity', ['nodeId', 'cycleMs']],
]);

function objectWithKeys(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) {
    throw new TypeError(`${label} must have fields ${keys.join(', ')}`);
  }
}

export function requireId(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a nonempty string`);
  }
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
}

function positiveTick(value, label, minimumMs = 0) {
  const tick = toTick(value, label);
  if (tick <= 0 || value < minimumMs) throw new RangeError(`${label} is outside its duration range`);
  return tick;
}

function editTick(value, label, [minimum, maximum]) {
  const tick = positiveTick(value, label, minimum);
  if (value > maximum) throw new RangeError(`${label} must be no more than ${maximum} ms`);
  return tick;
}

function uniqueId(id, seen, label) {
  requireId(id, label);
  if (seen.has(id)) throw new RangeError(`Duplicate ${label}: ${id}`);
  seen.add(id);
}

function direction(value, label) {
  objectWithKeys(value, ['enabled', 'delayMs', 'decrement'], label);
  requireBoolean(value.enabled, `${label}.enabled`);
  const delay = positiveTick(value.delayMs, `${label}.delayMs`, 1);
  let decrement = null;
  if (value.decrement !== null) {
    objectWithKeys(value.decrement, ['maxExtraMs', 'tauMs'], `${label}.decrement`);
    const maxExtra = toTick(value.decrement.maxExtraMs, `${label}.decrement.maxExtraMs`);
    const tau = positiveTick(value.decrement.tauMs, `${label}.decrement.tauMs`);
    addTicks(delay, maxExtra);
    decrement = { maxExtra, tau };
  }
  return { enabled: value.enabled, delay, decrement, generation: 0 };
}

function automaticity(value) {
  if (value === null) return { cycle: null, firstAttempt: null, resetOnCapture: true };
  objectWithKeys(value, ['cycleMs', 'firstAttemptMs', 'resetOnCapture'], 'automaticity');
  requireBoolean(value.resetOnCapture, 'automaticity.resetOnCapture');
  return {
    cycle: positiveTick(value.cycleMs, 'automaticity.cycleMs'),
    firstAttempt: toTick(value.firstAttemptMs, 'automaticity.firstAttemptMs'),
    resetOnCapture: value.resetOnCapture,
  };
}

export function readWorld(world, { maxNodes, maxLinks }) {
  objectWithKeys(world, ['worldId', 'nodes', 'links'], 'world');
  requireId(world.worldId, 'worldId');
  if (!Array.isArray(world.nodes) || !Array.isArray(world.links)) {
    throw new TypeError('World nodes and links must be arrays');
  }
  if (world.nodes.length > maxNodes || world.links.length > maxLinks) {
    throw new RangeError('World exceeds the configured topology limits');
  }
  const nodeIds = new Set();
  const nodes = [];
  for (const node of world.nodes) {
    objectWithKeys(node, ['id', 'erpMs', 'recoveryTailMs', 'automaticity'], 'node');
    uniqueId(node.id, nodeIds, 'node ID');
    nodes.push({
      id: node.id,
      erp: positiveTick(node.erpMs, `Node ${node.id} ERP`),
      tail: positiveTick(node.recoveryTailMs, `Node ${node.id} recovery tail`),
      last: null,
      until: null,
      erpGeneration: 0,
      cycleGeneration: 0,
      auto: { ...automaticity(node.automaticity), token: null },
      incident: [],
    });
  }
  const linkIds = new Set();
  const links = [];
  for (const link of world.links) {
    objectWithKeys(link, ['id', 'a', 'b', 'enabled', 'ab', 'ba'], 'link');
    uniqueId(link.id, linkIds, 'link ID');
    if (link.a === link.b || !nodeIds.has(link.a) || !nodeIds.has(link.b)) {
      throw new RangeError(`Link ${link.id} must connect two distinct existing nodes`);
    }
    requireBoolean(link.enabled, `Link ${link.id} enabled`);
    links.push({
      id: link.id,
      a: link.a,
      b: link.b,
      enabled: link.enabled,
      generation: 0,
      ab: direction(link.ab, `Link ${link.id} ab`),
      ba: direction(link.ba, `Link ${link.id} ba`),
      active: new Map(),
      collision: null,
    });
  }
  return { worldId: world.worldId, nodes, links };
}

export function readCommand(command, run) {
  const keys = commandKeys.get(command?.type);
  if (keys === undefined) throw new TypeError('Unknown command type');
  objectWithKeys(command, [...commonCommandKeys, ...keys], 'command');
  requireId(command.commandId, 'commandId');
  if (command.runId !== run.id) throw new RangeError('Command belongs to a different run');
  if (run.commandIds.has(command.commandId)) throw new RangeError('Duplicate command ID');
  const tick = toTick(command.tMs, 'Command time');
  if (run.committed !== null && tick <= run.committed) {
    throw new RangeError('Command time must follow the committed horizon');
  }
  const targetId = command.nodeId ?? command.linkId;
  const target = (keys[0] === 'nodeId' ? run.nodes : run.links).get(targetId);
  if (target === undefined) throw new RangeError(`Unknown command target: ${targetId}`);

  const accepted = { tick, commandId: command.commandId, target, type: command.type };
  switch (command.type) {
    case 'setLinkEnabled':
      requireBoolean(command.enabled, 'enabled');
      accepted.value = command.enabled;
      break;
    case 'setNodeERP':
      accepted.value = editTick(command.erpMs, 'ERP', ERP_EDIT);
      break;
    case 'setDirectionDelay':
      if (command.direction !== 'ab' && command.direction !== 'ba') {
        throw new TypeError('Direction must be ab or ba');
      }
      accepted.direction = command.direction;
      accepted.value = editTick(command.delayMs, 'Direction delay', DELAY_EDIT);
      addTicks(accepted.value, target[accepted.direction].decrement?.maxExtra ?? 0);
      break;
    case 'setAutomaticity':
      accepted.value = command.cycleMs === null ? null : editTick(command.cycleMs, 'Automaticity cycle', CYCLE_EDIT);
      if (accepted.value !== null) addTicks(tick, accepted.value);
      break;
  }
  return accepted;
}
