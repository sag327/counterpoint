// Site and link inspector card (ticket 14d): the press-and-hold card that shows
// live state and the governing curve, with handles and number fields that edit
// the model through logged engine commands.
//
// Pure part (testable without a DOM):
//   createParameterState(world), applyParameterEvents(state, events)
//   editCommand(state, target, param, value) -> command body or null
//   defaultCommands(world, state, target) -> command bodies ("Study default")
//   modifiedElements(world, state) -> { nodes, links, couplings } (Sets of IDs)
//
// DOM part:
//   createInspectorCard(container, { world, enqueue, labels, onModifiedChange, onClose })
//     .open({ kind: 'node', id } | { kind: 'link', id, direction })
//     .update({ snapshot, events, tMs })   // snapshot = engine.readAt(tMs) at the presentation cursor
//     .close(), .target, .state, .modified()
//
// enqueue(body) receives a command body without commandId, runId or tMs. The
// host stamps those (live placement per the contract) and logs the command, so
// every handle edit replays exactly from the performance file.

import { activationsAt, conductionDots, restitutionDots, round3 } from './measure.js';
import { PLOT_CATALOG, drawPlot, handlePoints, tableHtml, valueAtPixel } from './plots.js';

const RANGES = {
  erpMs: [50, 1000],
  erpMaxMs: [50, 1000],
  amplitudeMs: [0, 1000],
  tauMs: [10, 1000],
  erpMinMs: [10, 1000],
  cycleMs: [200, 3000],
  delayMs: [1, 500],
  'decrement.maxExtraMs': [0, 300],
  'decrement.tauMs': [10, 1000],
  'entry.maxExtraMs': [0, 300],
  'entry.tauMs': [10, 1000],
  coupling: [0, 1],
};

const NOTES = {
  restitution: 'ERP is recomputed at each capture from the diastolic interval since the previous refractory period ended (§A).',
  fixed: 'This site has a fixed ERP: every capture uses the same refractory period.',
  conduction: 'Entry slowing is computed at launch from the tissue state at that moment; a later capture does not move a planned arrival (§B).',
};

const clone = value => (value === null || value === undefined ? null : JSON.parse(JSON.stringify(value)));
const clamp = (value, [lo, hi]) => Math.min(hi, Math.max(lo, value));

// ---------------------------------------------------------------------------
// Parameter state: the model as the commands have left it (agents and lesions
// are transient tissue states, not model edits, so they are not tracked here).

export function createParameterState(world) {
  const nodes = {};
  for (const node of world.nodes) {
    const law = clone(node.restitution ?? null);
    nodes[node.id] = {
      erpMs: node.erpMs,
      restitution: law,
      floorOffsetMs: law === null ? null : law.erpMaxMs - law.erpMinMs,
      cycleMs: node.automaticity?.cycleMs ?? null,
    };
  }
  const links = {};
  for (const link of world.links) {
    links[link.id] = {};
    for (const direction of ['ab', 'ba']) {
      const d = link[direction];
      links[link.id][direction] = { delayMs: d.delayMs, decrement: clone(d.decrement), entry: clone(d.entry ?? null), enabled: d.enabled };
    }
  }
  const couplings = Object.fromEntries((world.coupling ?? []).map(entry => [entry.id, entry.amplitude]));
  return { v11: isV11(world), nodes, links, couplings };
}

function isV11(world) {
  return world.contractVersion === '1.1.0' || ['coupling', 'autonomic', 'limits'].some(key => key in world) ||
    world.nodes.some(node => 'tissue' in node || 'audible' in node || 'restitution' in node) ||
    world.links.some(link => 'entry' in link.ab || 'entry' in link.ba);
}

function setErp(node, value) {
  node.erpMs = value;
  if (node.restitution !== null) {
    node.restitution.erpMaxMs = value;
    node.restitution.erpMinMs = Math.max(1, value - node.floorOffsetMs);
  }
}

