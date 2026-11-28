import { siteName } from './site-names.js';

const RASTER_WINDOW_MS = 2400;
const MAX_LOG_ROWS = 80;
const COUPLING_MIN_MS = 1;
const COUPLING_MAX_MS = 5000;
const SVG = 'http://www.w3.org/2000/svg';
const MISSING = '—';
const NOTES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

function ms(value) {
  return Number.isFinite(value)
    ? `${value.toLocaleString('en-US', { maximumFractionDigits: 3 })} ms`
    : MISSING;
}

function percent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : MISSING;
}

function timingMark(event) {
  if (event.type === 'activation') return 'accepted';
  if (event.type === 'activation_blocked') return 'blocked';
  if (event.type === 'stimulus_attempted' && event.source === 'stimulus') return 'stimulus';
  return null;
}

function logGroup(event) {
  if (event.type === 'activation') return 'accepted';
  if (event.type === 'activation_blocked') return 'blocked';
  if (event.type.startsWith('conduction_')) return 'propagating';
  return 'other';
}

function target(event) {
  if (event.fromNodeId) return `${event.linkId} · ${siteName(event.fromNodeId)} → ${siteName(event.toNodeId)}`;
  return [siteName(event.nodeId), event.linkId].filter(Boolean).join(' · ') || MISSING;
}

function source(event) {
  if (event.source) return event.source;
  if (event.type.startsWith('conduction_')) return 'conduction';
  if (event.commandId) return 'command';
  return MISSING;
}

function directionText(direction) {
  if (!direction.enabled) return 'Disallowed';
  if (!direction.decrement) return `${ms(direction.delayMs)} base · fixed`;
  const { maxExtraMs, tauMs } = direction.decrement;
  return `${ms(direction.delayMs)} base · max extra ${ms(maxExtraMs)} · τ ${ms(tauMs)}`;
}

function noteIdentity(nodeMusic) {
  if (nodeMusic === null) return 'Silent site';
  if (!nodeMusic) return MISSING;
  const { pitchMidi, pitchHz, voice } = nodeMusic;
  const note = Number.isInteger(pitchMidi) && pitchMidi >= 0
    ? `${NOTES[pitchMidi % 12]}${Math.floor(pitchMidi / 12) - 1}`
    : `MIDI ${pitchMidi}`;
  return `${note} · ${pitchHz.toFixed(1)} Hz · ${voice}`;
}

function visibleHistory(frame, events) {
  const presentedThrough = frame.snapshot?.tMs ?? frame.presentedMs;
  let end = events.length;
  while (end > 0 && events[end - 1].tMs > presentedThrough) end--;
  return events.slice(0, end).filter(event => event.runId === frame.runId);
}

function summarizeNodes(events) {
  const latest = new Map();
  const automaticCycles = new Map();
  const blockedIntervals = new Map();
  for (const event of events) {
    if (event.type === 'activation') latest.set(event.nodeId, event);
    if (event.type === 'activation_blocked' && latest.has(event.nodeId)) {
      blockedIntervals.set(event.eventId, event.tMs - latest.get(event.nodeId).tMs);
    }
    if (event.type === 'parameter_changed' && event.parameter === 'cycleMs') {
      automaticCycles.set(event.nodeId, event.value);
    }
  }
  return { latest, automaticCycles, blockedIntervals };
}

