import { addTicks, toTick } from './time.js';

export const CONTRACT_V10 = '1.0.0';
export const CONTRACT_V11 = '1.1.0';
export const TRAIN_MAX_PULSES = 64;
// Concurrent trains: a world may declare limits.maxConcurrentTrains up to this value (default 4).
export const TRAIN_CONCURRENCY_DEFAULT = 4;
export const TRAIN_CONCURRENCY_MAX = 16;
export const TISSUES = Object.freeze(['sinus', 'atrial', 'nodal', 'hisPurkinje', 'ventricular', 'accessory']);

const ERP_EDIT = [50, 1000];
const DELAY_EDIT = [1, 500];
const CYCLE_EDIT = [200, 3000];
const ERP_FLOOR_EDIT = [10, 1000];
const AMPLITUDE_EDIT = [0, 1000];
const TAU_EDIT = [10, 1000];
const EXTRA_EDIT = [0, 300];
const TRAIN_CYCLE = [150, 10000];
const LESION_DURATION = [1, 60000];
const LABEL_LIMIT = 120;
const commonCommandKeys = ['commandId', 'runId', 'tMs', 'type'];
const commandKeys = new Map([
  ['stimulate', ['nodeId']],
  ['setLinkEnabled', ['linkId', 'enabled']],
  ['setNodeERP', ['nodeId', 'erpMs']],
  ['setDirectionDelay', ['linkId', 'direction', 'delayMs']],
  ['setAutomaticity', ['nodeId', 'cycleMs']],
  // Contract 1.1.0. These require a 1.1.0 run.
  ['stimulateTrain', ['nodeId', 'startMs', 'cycleMs', 'count', 'label']],
  ['cancelTrain', ['trainId']],
  ['setTone', ['value']],
  ['ablate', ['target', 'durationMs', 'completeness']],
  ['applyAgent', ['agent', 'doseScale']],
  ['setCoupling', ['couplingId', 'value']],
  ['setRestitution', ['nodeId', 'erpMaxMs', 'amplitudeMs', 'tauMs', 'erpMinMs']],
  ['setDecrement', ['linkId', 'direction', 'maxExtraMs', 'tauMs']],
  ['setEntry', ['linkId', 'direction', 'maxExtraMs', 'tauMs']],
  ['setAutonomic', ['value']],
]);
const v11Commands = new Set(['stimulateTrain', 'cancelTrain', 'setTone', 'ablate', 'applyAgent', 'setCoupling',
  'setRestitution', 'setDecrement', 'setEntry', 'setAutonomic']);
const targetFields = { nodeId: 'nodes', linkId: 'links', target: 'links', couplingId: 'couplings', trainId: 'trains' };
const WORLD_V11_KEYS = ['contractVersion', 'coupling', 'autonomic', 'limits'];
const NODE_V11_KEYS = ['tissue', 'audible', 'restitution'];
const AUTOMATICITY_V11_KEYS = ['overdrive', 'protected'];
const DIRECTION_V11_KEYS = ['entry'];

function objectWithKeys(value, keys, label, optional = []) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      !keys.every(key => Object.hasOwn(value, key)) ||
      !Object.keys(value).every(key => keys.includes(key) || optional.includes(key))) {
    const extra = optional.length === 0 ? '' : ` and optionally ${optional.join(', ')}`;
    throw new TypeError(`${label} must have fields ${keys.join(', ')}${extra}`);
  }
  return optional.some(key => Object.hasOwn(value, key));
}