export function applyParameterEvents(state, events) {
  for (const event of events) {
    if (event.type !== 'parameter_changed') continue;
    if (event.cause !== undefined && event.cause !== 'command') continue;
    const node = event.nodeId === undefined ? null : state.nodes[event.nodeId];
    const link = event.linkId === undefined ? null : state.links[event.linkId]?.[event.direction];
    switch (event.parameter) {
      case 'erpMs': if (node) setErp(node, event.value); break;
      case 'restitution':
        if (node) {
          node.restitution = clone(event.value);
          node.floorOffsetMs = event.value === null ? null : event.value.erpMaxMs - event.value.erpMinMs;
          if (event.value !== null) node.erpMs = event.value.erpMaxMs;
        }
        break;
      case 'cycleMs': if (node) node.cycleMs = event.value; break;
      case 'delayMs': if (link) link.delayMs = event.value; break;
      case 'decrement': if (link) link.decrement = clone(event.value); break;
      case 'entry': if (link) link.entry = clone(event.value); break;
      case 'coupling': state.couplings[event.couplingId] = event.value; break;
      default: break; // tone, autonomic, slowing and future parameters are not card edits.
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// Commands

// param names: node erpMs | erpMaxMs | amplitudeMs | tauMs | erpMinMs | cycleMs;
// link delayMs | decrement.maxExtraMs | decrement.tauMs | entry.maxExtraMs | entry.tauMs;
// coupling (target { kind: 'coupling', id }).
export function editCommand(state, target, param, rawValue) {
  const range = RANGES[param];
  if (range === undefined || !Number.isFinite(rawValue)) return null;
  const value = param === 'coupling' ? Math.round(clamp(rawValue, range) * 1e4) / 1e4 : Math.round(clamp(rawValue, range));
  if (target.kind === 'coupling') {
    return state.couplings[target.id] === value ? null : { type: 'setCoupling', couplingId: target.id, value };
  }
  if (target.kind === 'node') {
    const node = state.nodes[target.id];
    if (param === 'cycleMs') return node.cycleMs === null || node.cycleMs === value ? null : { type: 'setAutomaticity', nodeId: target.id, cycleMs: value };
    if (param === 'erpMs' || (param === 'erpMaxMs' && node.restitution === null)) {
      return node.erpMs === value ? null : { type: 'setNodeERP', nodeId: target.id, erpMs: value };
    }
    if (node.restitution === null || !state.v11) return null;
    const law = { ...node.restitution, [param]: value };
    if (param === 'erpMaxMs') law.erpMinMs = Math.min(law.erpMinMs, value);
    if (param === 'erpMinMs') law.erpMinMs = Math.min(value, law.erpMaxMs);
    law.erpMinMs = Math.max(RANGES.erpMinMs[0], law.erpMinMs);
    if (['erpMaxMs', 'amplitudeMs', 'tauMs', 'erpMinMs'].every(key => law[key] === node.restitution[key])) return null;
    return { type: 'setRestitution', nodeId: target.id, ...law };
  }
  const direction = state.links[target.id][target.direction];
  if (param === 'delayMs') {
    return direction.delayMs === value ? null : { type: 'setDirectionDelay', linkId: target.id, direction: target.direction, delayMs: value };
  }
  const [key, field] = param.split('.');
  if (key === 'entry' && !state.v11) return null;
  if (key === 'decrement' && !state.v11) return null; // setDecrement is a 1.1.0 command.
  const current = direction[key] ?? { maxExtraMs: 0, tauMs: 100 };
  const law = { ...current, [field]: value };
  if (direction[key] && law.maxExtraMs === direction[key].maxExtraMs && law.tauMs === direction[key].tauMs) return null;
  return { type: key === 'decrement' ? 'setDecrement' : 'setEntry', linkId: target.id, direction: target.direction, maxExtraMs: law.maxExtraMs, tauMs: law.tauMs };
}

// Apply a command body to the state the way the engine will, so successive
// nudges accumulate before the engine's parameter_changed events arrive.
export function applyCommand(state, body) {
  const synthetic = { type: 'parameter_changed', cause: 'command' };
  switch (body.type) {
    case 'setNodeERP': return applyParameterEvents(state, [{ ...synthetic, parameter: 'erpMs', nodeId: body.nodeId, value: body.erpMs }]);
    case 'setRestitution': {
      const { erpMaxMs, amplitudeMs, tauMs, erpMinMs } = body;
      return applyParameterEvents(state, [{ ...synthetic, parameter: 'restitution', nodeId: body.nodeId, value: { erpMaxMs, amplitudeMs, tauMs, erpMinMs } }]);
    }
    case 'setAutomaticity': return applyParameterEvents(state, [{ ...synthetic, parameter: 'cycleMs', nodeId: body.nodeId, value: body.cycleMs }]);
    case 'setDirectionDelay': return applyParameterEvents(state, [{ ...synthetic, parameter: 'delayMs', linkId: body.linkId, direction: body.direction, value: body.delayMs }]);
    case 'setDecrement':
    case 'setEntry':
      return applyParameterEvents(state, [{ ...synthetic, parameter: body.type === 'setDecrement' ? 'decrement' : 'entry', linkId: body.linkId, direction: body.direction, value: { maxExtraMs: body.maxExtraMs, tauMs: body.tauMs } }]);
    case 'setCoupling': return applyParameterEvents(state, [{ ...synthetic, parameter: 'coupling', couplingId: body.couplingId, value: body.value }]);
    default: return state;
  }
}

// A decrement or entry law with maxExtra 0 is equivalent to none.
const effectiveLaw = law => (law === null || law === undefined || law.maxExtraMs === 0 ? null : law);
const sameLaw = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function defaultCommands(world, state, target) {
  const defaults = createParameterState(world);
  const commands = [];
  if (target.kind === 'node') {
    const now = state.nodes[target.id];
    const was = defaults.nodes[target.id];
    if (was.restitution !== null && !sameLaw(now.restitution, was.restitution)) commands.push({ type: 'setRestitution', nodeId: target.id, ...was.restitution });
    else if (now.erpMs !== was.erpMs) commands.push({ type: 'setNodeERP', nodeId: target.id, erpMs: was.erpMs });
    if (now.cycleMs !== was.cycleMs && was.cycleMs !== null) commands.push({ type: 'setAutomaticity', nodeId: target.id, cycleMs: was.cycleMs });
    return commands;
  }
  if (target.kind === 'coupling') {
    return state.couplings[target.id] === defaults.couplings[target.id] ? [] : [{ type: 'setCoupling', couplingId: target.id, value: defaults.couplings[target.id] }];
  }
  for (const direction of target.direction ? [target.direction] : ['ab', 'ba']) {
    const now = state.links[target.id][direction];
    const was = defaults.links[target.id][direction];
    if (now.delayMs !== was.delayMs) commands.push({ type: 'setDirectionDelay', linkId: target.id, direction, delayMs: was.delayMs });
    if (!sameLaw(effectiveLaw(now.decrement), effectiveLaw(was.decrement))) commands.push({ type: 'setDecrement', linkId: target.id, direction, ...(was.decrement ?? { maxExtraMs: 0, tauMs: 100 }) });
    if (!sameLaw(effectiveLaw(now.entry), effectiveLaw(was.entry))) commands.push({ type: 'setEntry', linkId: target.id, direction, ...(was.entry ?? { maxExtraMs: 0, tauMs: 100 }) });
  }
  return commands;
}

export function modifiedElements(world, state) {
  const defaults = createParameterState(world);
  const nodes = new Set();
  const links = new Set();
  const couplings = new Set();
  for (const [id, node] of Object.entries(state.nodes)) {
    const was = defaults.nodes[id];
    if (node.erpMs !== was.erpMs || node.cycleMs !== was.cycleMs || !sameLaw(node.restitution, was.restitution)) nodes.add(id);
  }
  for (const [id, link] of Object.entries(state.links)) {
    for (const direction of ['ab', 'ba']) {
      const now = link[direction];
      const was = defaults.links[id][direction];
      if (now.delayMs !== was.delayMs || !sameLaw(effectiveLaw(now.decrement), effectiveLaw(was.decrement)) || !sameLaw(effectiveLaw(now.entry), effectiveLaw(was.entry))) links.add(id);
    }
  }
  for (const [id, value] of Object.entries(state.couplings)) if (value !== defaults.couplings[id]) couplings.add(id);
  return { nodes, links, couplings };
}

// ---------------------------------------------------------------------------
// Plot models for a target

function handleParam(handle) {
  if (handle.id === 'erp') return 'erpMs';
  return handle.param;
}

// Data coordinate under the pointer → parameter value for that handle.
function paramFromCoordinate(handle, coordinate, model) {
  if (handle.id === 'amplitude') return model.law.erpMaxMs - coordinate;
  if (handle.offset !== undefined) return coordinate - handle.offset;
  return coordinate;
}

// Time of the last command edit of this element in the events, or null.
function lastEditMs(events, target) {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.type !== 'parameter_changed' || (event.cause !== undefined && event.cause !== 'command')) continue;
    if (target.kind === 'node' && event.nodeId === target.id) return event.tMs;
    if (target.kind === 'link' && event.linkId === target.id && (event.direction === undefined || event.direction === target.direction)) return event.tMs;
  }
  return null;
}

export function cardModel(state, target, { events = [], snapshot = null, tMs = null, labels = {}, compact = true } = {}) {
  const label = labels[target.id] ?? target.id;
  const sinceMs = lastEditMs(events, target);
  const finish = model => ({ ...model, compact });
  if (target.kind === 'node') {
    const node = state.nodes[target.id];
    const live = snapshot?.nodes?.[target.id];
    const diMs = live && live.refractoryUntilMs !== null && tMs !== null && tMs >= live.refractoryUntilMs ? round3(tMs - live.refractoryUntilMs) : null;
    return finish(PLOT_CATALOG.restitution.build({
      sinceMs,
      siteLabel: label,
      law: node.restitution,
      erpMs: node.erpMs,
      dots: restitutionDots(events, target.id),
      live: diMs === null ? null : { diMs },
    }));
  }
  const direction = state.links[target.id][target.direction];
  const ends = snapshot?.links?.[target.id];
  const from = target.from ?? (ends ? (target.direction === 'ab' ? ends.a : ends.b) : null);
  const dots = conductionDots(events, target.id, from);
  return finish(PLOT_CATALOG.conduction.build({
    sinceMs,
    linkLabel: `${label} ${target.direction === 'ab' ? '→' : '←'}`,
    delayMs: snapshot?.links?.[target.id]?.[target.direction]?.delayMs ?? direction.delayMs,
    decrement: effectiveLaw(direction.decrement),
    entry: effectiveLaw(direction.entry),
    dots,
  }));
}

// ---------------------------------------------------------------------------
// DOM component

function ms(value) {
  return value === null || value === undefined ? '—' : `${round3(value)} ms`;
}

export function createInspectorCard(container, {
  world, enqueue, labels = {}, onModifiedChange = null, onClose = null, document: doc = container.ownerDocument,
} = {}) {
  const state = createParameterState(world);
  const linkEnds = Object.fromEntries(world.links.map(link => [link.id, { a: link.a, b: link.b }]));
  let target = null;
  let frame = { events: [], snapshot: null, tMs: null };
  let preview = null;
  let model = null;
  let lastModified = '';

  const el = (tag, attrs = {}, text = null) => {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') node.className = value;
      else node.setAttribute(key, value);
    }
    if (text !== null) node.textContent = text;
    return node;
  };

  const root = el('section', { className: 'lab-card', role: 'dialog', 'aria-labelledby': 'lab-card-title' });
  root.hidden = true;
  const header = el('header', { className: 'lab-card-header' });
  const title = el('h3', { id: 'lab-card-title' });
  const badge = el('span', { className: 'lab-card-modified', title: 'This element differs from the study default' }, 'modified');
  const close = el('button', { type: 'button', className: 'lab-card-close', 'aria-label': 'Close the inspector card' }, '×');
  header.append(title, badge, close);
  const fields = el('dl', { className: 'lab-card-state' });
  const plot = el('div', { className: 'lab-card-plot' });
  const canvas = el('canvas', { 'aria-hidden': 'true' });
  plot.append(canvas);
  const summary = el('p', { className: 'lab-card-summary', 'aria-live': 'polite' });
  const controls = el('div', { className: 'lab-card-fields' });
  const note = el('p', { className: 'lab-card-note' });
  const details = el('details', { className: 'lab-card-table' });
  const detailsSummary = el('summary', {}, 'Data table');
  const table = el('div');
  details.append(detailsSummary, table);
  const reset = el('button', { type: 'button', className: 'lab-card-default' }, 'Study default');
  root.append(header, fields, plot, summary, controls, reset, note, details);
  container.append(root);

  const handleNodes = new Map();
  const inputNodes = new Map();

  function plotRect() {
    const width = canvas.clientWidth || 360;
    const height = canvas.clientHeight || 300;
    return { x: 0, y: 0, width, height };
  }

  function send(body) {
    if (body === null) return;
    // A host that cannot place the command now (paused, not started) returns false:
    // the card then keeps the model as the engine has it.
    if (enqueue(body) === false) {
      render();
      return;
    }
    applyCommand(state, body);
    render();
  }

  function editParam(param, value) {
    send(editCommand(state, target, param, value));
  }

  function currentValue(param) {
    if (target.kind === 'node') {
      const node = state.nodes[target.id];
      if (param === 'erpMs') return node.erpMs;
      if (param === 'cycleMs') return node.cycleMs;
      return node.restitution?.[param] ?? null;
    }
    const direction = state.links[target.id][target.direction];
    if (param === 'delayMs') return direction.delayMs;
    const [key, field] = param.split('.');
    return direction[key]?.[field] ?? null;
  }

  function paramsForTarget() {
    if (target.kind === 'node') {
      const node = state.nodes[target.id];
      const list = node.restitution === null || !state.v11
        ? [['erpMs', 'ERP']]
        : [['erpMaxMs', 'E max'], ['amplitudeMs', 'A'], ['tauMs', 'tau'], ['erpMinMs', 'E min']];
      if (node.cycleMs !== null) list.push(['cycleMs', 'Automatic cycle']);
      return list;
    }
    const list = [['delayMs', 'Delay']];
    if (state.v11) list.push(['decrement.maxExtraMs', 'Decrement'], ['decrement.tauMs', 'Decrement tau'], ['entry.maxExtraMs', 'Entry'], ['entry.tauMs', 'Entry tau']);
    return list;
  }

  function buildControls() {
    controls.replaceChildren();
    inputNodes.clear();
    for (const [param, text] of paramsForTarget()) {
      const labelNode = el('label', { className: 'lab-card-field' }, `${text} (ms) `);
      const input = el('input', { type: 'number', step: '1', min: String(RANGES[param][0]), max: String(RANGES[param][1]) });
      input.addEventListener('change', () => editParam(param, Number(input.value)));
      labelNode.append(input);
      controls.append(labelNode);
      inputNodes.set(param, input);
    }
  }

  function liveFields() {
    const rows = [];
    const snap = frame.snapshot;
    if (target.kind === 'node') {
      const live = snap?.nodes?.[target.id];
      const captures = activationsAt(frame.events, target.id);
      const last = captures.at(-1) ?? null;
      const until = live?.refractoryUntilMs ?? null;
      const di = until !== null && frame.tMs !== null && frame.tMs >= until ? frame.tMs - until : null;
      // EP-relative readouts (creator decision 2026-11-27): intervals, never the run clock.
      const lastAt = live?.lastActivationMs ?? null;
      const since = lastAt !== null && frame.tMs !== null && frame.tMs >= lastAt ? Math.round(frame.tMs - lastAt) : null;
      const cycle = captures.length >= 2 ? Math.round(captures.at(-1).tMs - captures.at(-2).tMs) : null;
      const remaining = until !== null && frame.tMs !== null && frame.tMs < until ? Math.ceil(until - frame.tMs) : null;
      rows.push(['Since last activation', ms(since)]);
      rows.push(['Last cycle length', ms(cycle)]);
      rows.push(['Refractory remaining', remaining === null ? (until === null ? '—' : 'excitable') : ms(remaining)]);
      rows.push(['Recovery', live ? `${Math.round(live.recovery * 100)}%` : '—']);
      rows.push(['Current DI', until !== null && di === null ? 'refractory' : ms(di)]);
      rows.push(['ERP of last capture', ms(last?.erpMs ?? null)]);
      rows.push(['Rested ERP', ms(live?.erpMs ?? state.nodes[target.id].erpMs)]);
    } else {
      const live = snap?.links?.[target.id];
      const direction = live?.[target.direction];
      const from = target.direction === 'ab' ? linkEnds[target.id].a : linkEnds[target.id].b;
      const lastLaunch = conductionDots(frame.events, target.id, from).at(-1) ?? null;
      rows.push(['State', live ? (live.enabled && direction?.enabled ? 'conducting' : 'blocked') : '—']);
      rows.push(['Delay now', ms(direction?.delayMs ?? null)]);
      rows.push(['Last conduction time', ms(lastLaunch?.totalMs ?? null)]);
      rows.push(['Last recovery', ms(lastLaunch?.recoveryMs ?? null)]);
      if (live?.lesion) rows.push(['Lesion', `${Math.round(live.lesion.progress * 100)}% of ${Math.round(live.lesion.completeness * 100)}%`]);
    }
    fields.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  }

  function placeHandles() {
    const rect = plotRect();
    const points = handlePoints(model, rect);
    const seen = new Set();
    for (const handle of points) {
      seen.add(handle.id);
      let node = handleNodes.get(handle.id);
      if (node === undefined) {
        node = el('div', { className: 'lab-card-handle', role: 'slider', tabindex: '0' });
        node.dataset.handle = handle.id;
        attachHandle(node);
        plot.append(node);
        handleNodes.set(handle.id, node);
      }
      const param = handleParam(handle);
      node.setAttribute('aria-label', `${handle.label ?? handle.id}: arrow keys change by 1 ms, Shift for 10 ms`);
      node.setAttribute('aria-valuenow', String(round3(currentValue(param) ?? handle.value)));
      node.setAttribute('aria-valuemin', String(RANGES[param][0]));
      node.setAttribute('aria-valuemax', String(RANGES[param][1]));
      node.style.left = `${handle.px}px`;
      node.style.top = `${handle.py}px`;
    }
    for (const [id, node] of handleNodes) {
      if (!seen.has(id)) {
        node.remove();
        handleNodes.delete(id);
      }
    }
  }

  function handleById(id) {
    return (model?.handles ?? []).find(handle => handle.id === id) ?? null;
  }

  function attachHandle(node) {
    node.addEventListener('keydown', event => {
      const handle = handleById(node.dataset.handle);
      if (handle === null) return;
      const step = event.shiftKey ? 10 : 1;
      const delta = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step }[event.key];
      if (delta === undefined) return;
      event.preventDefault();
      const param = handleParam(handle);
      editParam(param, (currentValue(param) ?? 0) + delta);
    });
    node.addEventListener('pointerdown', event => {
      event.preventDefault();
      node.setPointerCapture?.(event.pointerId);
      preview = { id: node.dataset.handle, value: null };
    });
    node.addEventListener('pointermove', event => {
      if (preview === null || preview.id !== node.dataset.handle) return;
      const handle = handleById(preview.id);
      const box = plot.getBoundingClientRect?.() ?? { left: 0, top: 0 };
      const coordinate = valueAtPixel(model, plotRect(), handle, event.clientX - box.left, event.clientY - box.top);
      preview.value = paramFromCoordinate(handle, coordinate, model);
      node.setAttribute('aria-valuenow', String(Math.round(preview.value)));
      draw(preview.id);
    });
    const finish = () => {
      if (preview === null) return;
      const { id, value } = preview;
      preview = null;
      const handle = handleById(id);
      if (handle !== null && value !== null) editParam(handleParam(handle), value);
      else render();
    };
    node.addEventListener('pointerup', finish);
    node.addEventListener('pointercancel', () => {
      preview = null;
      render();
    });
  }

  function draw(activeHandle = null) {
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;
    const rect = plotRect();
    const dpr = globalThis.devicePixelRatio ?? 1;
    if (canvas.width !== Math.round(rect.width * dpr)) canvas.width = Math.round(rect.width * dpr);
    if (canvas.height !== Math.round(rect.height * dpr)) canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let drawn = model;
    if (preview?.value != null) {
      // Draw the curve the drag would produce, without sending anything yet.
      const handle = handleById(preview.id);
      const trial = JSON.parse(JSON.stringify(state));
      const body = editCommand(trial, target, handleParam(handle), preview.value);
      if (body) applyCommand(trial, body);
      drawn = cardModel(trial, targetWithEnds(), { ...frame, labels });
    }
    drawPlot(ctx, drawn, rect, { activeHandle });
  }

  function targetWithEnds() {
    if (target.kind !== 'link') return target;
    const ends = linkEnds[target.id];
    return { ...target, from: target.direction === 'ab' ? ends.a : ends.b };
  }

  function render() {
    if (target === null) return;
    model = cardModel(state, targetWithEnds(), { ...frame, labels });
    const name = labels[target.id] ?? target.id;
    title.textContent = target.kind === 'node' ? `Site · ${name}` : `Link · ${name} ${target.direction === 'ab' ? '→' : '←'}`;
    const modified = modifiedElements(world, state);
    const isModified = target.kind === 'node' ? modified.nodes.has(target.id) : modified.links.has(target.id);
    badge.hidden = !isModified;
    reset.disabled = !isModified;
    root.classList?.toggle?.('is-modified', isModified);
    summary.textContent = model.summary;
    note.textContent = target.kind === 'link' ? NOTES.conduction : (state.nodes[target.id].restitution ? NOTES.restitution : NOTES.fixed);
    table.innerHTML = tableHtml(model.table);
    for (const [param, input] of inputNodes) input.value = String(currentValue(param) ?? '');
    liveFields();
    placeHandles();
    draw();
    const key = JSON.stringify([[...modified.nodes], [...modified.links], [...modified.couplings]]);
    if (key !== lastModified) {
      lastModified = key;
      onModifiedChange?.(modified);
    }
  }

  close.addEventListener('click', () => api.close());
  reset.addEventListener('click', () => {
    for (const body of defaultCommands(world, state, target)) send(body);
  });

  const api = {
    open(next) {
      target = next.kind === 'link' ? { kind: 'link', id: next.id, direction: next.direction ?? 'ab' } : { kind: next.kind, id: next.id };
      root.hidden = false;
      buildControls();
      render();
    },
    close() {
      target = null;
      root.hidden = true;
      onClose?.();
    },
    // Feed the presentation frame: snapshot = readAt(tMs) and the run's events up to tMs.
    update({ snapshot = null, events = frame.events, tMs = snapshot?.tMs ?? null } = {}) {
      const runId = snapshot?.runId ?? events[0]?.runId ?? frame.runId ?? null;
      if (runId !== (frame.runId ?? runId)) {
        // A fresh run starts from the world as given: forget edits of the old run.
        Object.assign(state, createParameterState(world));
        frame.seq = -1;
        frame.consumed = 0;
      }
      // Event ids are e<seq>, increasing within a run, so a host that prunes old
      // events from the front of its history never replays or skips an edit.
      // Events without an engine id fall back to their position in the array.
      let seq = frame.seq ?? -1;
      const consumed = frame.runId === runId ? (frame.consumed ?? 0) : 0;
      const fresh = [];
      events.forEach((event, index) => {
        const n = /^e\d+$/.test(event.eventId ?? '') ? Number(event.eventId.slice(1)) : null;
        if (n === null ? index >= consumed : n > seq) fresh.push(event);
        if (n !== null) seq = Math.max(seq, n);
      });
      applyParameterEvents(state, fresh);
      frame = { snapshot, events, tMs, seq, consumed: events.length, runId };
      if (!root.hidden) render();
    },
    get target() { return target; },
    get state() { return state; },
    // Programmatic edits for the Lab's model controls: the same logged commands
    // as the card's handles, so they replay and carry across runs.
    edit(editTarget, param, value) {
      const body = editCommand(state, editTarget, param, value);
      if (body === null) return false;
      send(body);
      return true;
    },
    restore(editTarget) {
      for (const body of defaultCommands(world, state, editTarget)) send(body);
    },
    modified: () => modifiedElements(world, state),
    element: root,
  };
  return api;
}