function drawRaster(svg, nodeIds, events, latest, nodeId, presentedMs) {
  const doc = svg.ownerDocument;
  const fragment = doc.createDocumentFragment();
  const width = 556;
  const left = 108;
  const right = 545;
  const top = 22;
  const spacing = 22;
  const bottom = top + nodeIds.length * spacing;
  const start = Math.max(0, presentedMs - RASTER_WINDOW_MS);
  const xAt = time => left + (time - start) / RASTER_WINDOW_MS * (right - left);
  const lanes = new Map(nodeIds.map((id, index) => [id, top + (index + 0.5) * spacing]));

  function draw(tag, attributes, label) {
    const element = doc.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    if (label !== undefined) element.textContent = label;
    fragment.append(element);
  }

  for (const [id, y] of lanes) {
    const selected = id === nodeId;
    if (selected) draw('rect', { x: 0, y: y - 10, width, height: 20, class: 'raster-selected' });
    draw('line', { x1: left, x2: right, y1: y, y2: y, class: 'raster-guide' });
    draw('text', { x: 3, y: y + 4, class: 'raster-site' }, siteName(id));
    const interval = latest.get(id)?.intervalMs;
    if (interval != null) draw('text', { x: left - 8, y: y + 4, 'text-anchor': 'end' }, ms(interval));
  }

  for (const offset of [0, RASTER_WINDOW_MS / 2, RASTER_WINDOW_MS]) {
    const time = start + offset;
    const x = xAt(time);
    draw('line', { x1: x, x2: x, y1: top, y2: bottom, class: 'raster-guide' });
    const anchor = offset === 0 ? 'start' : offset === RASTER_WINDOW_MS ? 'end' : 'middle';
    draw('text', { x, y: bottom + 17, 'text-anchor': anchor }, ms(Math.round(time)));
  }
  const cursorX = xAt(presentedMs);
  draw('line', { x1: cursorX, x2: cursorX, y1: top, y2: bottom, class: 'raster-cursor' });

  for (const event of events) {
    const y = lanes.get(event.nodeId);
    const mark = timingMark(event);
    if (y === undefined || !mark || event.tMs < start || event.tMs > presentedMs) continue;
    const x = xAt(event.tMs);
    if (mark === 'accepted') draw('line', { x1: x, x2: x, y1: y - 5, y2: y + 5, class: 'raster-accepted' });
    if (mark === 'blocked') draw('path', { d: `M${x - 3} ${y - 3}l6 6m0 -6l-6 6`, class: 'raster-blocked' });
    if (mark === 'stimulus') draw('path', { d: `M${x} ${y - 10}l-3 4h6z`, class: 'raster-stimulus' });
  }
  svg.setAttribute('viewBox', `0 0 ${width} ${bottom + 26}`);
  svg.replaceChildren(fragment);
}

function optionList(doc, select, options) {
  select.replaceChildren(...options.map(([value, label]) => {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }));
}