export function requireId(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} must be a nonempty string`);
  }
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
}

function requireNumber(value, label, minimum, maximum, { exclusiveMinimum = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value > maximum ||
      (exclusiveMinimum ? value <= minimum : value < minimum)) {
    const lower = exclusiveMinimum ? `above ${minimum}` : `at least ${minimum}`;
    throw new RangeError(`${label} must be a finite number ${lower} and no more than ${maximum}`);
  }
  return value;
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

// Like editTick, but zero is allowed when the range starts at zero.
function rangeTick(value, label, [minimum, maximum]) {
  const tick = toTick(value, label);
  if (value < minimum || value > maximum) throw new RangeError(`${label} must lie within ${minimum}–${maximum} ms`);
  return tick;
}

function uniqueId(id, seen, label) {
  requireId(id, label);
  if (seen.has(id)) throw new RangeError(`Duplicate ${label}: ${id}`);
  seen.add(id);
}

function extraLaw(value, label) {
  objectWithKeys(value, ['maxExtraMs', 'tauMs'], label);
  return { maxExtra: toTick(value.maxExtraMs, `${label}.maxExtraMs`), tau: positiveTick(value.tauMs, `${label}.tauMs`) };
}

function noteVersion(version, hasV11Fields) {
  if (hasV11Fields) version.v11 = true;
}

function direction(value, label, version) {
  noteVersion(version, objectWithKeys(value, ['enabled', 'delayMs', 'decrement'], label, DIRECTION_V11_KEYS));
  requireBoolean(value.enabled, `${label}.enabled`);
  const delay = positiveTick(value.delayMs, `${label}.delayMs`, 1);
  let decrement = null;
  if (value.decrement !== null) {
    decrement = extraLaw(value.decrement, `${label}.decrement`);
    addTicks(delay, decrement.maxExtra);
  }
  let entry = null;
  if (value.entry !== undefined && value.entry !== null) {
    entry = extraLaw(value.entry, `${label}.entry`);
    addTicks(delay, entry.maxExtra);
  }
  return { enabled: value.enabled, delay, decrement, generation: 0, entry, decrementGeneration: 0, entryGeneration: 0 };
}

function overdrive(value, label) {
  if (value === undefined || value === null) return null;
  objectWithKeys(value, ['gainPerBeat', 'maxMs', 'warmupFactor'], label);
  return {
    gain: requireNumber(value.gainPerBeat, `${label}.gainPerBeat`, 0, 1),
    max: toTick(value.maxMs, `${label}.maxMs`),
    warmup: requireNumber(value.warmupFactor, `${label}.warmupFactor`, 0, 1),
  };
}

function automaticity(value, version) {
  const fresh = { overdrive: null, protected: false, suppression: 0, next: null, origin: null };
  if (value === null) return { cycle: null, firstAttempt: null, resetOnCapture: true, ...fresh };
  noteVersion(version, objectWithKeys(value, ['cycleMs', 'firstAttemptMs', 'resetOnCapture'], 'automaticity', AUTOMATICITY_V11_KEYS));
  requireBoolean(value.resetOnCapture, 'automaticity.resetOnCapture');
  if (value.protected !== undefined) requireBoolean(value.protected, 'automaticity.protected');
  return {
    cycle: positiveTick(value.cycleMs, 'automaticity.cycleMs'),
    firstAttempt: toTick(value.firstAttemptMs, 'automaticity.firstAttemptMs'),
    resetOnCapture: value.resetOnCapture,
    ...fresh,
    overdrive: overdrive(value.overdrive, 'automaticity.overdrive'),
    protected: value.protected ?? false,
  };
}

function restitution(value, erp, label) {
  if (value === undefined || value === null) return null;
  objectWithKeys(value, ['erpMaxMs', 'amplitudeMs', 'tauMs', 'erpMinMs'], label);
  const law = {
    erpMax: positiveTick(value.erpMaxMs, `${label}.erpMaxMs`),
    amplitude: toTick(value.amplitudeMs, `${label}.amplitudeMs`),
    tau: positiveTick(value.tauMs, `${label}.tauMs`),
    erpMin: positiveTick(value.erpMinMs, `${label}.erpMinMs`),
  };
  if (law.erpMin > law.erpMax) throw new RangeError(`${label}.erpMinMs must not exceed erpMaxMs`);
  if (law.erpMax !== erp) throw new RangeError(`${label}.erpMaxMs must equal the node's erpMs`);
  return withFloorOffset(law);
}

// §A. setNodeERP shifts erpMin with erpMax. The floor is kept as an offset below erpMax and
// clamped to 1 ms only where it is used, so every setNodeERP edit can be undone exactly.
export function withFloorOffset(law) {
  return { ...law, floorOffset: law.erpMax - law.erpMin };
}

function readNode(node, version) {
  const tissue = node.tissue ?? 'atrial';
  if (!TISSUES.includes(tissue)) throw new RangeError(`Node ${node.id} tissue must be one of ${TISSUES.join(', ')}`);
  if (node.audible !== undefined) requireBoolean(node.audible, `Node ${node.id} audible`);
  const erp = positiveTick(node.erpMs, `Node ${node.id} ERP`);
  return {
    id: node.id,
    erp,
    tail: positiveTick(node.recoveryTailMs, `Node ${node.id} recovery tail`),
    last: null,
    until: null,
    erpGeneration: 0,
    cycleGeneration: 0,
    protectedGeneration: 0,
    auto: { ...automaticity(node.automaticity, version), token: null },
    incident: [],
    tissue,
    audible: node.audible ?? true,
    restitution: restitution(node.restitution, erp, `Node ${node.id} restitution`),
    restitutionGeneration: 0,
    agentErpAdd: 0,
    agentErpScale: 1,
    agentCycleScale: 1,
  };
}

function readCoupling(entries, nodes, maxLinks) {
  if (!Array.isArray(entries)) throw new TypeError('World coupling must be an array');
  if (entries.length > maxLinks) throw new RangeError('World exceeds the configured topology limits');
  const ids = new Set();
  return entries.map(entry => {
    objectWithKeys(entry, ['id', 'from', 'to', 'amplitude'], 'coupling');
    uniqueId(entry.id, ids, 'coupling ID');
    const to = nodes.get(entry.to);
    if (entry.from === entry.to || !nodes.has(entry.from) || to === undefined) {
      throw new RangeError(`Coupling ${entry.id} must connect two distinct existing nodes`);
    }
    if (to.auto.cycle === null) throw new RangeError(`Coupling ${entry.id} must target an automatic focus`);
    return {
      id: entry.id,
      from: entry.from,
      to: entry.to,
      amplitude: requireNumber(entry.amplitude, `Coupling ${entry.id} amplitude`, 0, 1),
      generation: 0,
    };
  });
}

function readAutonomic(value, label = 'autonomic') {
  if (value === null) return null;
  objectWithKeys(value, ['breathPeriodMs', 'depth', 'targets'], label);
  if (!Array.isArray(value.targets) || new Set(value.targets).size !== value.targets.length ||
      !value.targets.every(target => target === 'sinus' || target === 'nodal')) {
    throw new RangeError(`${label}.targets must list sinus and/or nodal at most once each`);
  }
  return {
    period: positiveTick(value.breathPeriodMs, `${label}.breathPeriodMs`),
    depth: requireNumber(value.depth, `${label}.depth`, 0, 0.5),
    sinus: value.targets.includes('sinus'),
    nodal: value.targets.includes('nodal'),
  };
}

function readLimits(value, cap) {
  objectWithKeys(value, [], 'limits', ['maxConcurrentTrains']);
  const trains = value.maxConcurrentTrains ?? TRAIN_CONCURRENCY_DEFAULT;
  if (!Number.isSafeInteger(trains) || trains < 1 || trains > TRAIN_CONCURRENCY_MAX) {
    throw new RangeError(`limits.maxConcurrentTrains must be an integer from 1 to ${TRAIN_CONCURRENCY_MAX}`);
  }
  return { maxConcurrentTrains: trains, cap };
}

// The concurrent-train limit is part of the world, so a performance replays from its own
// files. The engine option is only a host cap: a world asking for more is refused at reset.
function trainLimit(limits, cap) {
  if (limits.maxConcurrentTrains > cap) {
    throw new RangeError(`World limits.maxConcurrentTrains (${limits.maxConcurrentTrains}) exceeds this engine's cap of ${cap}`);
  }
  return limits.maxConcurrentTrains;
}