export function createInspector(container, callbacks = {}) {
  container.classList.add('counterpoint-inspector');
  container.innerHTML = `
    <output id="metrics" aria-live="off"></output>
    <div class="inspector-grid">
      <section class="inspector-panel" aria-labelledby="diagnostic-world">
        <h3 id="diagnostic-world">World</h3>
        <dl>
          <dt>Scene</dt><dd data-read="world"></dd>
          <dt>Topology</dt><dd data-read="topology"></dd>
          <dt>Run ID</dt><dd data-read="run"></dd>
        </dl>
        <button type="button" data-control="reset">Reset world</button>
      </section>
      <section class="inspector-panel" aria-labelledby="diagnostic-transport">
        <h3 id="diagnostic-transport">Transport</h3>
        <dl>
          <dt>Playback</dt><dd data-read="transport"></dd>
          <dt>Presented time</dt><dd data-read="presented"></dd>
          <dt>Engine horizon</dt><dd data-read="committed"></dd>
          <dt>Time dilation</dt><dd data-read="dilation"></dd>
          <dt>Audio</dt><dd data-read="audio"></dd>
          <dt>Lookahead (wall)</dt><dd data-read="lookahead"></dd>
          <dt>Late audio events</dt><dd data-read="late"></dd>
          <dt>Frame rate</dt><dd data-read="fps"></dd>
        </dl>
      </section>
      <section class="inspector-panel" aria-labelledby="diagnostic-node">
        <h3 id="diagnostic-node">Selected site</h3>
        <label class="inspector-field">Site <select data-control="node"></select></label>
        <dl>
          <dt>ERP</dt><dd data-read="erp"></dd>
          <dt>Since last activation</dt><dd data-read="last-activation"></dd>
          <dt>Refractory status</dt><dd data-read="refractory"></dd>
          <dt>Recovery before last beat</dt><dd data-read="recovery-before"></dd>
          <dt>Last cycle length</dt><dd data-read="cycle-length"></dd>
          <dt>Automatic cycle</dt><dd data-read="automatic-cycle"></dd>
          <dt>Note identity</dt><dd data-read="note"></dd>
        </dl>
      </section>
      <section class="inspector-panel" aria-labelledby="diagnostic-link">
        <h3 id="diagnostic-link">Selected link</h3>
        <label class="inspector-field">Link <select data-control="link"></select></label>
        <dl>
          <dt>State</dt><dd data-read="link-state"></dd>
          <dt data-read="ab-label"></dt><dd data-read="ab"></dd>
          <dt data-read="ba-label"></dt><dd data-read="ba"></dd>
          <dt>Current transits</dt><dd data-read="transits"></dd>
        </dl>
      </section>
      <section class="inspector-panel" aria-labelledby="diagnostic-protocol">
        <h3 id="diagnostic-protocol">Protocol</h3>
        <p>Selected site <strong data-read="protocol-site"></strong></p>
        <div class="inspector-actions">
          <button type="button" data-control="stimulate">Stimulate selected site</button>
        </div>
        <div data-control="ring-protocol">
          <p>The reference S1/S2 protocol starts a fresh Circulation run and applies both impulses at R0.</p>
          <div class="inspector-actions">
            <label class="inspector-field">Coupling interval (ms)
              <input data-control="coupling" type="number" min="${COUPLING_MIN_MS}" max="${COUPLING_MAX_MS}" step="1" required aria-describedby="inspector-coupling-error">
            </label>
            <button type="button" data-control="guide">Reset and run S1/S2</button>
          </div>
          <p class="inspector-error" id="inspector-coupling-error" aria-live="polite" hidden></p>
        </div>
        <div data-control="conduction-protocol" hidden>
          <p>The Conduction protocol delivers two stimuli from the first site, 250 ms apart.</p>
          <button type="button" data-control="premature">Reset and apply premature stimulus</button>
        </div>
      </section>
      <section class="inspector-panel" aria-labelledby="diagnostic-music">
        <h3 id="diagnostic-music">Music</h3>
        <dl>
          <dt>Palette</dt><dd data-read="palette"></dd>
          <dt>Selected pitch and timbre</dt><dd data-read="music-note"></dd>
          <dt>Master gain</dt><dd data-read="master-gain"></dd>
          <dt>Active voices</dt><dd data-read="voices"></dd>
          <dt>Stolen voices</dt><dd data-read="stolen"></dd>
          <dt>Late audio events</dt><dd data-read="music-late"></dd>
        </dl>
      </section>
      <section class="inspector-panel inspector-wide" aria-labelledby="diagnostic-raster">
        <h3 id="diagnostic-raster">Activation raster</h3>
        <p>Last 2,400 simulated ms · row labels show the most recent cycle length.</p>
        <ul class="inspector-legend" aria-label="Raster symbols">
          <li><span class="raster-key-accepted" aria-hidden="true">│</span> Accepted</li>
          <li><span class="raster-key-blocked" aria-hidden="true">×</span> Blocked</li>
          <li><span class="raster-key-stimulus" aria-hidden="true">▴</span> External stimulus</li>
        </ul>
        <div class="inspector-scroll" tabindex="0" role="region" aria-label="Activation raster">
          <svg data-control="raster" role="img" aria-label="Site activation times. Individual times are available in the event log."></svg>
        </div>
      </section>
      <section class="inspector-panel inspector-wide" aria-labelledby="diagnostic-log">
        <h3 id="diagnostic-log">Event log</h3>
        <fieldset class="inspector-filters">
          <legend>Show event types</legend>
          <label><input type="checkbox" value="accepted" checked> Accepted</label>
          <label><input type="checkbox" value="blocked" checked> Blocked</label>
          <label><input type="checkbox" value="propagating" checked> Propagating</label>
          <label><input type="checkbox" value="other" checked> Other events</label>
        </fieldset>
        <p data-read="log-summary"></p>
        <div class="inspector-scroll inspector-log-scroll" tabindex="0" role="region" aria-label="Event log">
          <table>
            <thead><tr><th scope="col">Time</th><th scope="col">Site / link</th><th scope="col">Event</th><th scope="col">Source</th><th scope="col">Cause</th><th scope="col">Prior interval</th><th scope="col">ID</th></tr></thead>
            <tbody id="log"></tbody>
          </table>
        </div>
      </section>
    </div>`;

  const doc = container.ownerDocument;
  const readings = new Map([...container.querySelectorAll('[data-read]')].map(element => [element.dataset.read, element]));
  const controls = Object.fromEntries([...container.querySelectorAll('[data-control]')].map(element => [element.dataset.control, element]));
  const metrics = container.querySelector('#metrics');
  const log = container.querySelector('#log');
  const filters = [...container.querySelectorAll('.inspector-filters input')];
  const couplingError = container.querySelector('#inspector-coupling-error');
  let currentFrame;
  let currentContext;
  let layoutWorldId;
  let selectedNodeId;
  let selectedLinkId;
  let couplingMs = 240;
  let contextCouplingMs;
  let couplingValid = true;
  let canRun = false;
  let canEdit = false;
  let lastLogKey = null;

  function read(name, value) {
    const element = readings.get(name);
    const text = String(value ?? MISSING);
    if (element.textContent !== text) element.textContent = text;
  }

  function updateActionAvailability() {
    controls.reset.disabled = !canRun;
    controls.stimulate.disabled = !canEdit || !selectedNodeId;
    controls.guide.disabled = !canRun || !couplingValid;
    controls.premature.disabled = !canRun;
  }

  function readCoupling() {
    const value = controls.coupling.valueAsNumber;
    return Number.isInteger(value) && value >= COUPLING_MIN_MS && value <= COUPLING_MAX_MS ? value : null;
  }

  function updateCouplingValidation(showError) {
    const value = readCoupling();
    couplingValid = value !== null;
    if (showError || couplingValid) {
      controls.coupling.setAttribute('aria-invalid', String(!couplingValid));
      couplingError.hidden = couplingValid;
      couplingError.textContent = couplingValid ? '' : `Enter a whole number from ${COUPLING_MIN_MS} to ${COUPLING_MAX_MS} ms.`;
    }
    updateActionAvailability();
    return value;
  }

  function commitCoupling() {
    const value = updateCouplingValidation(true);
    if (value !== null && couplingMs !== value) {
      couplingMs = value;
      callbacks.onProtocolChange?.(value);
    }
    return value !== null;
  }

  function renderLog(events, blockedIntervals) {
    const checked = new Set(filters.filter(item => item.checked).map(item => item.value));
    const matched = events.filter(event => checked.has(logGroup(event)));
    const rows = matched.slice(-MAX_LOG_ROWS).reverse();
    const key = `${currentFrame.runId}:${rows[0]?.eventId}:${rows.at(-1)?.eventId}:${rows.length}:${[...checked].join(',')}`;
    read('log-summary', rows.length ? `${rows.length} most recent of ${matched.length} matching retained events` : 'No matching events yet.');
    if (key === lastLogKey) return;
    lastLogKey = key;
    const fragment = doc.createDocumentFragment();
    for (const event of rows) {
      const row = doc.createElement('tr');
      row.dataset.group = logGroup(event);
      const interval = event.intervalMs ?? blockedIntervals.get(event.eventId);
      for (const value of [ms(event.tMs), target(event), event.type, source(event), event.cause ?? MISSING, ms(interval), event.eventId]) {
        const cell = doc.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      fragment.append(row);
    }
    log.replaceChildren(fragment);
  }

  function render(frame, context = {}) {
    if (!frame?.snapshot) return;
    const snapshot = frame.snapshot;
    const selectedNode = context.selectedNodeId ?? Object.keys(snapshot.nodes)[0];
    const selectedLink = context.selectedLinkId ?? Object.keys(snapshot.links)[0];
    const layoutChanged = layoutWorldId !== snapshot.worldId;
    currentFrame = frame;
    currentContext = context;
    selectedNodeId = selectedNode;
    selectedLinkId = selectedLink;
    canRun = context.started ?? context.transport?.status !== 'idle';
    canEdit = context.transport?.status === 'running';

    if (layoutChanged) {
      layoutWorldId = snapshot.worldId;
      optionList(doc, controls.node, Object.keys(snapshot.nodes).map(id => [id, siteName(id)]));
      optionList(doc, controls.link, Object.entries(snapshot.links).map(([id, { a, b }]) => [id, `${id} · ${siteName(a)}–${siteName(b)}`]));
      controls['ring-protocol'].hidden = layoutWorldId !== 'circulation';
      controls['conduction-protocol'].hidden = layoutWorldId !== 'conduction';
    }
    if (layoutChanged || context.couplingMs !== contextCouplingMs) {
      contextCouplingMs = context.couplingMs;
      couplingMs = context.couplingMs ?? 240;
      controls.coupling.value = String(couplingMs);
      commitCoupling();
    }
    controls.node.value = selectedNodeId ?? '';
    controls.link.value = selectedLinkId ?? '';
    updateActionAvailability();

    const events = visibleHistory(frame, context.events ?? frame.events ?? []);
    const { latest, automaticCycles, blockedIntervals } = summarizeNodes(events);
    const node = snapshot.nodes[selectedNodeId];
    const last = latest.get(selectedNodeId);
    const link = snapshot.links[selectedLinkId];
    const transits = snapshot.activeTransits.filter(transit => transit.linkId === selectedLinkId);
    const note = noteIdentity(context.nodeMusic);
    const audio = context.audioDiagnostics;
    const transport = context.transport;
    const captures = Number.isFinite(context.captureTotal)
      ? context.captureTotal - (context.events?.filter(event => event.type === 'activation' && event.tMs > snapshot.tMs).length ?? 0)
      : events.filter(event => event.type === 'activation').length;

    metrics.textContent = `${captures} captures · ${snapshot.activeTransits.length} traveling waves`;
    read('world', context.worldName ?? snapshot.worldId);
    read('topology', context.topology ?? `${Object.keys(snapshot.nodes).length} sites · ${Object.keys(snapshot.links).length} links`);
    read('run', frame.runId);
    read('transport', transport?.reason ? `${transport.status} · ${transport.reason}` : transport?.status);
    read('presented', ms(frame.presentedMs));
    read('committed', ms(context.committedMs));
    read('dilation', transport ? `${transport.dilation}×${transport.pendingDilation == null ? '' : ` → ${transport.pendingDilation}× queued`}` : MISSING);
    read('audio', context.audioState);
    read('lookahead', ms(context.lookaheadMs));
    read('late', audio?.late);
    read('fps', Number.isFinite(context.fps) ? `${Math.round(context.fps)} fps` : MISSING);
    read('erp', ms(node?.erpMs));
    // EP-relative readouts (creator decision 2026-11-27): intervals, not the run clock.
    read('last-activation', node?.lastActivationMs == null ? 'None' : ms(Math.round(frame.presentedMs - node.lastActivationMs)));
    read('refractory', node ? (node.excitable ? 'Excitable' : `Refractory for ${ms(Math.ceil(node.refractoryUntilMs - frame.presentedMs))} more`) : MISSING);
    read('recovery-before', percent(last?.recoveryBefore));
    read('cycle-length', ms(last?.intervalMs));
    const automatic = automaticCycles.has(selectedNodeId) ? automaticCycles.get(selectedNodeId)
      : context.world?.nodes.find(({ id }) => id === selectedNodeId)?.automaticity?.cycleMs;
    read('automatic-cycle', automatic == null ? 'Off' : ms(automatic));
    read('note', note);
    const noteRow = readings.get('note');
    const hideNote = context.nodeMusic === undefined;
    noteRow.hidden = hideNote;
    if (noteRow.previousElementSibling) noteRow.previousElementSibling.hidden = hideNote;
    read('protocol-site', siteName(selectedNodeId));
    read('link-state', link ? (link.enabled ? 'Enabled' : 'Cut') : MISSING);
    read('ab-label', link ? `${siteName(link.a)} → ${siteName(link.b)}` : 'Forward');
    read('ab', link ? directionText(link.ab) : MISSING);
    read('ba-label', link ? `${siteName(link.b)} → ${siteName(link.a)}` : 'Reverse');
    read('ba', link ? directionText(link.ba) : MISSING);
    read('transits', transits.length
      ? transits.map(transit => `${siteName(transit.fromNodeId)} → ${siteName(transit.toNodeId)} (${ms(transit.departureMs)} → ${ms(transit.arrivalMs)})`).join(' · ')
      : 'None');
    read('palette', context.palette);
    read('music-note', note);
    const masterGain = audio?.masterGain ?? (audio ? (audio.muted ? 0 : audio.volume) : null);
    read('master-gain', Number.isFinite(masterGain) ? `${percent(masterGain)}${audio?.muted ? ' · muted' : ''}` : MISSING);
    read('voices', audio?.activeVoices);
    read('stolen', audio?.stolen);
    read('music-late', audio?.late);

    drawRaster(controls.raster, Object.keys(snapshot.nodes), events, latest, selectedNodeId, frame.presentedMs);
    renderLog(events, blockedIntervals);
  }

  controls.reset.onclick = () => callbacks.onReset?.();
  controls.node.onchange = () => callbacks.onSelectNode?.(controls.node.value);
  controls.link.onchange = () => callbacks.onSelectLink?.(controls.link.value);
  controls.stimulate.onclick = () => callbacks.onStimulus?.(controls.node.value);
  controls.coupling.oninput = () => updateCouplingValidation(false);
  controls.coupling.onchange = commitCoupling;
  controls.coupling.onkeydown = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitCoupling();
    }
  };
  controls.guide.onclick = () => {
    if (commitCoupling()) callbacks.onRunProtocol?.('guide', 'R0', couplingMs);
  };
  controls.premature.onclick = () => callbacks.onRunProtocol?.('premature');
  for (const filter of filters) filter.onchange = () => render(currentFrame, currentContext);

  return { render, dispose: () => container.replaceChildren() };
}