// Accepts contract 1.0.0 worlds and 1.1.0 worlds. A world is read as 1.1.0 when it declares
// contractVersion '1.1.0' or carries any 1.1.0 field. contractVersion '1.0.0' declares a
// 1.0.0 world explicitly; such a world may not carry 1.1.0 fields.
export function readWorld(world, { maxNodes, maxLinks, maxConcurrentTrains = TRAIN_CONCURRENCY_MAX }) {
  const version = { v11: objectWithKeys(world, ['worldId', 'nodes', 'links'], 'world', WORLD_V11_KEYS) };
  requireId(world.worldId, 'worldId');
  const declared = Object.hasOwn(world, 'contractVersion') ? world.contractVersion : undefined;
  if (declared !== undefined && declared !== CONTRACT_V11 && declared !== CONTRACT_V10) {
    throw new RangeError(`contractVersion must be ${CONTRACT_V11} or ${CONTRACT_V10}, or omitted`);
  }
  if (declared === CONTRACT_V10) version.v11 = Object.keys(world).some(key => key !== 'contractVersion' && WORLD_V11_KEYS.includes(key));
  if (!Array.isArray(world.nodes) || !Array.isArray(world.links)) {
    throw new TypeError('World nodes and links must be arrays');
  }
  if (world.nodes.length > maxNodes || world.links.length > maxLinks) {
    throw new RangeError('World exceeds the configured topology limits');
  }
  const nodeIds = new Set();
  const nodes = [];
  for (const node of world.nodes) {
    noteVersion(version, objectWithKeys(node, ['id', 'erpMs', 'recoveryTailMs', 'automaticity'], 'node', NODE_V11_KEYS));
    uniqueId(node.id, nodeIds, 'node ID');
    nodes.push(readNode(node, version));
  }
  const linkIds = new Set();
  const links = [];
  const byId = new Map(nodes.map(node => [node.id, node]));
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
      ab: direction(link.ab, `Link ${link.id} ab`, version),
      ba: direction(link.ba, `Link ${link.id} ba`, version),
      active: new Map(),
      collision: null,
      lesion: null,
      nodal: byId.get(link.a).tissue === 'nodal' || byId.get(link.b).tissue === 'nodal',
      slowingGeneration: 0,
    });
  }
  const coupling = world.coupling === undefined ? [] : readCoupling(world.coupling, byId, maxLinks);
  const autonomic = world.autonomic === undefined ? null : readAutonomic(world.autonomic);
  if (declared === CONTRACT_V10 && version.v11) {
    throw new RangeError(`A world that declares contractVersion ${CONTRACT_V10} must not carry ${CONTRACT_V11} fields`);
  }
  const limits = readLimits(world.limits ?? {}, maxConcurrentTrains);
  const maxTrains = version.v11 ? trainLimit(limits, maxConcurrentTrains) : null;
  return { worldId: world.worldId, nodes, links, v11: version.v11, coupling, autonomic, maxConcurrentTrains: maxTrains };
}

// Study-world lint (12a, 13a–13g): every site of a shipped study world declares its tissue, so
// Stillness never quietly treats an untagged nodal or ventricular site as atrial. Returns one
// finding per site, in world order; an empty array means the world passes.
export function lintStudyWorld(world) {
  const nodes = Array.isArray(world?.nodes) ? world.nodes : [];
  return Object.freeze(nodes.flatMap((node, index) => {
    if (node !== null && typeof node === 'object' && Object.hasOwn(node, 'tissue')) return [];
    const nodeId = typeof node?.id === 'string' ? node.id : `#${index}`;
    return [Object.freeze({ code: 'MISSING_TISSUE', nodeId, message: `Site ${nodeId} does not declare tissue (the engine default is atrial)` })];
  }));
}

function requireDirection(value) {
  if (value !== 'ab' && value !== 'ba') throw new TypeError('Direction must be ab or ba');
  return value;
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
  if (v11Commands.has(command.type) && !run.v11) {
    throw new TypeError(`${command.type} requires a contract ${CONTRACT_V11} world`);
  }
  const field = keys.find(key => Object.hasOwn(targetFields, key));
  let target = null;
  if (field !== undefined) {
    const targetId = command[field];
    target = run[targetFields[field]].get(targetId);
    if (target === undefined) throw new RangeError(`Unknown command target: ${targetId}`);
  }

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
      accepted.direction = requireDirection(command.direction);
      accepted.value = editTick(command.delayMs, 'Direction delay', DELAY_EDIT);
      addTicks(accepted.value, target[accepted.direction].decrement?.maxExtra ?? 0);
      break;
    case 'setAutomaticity':
      accepted.value = command.cycleMs === null ? null : editTick(command.cycleMs, 'Automaticity cycle', CYCLE_EDIT);
      if (accepted.value !== null) addTicks(tick, accepted.value);
      break;
    case 'stimulateTrain': {
      const start = toTick(command.startMs, 'Train start');
      if (start < tick) throw new RangeError('Train start must not precede the command time');
      const cycle = editTick(command.cycleMs, 'Train cycle', TRAIN_CYCLE);
      if (!Number.isSafeInteger(command.count) || command.count < 1 || command.count > TRAIN_MAX_PULSES) {
        throw new RangeError(`Train count must be an integer from 1 to ${TRAIN_MAX_PULSES}`);
      }
      if (typeof command.label !== 'string' || command.label.length > LABEL_LIMIT) {
        throw new TypeError(`Train label must be a string of at most ${LABEL_LIMIT} characters`);
      }
      accepted.value = { start, cycle, count: command.count, last: addTicks(start, cycle * (command.count - 1)) };
      break;
    }
    case 'setTone':
      accepted.value = requireNumber(command.value, 'Tone', -1, 1);
      break;
    case 'setAutonomic':
      if (command.value === undefined) throw new TypeError('Autonomic value must be an object or null');
      accepted.value = readAutonomic(command.value, 'Autonomic value');
      break;
    case 'ablate':
      accepted.value = {
        duration: editTick(command.durationMs, 'Lesion duration', LESION_DURATION),
        completeness: requireNumber(command.completeness, 'Lesion completeness', 0, 1, { exclusiveMinimum: true }),
      };
      break;
    case 'applyAgent':
      if (command.agent !== 'stillness' && command.agent !== 'slow') throw new TypeError('Agent must be stillness or slow');
      accepted.value = { agent: command.agent, dose: requireNumber(command.doseScale, 'Dose scale', 0, 2, { exclusiveMinimum: true }) };
      break;
    case 'setCoupling':
      accepted.value = requireNumber(command.value, 'Coupling amplitude', 0, 1);
      break;
    case 'setRestitution': {
      const value = {
        erpMax: editTick(command.erpMaxMs, 'Restitution erpMax', ERP_EDIT),
        amplitude: rangeTick(command.amplitudeMs, 'Restitution amplitude', AMPLITUDE_EDIT),
        tau: editTick(command.tauMs, 'Restitution tau', TAU_EDIT),
        erpMin: editTick(command.erpMinMs, 'Restitution erpMin', ERP_FLOOR_EDIT),
      };
      if (value.erpMin > value.erpMax) throw new RangeError('Restitution erpMin must not exceed erpMax');
      accepted.value = value;
      break;
    }
    case 'setDecrement':
    case 'setEntry':
      accepted.direction = requireDirection(command.direction);
      accepted.value = {
        maxExtra: rangeTick(command.maxExtraMs, 'Maximum extra delay', EXTRA_EDIT),
        tau: editTick(command.tauMs, 'Tau', TAU_EDIT),
      };
      addTicks(target[accepted.direction].delay, accepted.value.maxExtra);
      break;
  }
  return accepted;
}
