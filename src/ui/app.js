import { CIRCULATION_S2_MS } from '../worlds/circulation.js';
import { Engine } from '../engine/index.js';
import { createTransport, DEFAULT_PACING_CYCLE, LOOKAHEAD_WALL_MS } from '../runtime/transport.js';
import { createRenderer } from '../visuals/renderer.js';
import { mapActivation, createAudioMixer, describeNodeMusic, musicTableFor } from '../music/index.js';
import { createInspector } from './inspector.js';
import { createInspectorCard } from '../lab/inspector-card.js';
import { DILATIONS, dilationLabel, readPreferences, savePreferences } from './preferences.js';
import { EDITION, editionAllows } from './edition.js';
import { SCENES, SHOW_LABORATORY, SHOW_MUSIC_LABELS, VIEWS, carryCommands, formatFragment, glossaryFor, parseFragment, worldFromState } from './studies.js';
import { createViews } from './views.js';
import { createStudyLab, protocolWorkerUrl } from './lab-panel.js';
import { isDraft, renderNotes } from './notes.js';
import { createLiveCurve } from '../lab/live-curve.js';
import { controlTargets } from '../lab/model-controls.js';
import { pacingReadout } from './pacing-readout.js';
import ECHO_NOTES from '../content/notes/echo.md' with { type: 'text' };

const $ = id => document.getElementById(id);
const WORLDS = SCENES;
const NOTES = { echo: ECHO_NOTES };

const preferences = readPreferences(EDITION.storageSuffix);
let firstNodeCycleMs = DEFAULT_PACING_CYCLE;
const sound = Object.freeze({ palette: 'chamber', voicing: 'balanced' });
const engine = new Engine();
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const EVENT_LIMIT = 4096;

// A pointer that travels this far is a drag, not a tap or a hold: it does nothing.
const DRAG_THRESHOLD = 10;
const HOLD_SITE_MS = 500;
const initialFragment = parseFragment(location.hash);
let worldId = EDITION.worlds ? EDITION.worlds[0] : (initialFragment.study ?? 'conduction');
const launchDilation = worldId === 'circulation' ? preferences.dilation : 8;
let scene = WORLDS[worldId];
let world;
let renderer;
let inspector;
let context;
let mixer;
let musicTable = null;
let card;
let studyLab;
let views;
let view = EDITION.views ? EDITION.views[0] : (initialFragment.view ?? 'network');
let started = false;
let audioCandidate;
let audioClockOffset = 0;
let visibilityChanges = 0;
let runCounter = 0;
let allEvents = [];
let lastFrame;
let discardedEvents = 0;
let captureTotal = 0;
let visualFloorMs = -1;
let selectedNodeId;
let selectedLinkId;
let couplingMs = CIRCULATION_S2_MS;
let gesture;
let lastFpsTime = 0;
let fpsFrames = 0;
let fps = 0;
let lastInspectionTime = -Infinity;
let inspectionDirty = true;
let lastCardUpdate = -Infinity;
let guidedLast = null;
let workerUrl;
let lastPacingReadout = -Infinity;
// Live S1–S2 curve: premature beats of this session, kept across runs, cleared on a world switch.
const liveCurve = createLiveCurve();

function retainEvents(events) {
  for (const event of events) {
    if (event.type === 'activation') captureTotal++;
    allEvents.push(event);
  }
  const overflow = allEvents.length - EVENT_LIMIT;
  if (overflow > 0) {
    discardedEvents += overflow;
    allEvents.splice(0, overflow);
  }
}

function musicOptions() {
  return musicTable ? { ...sound, nodes: musicTable } : sound;
}

const transport = createTransport({
  engine,
  dilation: launchDilation,
  nowSec: () => context ? context.currentTime + audioClockOffset : performance.now() / 1000,
  onCommit(events) {
    retainEvents(events);
    if (!mixer) return;
    const options = musicOptions();
    for (const event of events) {
      const intent = mapActivation(event, options);
      if (intent) mixer.schedule(intent, transport.audioSecAt(event.tMs) - audioClockOffset);
    }
  },
  onSilence({ reason }) {
    mixer?.fence({
      immediate: reason === 'audio-interrupted' || reason === 'page-hidden',
      preserveBoundary: reason === 'pause',
    });
    if (['audio-interrupted', 'page-hidden', 'late-wake'].includes(reason)) {
      visualFloorMs = transport.committedThroughMs() ?? 0;
    }
  },
  onFault(error) { retainEvents(error.events ?? []); },
  onPrelude(events) {
    // A preconditioned run's silent lead-in: kept for the views and the Lab, never sounded.
    retainEvents(events);
  },
  onReset(snapshot) {
    // Keep the finished run's premature beats before its events are dropped.
    if (scene?.study && lastFrame) liveCurve.ingest(allEvents.filter(event => event.runId === lastFrame.runId), lastFrame.presentedMs);
    allEvents = [];
    discardedEvents = 0;
    captureTotal = 0;
    visualFloorMs = -1;
    lastFrame = undefined;
    cancelGesture();
    renderer.clearGestures();
    mixer?.beginRun(snapshot.runId);
    inspectionDirty = true;
    lastCardUpdate = -Infinity;
  },
  onStateChange(state) {
    updateButtons();
    if (state.status === 'running' && $('status').textContent.includes('Resume when ready.')) {
      $('status').textContent = WORLDS[worldId].status;
    }
    if (state.reason && state.reason !== 'pause' && state.status === 'paused') {
      const explanation = {
        'page-hidden': 'Paused while away.',
        'audio-interrupted': 'Sound was interrupted.',
        'late-wake': 'The playback clock was interrupted.',
      }[state.reason] ?? 'Playback was interrupted.';
      $('status').textContent = `${explanation} Resume when ready.`;
    }
    if (state.status === 'faulted') {
      $('status').textContent = `The circuit stopped at ${state.error?.tMs ?? '?'} ms. Reset to begin a fresh run.`;
    }
  },
});

const GUIDED = ['find-echo', 'find-arrhythmia'];

// One press shows the behaviour: nominal model, the drive already given, and the
// decisive S2 at the middle of its window (src/worlds/echo.js).
function guidedProtocol(kind) {
  const protocol = scene.presentation.protocols.find(entry => entry.id === kind);
  guidedLast = protocol.lab;
  return protocol;
}

function startRun(kind = 'default', nodeId = selectedNodeId, interval = couplingMs, autoStart = started) {
  if (kind === 'single' && !world.nodes.some(node => node.id === nodeId)) return;
  if (kind === 'guide' && (worldId !== 'circulation' || !world.nodes.some(node => node.id === nodeId)
    || !Number.isInteger(interval) || interval < 1 || interval > 5000)) return;
  if (kind === 'premature' && worldId !== 'conduction') return;
  if (GUIDED.includes(kind) && worldId !== 'echo') return;
  const runId = `run-${++runCounter}`;
  const commands = [];
  const initialPacing = kind === 'default' && worldId !== 'circulation'
    ? { nodeId: world.nodes[0].id, cycleMs: firstNodeCycleMs }
    : null;
  if (initialPacing) selectNode(initialPacing.nodeId);
  const stimulus = (commandId, nodeId, tMs) => ({ commandId, type: 'stimulate', nodeId, tMs });
  let status = WORLDS[worldId].status;
  let fromMs = 0;
  if (kind === 'single') {
    commands.push(stimulus('protocol-s1', nodeId, 0));
    status = 'One impulse travels through the circuit.';
  } else if (kind === 'guide' && worldId === 'circulation') {
    commands.push(stimulus('protocol-s1', nodeId, 0), stimulus('protocol-s2', nodeId, interval));
    status = 'Two impulses. A chance to keep going.';
  } else if (kind === 'premature' && worldId === 'conduction') {
    const firstNode = world.nodes[0].id;
    commands.push(stimulus('protocol-s1', firstNode, 0), stimulus('protocol-premature', firstNode, 250));
    status = 'An early impulse takes the slower path.';
  } else if (GUIDED.includes(kind)) {
    const protocol = guidedProtocol(kind);
    commands.push(...protocol.commands());
    fromMs = protocol.presentFromMs;
    status = kind === 'find-echo'
      ? `Nominal model, paced at 600 ms. Next: an early beat at ${protocol.s2} ms gives one echo.`
      : `Nominal model, paced at 600 ms. Next: an early beat at ${protocol.s2} ms starts reentry.`;
  }
  if (!GUIDED.includes(kind)) guidedLast = null;
  // The player's model edits carry into the new run as logged commands at t = 0;
  // the guided runs start from the nominal model instead.
  if (card && !GUIDED.includes(kind)) {
    carryCommands(scene.preset ?? world, card.state).forEach((body, index) => commands.push({ ...body, commandId: `carry-${index + 1}`, tMs: 0 }));
  }
  $('status').textContent = started ? status : WORLDS[worldId].topology;
  transport.reset(world, runId, {
    commands, fromMs, initialPacing, start: autoStart && !document.hidden && (!context || context.state === 'running'),
  });
  updateButtons();
  updateGuidedReadout();
  if (!$('lab').hidden) {
    lastFrame = transport.frame();
    updateInspection(lastFrame, performance.now());
  }
}

function updateGuidedReadout() {
  if (!studyLab) return;
  studyLab.setGuided(guidedLast ? `Last guided run: ${guidedLast}.` : '');
}

function updateFragment() {
  // A single-world edition has nothing to put in the address.
  if (EDITION.worlds) return;
  const fragment = formatFragment({ study: worldId === 'conduction' ? null : worldId, view });
  if (location.hash !== fragment) history.replaceState(null, '', fragment || `${location.pathname}${location.search}`);
}

function labOpen() {
  return !$('lab').hidden;
}

function chooseWorld(id, initial = false) {
  if (!Object.hasOwn(WORLDS, id) || !editionAllows(EDITION.worlds, id) || (id === worldId && selectedNodeId)) return;
  const autoStart = initial || transport.status === 'running';
  const settings = WORLDS[id];
  const nextWorld = settings.create();
  const nextRenderer = createRenderer($('canvas'), nextWorld, {
    reducedMotion: motion.matches, layout: settings.presentation?.layout ?? null,
  });
  worldId = id;
  scene = settings;
  world = nextWorld;
  renderer = nextRenderer;
  musicTable = musicTableFor(world, settings.presentation);
  selectedNodeId = world.nodes[0].id;
  $('pacing-cycle').value = String(id === 'circulation' ? preferences.pacingCycleMs : firstNodeCycleMs);
  renderer.setSelected(selectedNodeId);
  selectedLinkId = world.links[0].id;
  guidedLast = null;
  for (const button of $('worlds').children) {
    button.setAttribute('aria-pressed', String(button.dataset.world === worldId));
  }
  $('canvas').setAttribute('aria-label', settings.topology + ' Use the site buttons to interact.');
  $('single').hidden = $('guide').hidden = id !== 'circulation';
  $('premature').hidden = id !== 'conduction';
  $('find-echo').hidden = $('find-arrhythmia').hidden = id !== 'echo';
  setupCard();
  views.configure(settings, world, { lab: labOpen() });
  buildSiteButtons();
  if (studyLab) setupStudyLab();
  $('lab-study').hidden = !settings.study;
  resize();
  startRun(initial && id === 'circulation' ? 'single' : 'default', selectedNodeId, couplingMs, autoStart);
  // After the reset, which may have kept the old world's last run, start the curve afresh.
  liveCurve.clear();
  updateFragment();
}

function setupCard() {
  card?.close();
  $('card-layer').replaceChildren();
  card = undefined;
  // Every world can be inspected and tuned (creator decision 2026-11-27).
  card = createInspectorCard($('card-layer'), {
    world,
    document,
    labels: scene.labels?.lab ?? {},
    enqueue(body) {
      const command = transport.submit(body);
      if (!command) {
        $('status').textContent = 'Resume to change the model.';
        return false;
      }
      inspectionDirty = true;
      return true;
    },
    onModifiedChange: modified => renderer.markModified(modified),
    onClose: () => {
      $('card-layer').classList.remove('open');
      lastFocus?.focus?.({ preventScroll: true });
    },
  });
}

let lastFocus = null;
function openCard(target) {
  if (!card) return;
  lastFocus = document.activeElement;
  if (target.kind === 'node') selectNode(target.id);
  else selectLink(target.id);
  const link = target.kind === 'link' ? world.links.find(entry => entry.id === target.id) : null;
  card.open(link ? { kind: 'link', id: link.id, direction: link.ab.enabled ? 'ab' : 'ba' } : target);
  $('card-layer').classList.add('open');
  lastCardUpdate = -Infinity;
  if (lastFrame) updateCard(lastFrame, performance.now());
  card.element.querySelector('.lab-card-close')?.focus({ preventScroll: true });
}

function visibleEvents(frame) {
  const through = frame.presentedMs;
  let end = allEvents.length;
  while (end > 0 && allEvents[end - 1].tMs > through) end--;
  return allEvents.slice(0, end).filter(event => event.runId === frame.runId);
}

function updateCard(frame, now) {
  if (!card || !frame.snapshot) return;
  const open = card.target !== null;
  if (now - lastCardUpdate < (open ? 100 : 250)) return;
  lastCardUpdate = now;
  const events = visibleEvents(frame);
  if (scene.study) liveCurve.ingest(events, frame.presentedMs);
  card.update({ snapshot: frame.snapshot, events, tMs: frame.presentedMs });
  renderer.markModified(card.modified());
  if (studyLab && labOpen()) studyLab.update({ events, snapshot: frame.snapshot, tMs: frame.presentedMs, state: card.state, curvePoints: liveCurve.points });
}

function setupStudyLab() {
  if (!scene.study) return;
  studyLab.setScene(scene, world, { currentWorld: () => worldFromState(scene.preset, card.state) });
  studyLab.setGlossary(glossaryFor(scene), worldId);
  updateGuidedReadout();
}

function ensureStudyLab() {
  if (studyLab) return;
  workerUrl ??= protocolWorkerUrl(document);
  studyLab = createStudyLab($('lab-study'), {
    workerUrl, onDownload: download, onNotes: openNotes,
    getModelState: () => card?.state ?? null,
    // Model controls go through the card's logged commands (replayable, carried across runs).
    onModelEdit(target, param, value) {
      if (!card || transport.status !== 'running') return false;
      card.edit(target, param, value);
      inspectionDirty = true;
      lastCardUpdate = -Infinity;
      return true;
    },
    onModelRestore(controls) {
      if (!card || transport.status !== 'running') return false;
      for (const target of controlTargets(controls)) card.restore(target);
      lastCardUpdate = -Infinity;
      return true;
    },
  });
  setupStudyLab();
}

function updateButtons() {
  const running = transport.status === 'running';
  if (!running) cancelGesture();
  const pacing = transport.state().pacing;
  for (const button of $('sites').children) {
    button.disabled = !running;
    button.setAttribute('aria-label', `${pacing ? 'Pace from' : 'Stimulate'} site ${siteLabel(button.dataset.site)}. Press I to inspect it.`);
  }
  $('protocol-hint').textContent = pacing ? 'Tap a site to pace from it · Hold a site to inspect it' : scene.hint;
  for (const id of ['single', 'guide', 'premature', 'find-echo', 'find-arrhythmia', 'reset']) $(id).disabled = !started;
  $('pause').textContent = transport.status === 'pausing' ? 'Pausing…' : running ? 'Pause' : 'Resume';
  $('pause').disabled = !started || ['pausing', 'faulted'].includes(transport.status);
  $('pacing-toggle').textContent = pacing ? 'Stop pacing' : 'Pace';
  $('pacing-toggle').setAttribute('aria-pressed', String(Boolean(pacing)));
  $('pacing-toggle').disabled = !pacing && !running;
  lastPacingReadout = -Infinity;
}

function updatePacingReadout(frame, now) {
  if (now - lastPacingReadout < 150) return;
  lastPacingReadout = now;
  const pacing = transport.state().pacing;
  if (!pacing) { $('pacing-readout').textContent = ''; return; }
  const result = pacingReadout(allEvents, { worldId, presentedMs: frame.presentedMs, fromMs: pacing.fromMs, pacingNodeId: pacing.nodeId });
  const prefix = `${pacing.nodeId} · ${pacing.cycleMs} ms`;
  if (!result) { $('pacing-readout').textContent = prefix; return; }
  const ratio = result.ratio ? `A:H ${result.ratio}${result.kind === 'wenckebach' ? ' · Wenckebach' : ''}` : 'A:H measuring…';
  const ah = result.lastBlocked ? 'last beat blocked' : result.lastAhMs === null ? 'A–H —' : `A–H ${Math.round(result.lastAhMs)} ms`;
  $('pacing-readout').textContent = `${prefix} · ${ratio} · ${ah}`;
}

function updateSoundButton() {
  const button = $('sound');
  const label = preferences.muted ? 'Unmute sound' : 'Mute sound';
  button.classList.toggle('is-muted', preferences.muted);
  button.setAttribute('aria-label', label);
  button.title = label;
}

async function enableAudio() {
  if (preferences.muted || context || document.hidden) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    audioCandidate ??= new AudioContext();
    if (audioCandidate.state !== 'running') await audioCandidate.resume();
    if (context || preferences.muted || document.hidden || audioCandidate.state !== 'running') return;
    const nextMixer = createAudioMixer(audioCandidate, { volume: preferences.volume });
    audioClockOffset = performance.now() / 1000 - audioCandidate.currentTime;
    context = audioCandidate;
    mixer = nextMixer;
    if (transport.runId) mixer.beginRun(transport.runId);
    if (transport.status === 'running') {
      // The transport already committed a short lookahead while sound was locked.
      // Schedule only the notes whose playback time has not passed.
      const audioNow = context.currentTime;
      const options = musicOptions();
      for (const event of allEvents) {
        const at = transport.audioSecAt(event.tMs) - audioClockOffset;
        if (at >= audioNow) mixer.schedule(mapActivation(event, options), at);
      }
    }
    context.onstatechange = () => {
      if (['suspended', 'interrupted'].includes(context.state)) transport.interrupt('audio-interrupted');
    };
  } catch {
    // Autoplay can be blocked. The simulation keeps running on its own clock.
  }
}

function selectNode(nodeId) {
  if (!world.nodes.some(node => node.id === nodeId)) return;
  selectedNodeId = nodeId;
  renderer.setSelected(nodeId);
  inspectionDirty = true;
}

function selectLink(linkId) {
  if (!world.links.some(link => link.id === linkId)) return;
  selectedLinkId = linkId;
  inspectionDirty = true;
}

function stimulate(nodeId) {
  if (transport.status !== 'running' || !world.nodes.some(node => node.id === nodeId)) return;
  selectNode(nodeId);
  const command = transport.submit({ type: 'stimulate', nodeId });
  if (command) renderer.markGesture(nodeId, command.commandId, command.tMs, command.runId);
}

function activateSite(nodeId) {
  if (!transport.state().pacing) {
    stimulate(nodeId);
    return;
  }
  if (transport.status !== 'running') return;
  selectNode(nodeId);
  transport.setPacingSite(nodeId);
}

function siteLabel(id) {
  return scene.labels?.plain?.[id] ? `${scene.labels.plain[id]} (${id})` : id;
}

function buildSiteButtons() {
  $('sites').replaceChildren();
  for (const { id } of world.nodes) {
    const button = document.createElement('button');
    button.className = 'site';
    button.disabled = true;
    button.textContent = id;
    button.dataset.site = id;
    // Pointer activation is handled on the stage so a stroke can start on a site.
    button.onclick = event => { if (!event.detail) activateSite(id); };
    button.onfocus = () => selectNode(id);
    button.onkeydown = event => {
      if ((event.key === 'i' || event.key === 'I') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        openCard({ kind: 'node', id });
      }
    };
    $('sites').append(button);
  }
}

function resize() {
  renderer.resize();
  views.resize();
  for (const button of $('sites').children) {
    const point = renderer.nodePosition(button.dataset.site ?? button.textContent);
    if (!point) continue;
    button.style.left = `${point.x}px`;
    button.style.top = `${point.y}px`;
  }
}

function setView(next) {
  if (!VIEWS.includes(next) || !editionAllows(EDITION.views, next)) return;
  view = next;
  views.view = next;
  for (const button of $('views').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.view === view));
  const network = view === 'network';
  $('canvas').hidden = !network;
  $('view-canvas').hidden = network;
  $('sites').hidden = !network;
  stage.classList.toggle('alt-view', !network);
  $('view-canvas').setAttribute('aria-label', view === 'ladder'
    ? 'Ladder: each row is a site, time runs left to right, and each sloping line is a wave travelling between sites.'
    : 'Staves: one channel per audible site with synthetic electrograms. Drag across to place calipers.');
  cancelGesture();
  views.resize();
  updateFragment();
}

function canvasPoint(event) {
  const rect = $('canvas').getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function cancelGesture() {
  if (gesture?.timer) clearTimeout(gesture.timer);
  gesture = undefined;
}

function trackGesture(event) {
  const active = gesture;
  if (active?.pointerId !== event.pointerId) return;
  const samples = event.getCoalescedEvents?.() ?? [];
  for (const sample of [...samples, event]) {
    if (gesture !== active) return;
    const point = canvasPoint(sample);
    if (point.x === active.last.x && point.y === active.last.y) continue;
    if (active.held) {
      active.last = point;
      continue;
    }
    if (!active.dragged) {
      active.travel += Math.hypot(point.x - active.last.x, point.y - active.last.y);
      if (active.travel >= DRAG_THRESHOLD) {
        // Connections can no longer be cut (creator decision 2026-11-27): a drag
        // simply cancels the tap or hold.
        active.dragged = true;
        if (active.timer) clearTimeout(active.timer);
        active.timer = null;
      }
    }
    active.previous = active.last;
    active.last = point;
  }
}

// Press and hold: a site or a connection opens the inspector card (every world).
// A drag cancels a hold and does nothing.
function armHold(active, point) {
  const link = active.site ? null : renderer.hitTestLink(point.x, point.y);
  if (!active.site && !link) return;
  active.timer = setTimeout(() => {
    if (gesture !== active || active.dragged) return;
    active.held = true;
    active.timer = null;
    if (active.site) openCard({ kind: 'node', id: active.site });
    else openCard({ kind: 'link', id: link });
  }, HOLD_SITE_MS);
}

const stage = $('stage');
stage.addEventListener('pointerdown', event => {
  if (view !== 'network') return;
  if (gesture || !event.isPrimary || event.button !== 0 || transport.status !== 'running') return;
  const point = canvasPoint(event);
  const site = renderer.hitTest(point.x, point.y);
  gesture = { pointerId: event.pointerId, last: point, travel: 0, dragged: false, site, held: false, timer: null };
  armHold(gesture, point);
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener('pointermove', trackGesture);
stage.addEventListener('pointerup', event => {
  if (gesture?.pointerId !== event.pointerId) return;
  trackGesture(event);
  if (!gesture) return;
  const { site, dragged, held } = gesture;
  cancelGesture();
  if (site && !dragged && !held) activateSite(site);
});
for (const type of ['pointercancel', 'lostpointercapture']) {
  stage.addEventListener(type, event => {
    if (gesture?.pointerId === event.pointerId) cancelGesture();
  });
}

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = event.target?.tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || event.target?.isContentEditable) return;
  if (event.target?.getAttribute?.('role') === 'slider') return;
  if (event.key === 'Escape' && card?.target) card.close();
});

function updateInspection(frame, now) {
  if ($('lab').hidden || (!inspectionDirty && now - lastInspectionTime < 120)) return;
  lastInspectionTime = now;
  inspectionDirty = false;
  const settings = WORLDS[worldId];
  inspector ??= createInspector($('lab-content'), {
    onStimulus: stimulate,
    onSelectNode: selectNode,
    onSelectLink: selectLink,
    onProtocolChange(interval) { couplingMs = interval; inspectionDirty = true; },
    onRunProtocol: startRun,
    onReset: () => startRun(),
  });
  inspector.render(frame, {
    world,
    worldName: settings.name,
    started,
    topology: settings.topology,
    events: allEvents,
    captureTotal,
    transport: transport.state(),
    committedMs: transport.committedThroughMs(),
    lookaheadMs: LOOKAHEAD_WALL_MS,
    audioState: context?.state ?? 'silent',
    audioDiagnostics: mixer?.diagnostics(),
    ...sound,
    volume: preferences.volume,
    muted: preferences.muted,
    fps,
    selectedNodeId,
    selectedLinkId,
    couplingMs,
    nodeMusic: SHOW_MUSIC_LABELS ? describeNodeMusic(worldId, selectedNodeId, musicOptions()) : undefined,
  });
}

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
}

function openNotes() {
  const text = NOTES[worldId];
  if (!text) return;
  $('notes-body').innerHTML = renderNotes(text);
  $('notes-title').textContent = `${scene.numeral} · ${scene.name} · liner notes`;
  document.querySelector('#notes-sheet .draft-mark').hidden = !isDraft(text);
  const sheet = $('notes-sheet');
  if (typeof sheet.showModal === 'function') sheet.showModal();
  else sheet.setAttribute('open', '');
  $('notes-close').focus({ preventScroll: true });
}

$('sound').onclick = () => {
  preferences.muted = !preferences.muted;
  mixer?.setMuted(preferences.muted);
  savePreferences(preferences);
  updateSoundButton();
  if (!preferences.muted) return enableAudio();
};
const unlockSound = event => { if (!event.target?.closest?.('#sound')) void enableAudio(); };
document.addEventListener('click', unlockSound, true);
document.addEventListener('keydown', unlockSound, true);
$('pause').onclick = async () => {
  if (transport.status === 'running') {
    transport.pause();
    return;
  }
  const runId = transport.runId;
  const visibilityAtRequest = visibilityChanges;
  try {
    if (context) await context.resume();
    if (document.hidden || visibilityAtRequest !== visibilityChanges || (context && context.state !== 'running')) return;
    if (runId !== transport.runId || !['paused', 'idle'].includes(transport.status)) return;
    mixer?.beginRun(runId);
    transport.resume();
  } catch (error) {
    $('status').textContent = `Sound could not resume. ${error.message}`;
  }
};
$('single').onclick = () => startRun('single', 'R0');
$('guide').onclick = () => startRun('guide', 'R0', CIRCULATION_S2_MS);
$('premature').onclick = () => startRun('premature');
$('find-echo').onclick = () => startRun('find-echo');
$('find-arrhythmia').onclick = () => startRun('find-arrhythmia');
$('reset').onclick = () => startRun();
function changePacingCycle(value) {
  const cycleMs = transport.setPacingCycle(value);
  $('pacing-cycle').value = String(cycleMs);
  if (worldId === 'circulation') {
    preferences.pacingCycleMs = cycleMs;
    savePreferences(preferences);
  } else {
    firstNodeCycleMs = cycleMs;
  }
  return cycleMs;
}
$('pacing-cycle').onchange = () => changePacingCycle($('pacing-cycle').value);
$('pacing-minus').onclick = () => changePacingCycle(Number($('pacing-cycle').value) - 10);
$('pacing-plus').onclick = () => changePacingCycle(Number($('pacing-cycle').value) + 10);
$('pacing-toggle').onclick = () => {
  if (transport.state().pacing) transport.stopPacing();
  else {
    const cycleMs = changePacingCycle($('pacing-cycle').value);
    transport.startPacing(selectedNodeId, cycleMs);
  }
};
$('notes-close').onclick = () => $('notes-sheet').close?.() ?? $('notes-sheet').removeAttribute('open');
$('notes-sheet').addEventListener('click', event => { if (event.target === $('notes-sheet')) $('notes-sheet').close(); });
// An edition shows only its worlds and views; with one of either, the menu goes too.
if (EDITION.worlds) {
  $('worlds').replaceChildren(...[...$('worlds').children].filter(button => EDITION.worlds.includes(button.dataset.world)));
  $('worlds').hidden = EDITION.worlds.length < 2;
}
if (EDITION.views) $('views').hidden = EDITION.views.length < 2;
for (const button of $('worlds').children) button.onclick = () => chooseWorld(button.dataset.world);
for (const button of $('views').querySelectorAll('button')) button.onclick = () => setView(button.dataset.view);
$('dilation').replaceChildren(...DILATIONS.map(value => {
  const option = document.createElement('option');
  option.value = String(value);
  option.textContent = dilationLabel(value);
  return option;
}));
$('dilation').value = String(launchDilation);
$('dilation').onchange = () => {
  preferences.dilation = Number($('dilation').value);
  transport.setDilation(preferences.dilation);
  savePreferences(preferences);
};
$('lab-toggle').hidden = !SHOW_LABORATORY;
$('lab-toggle').onclick = () => {
  const open = $('lab').hidden;
  $('lab').hidden = !open;
  $('lab-toggle').setAttribute('aria-expanded', String(open));
  views.configure(scene, world, { lab: open });
  if (open && scene.study) ensureStudyLab();
  if (open && lastFrame) {
    inspectionDirty = true;
    lastCardUpdate = -Infinity;
    updateInspection(lastFrame, performance.now());
    updateCard(lastFrame, performance.now());
    studyLab?.redraw();
  }
};
$('export').onclick = () => {
  const data = {
    origin: 'actual-engine', contract: world.contractVersion ?? '1.0.0', runId: transport.runId, world,
    presentedMs: transport.presentedMs(), committedMs: transport.committedThroughMs(),
    retentionLimit: EVENT_LIMIT, discardedEvents, commands: transport.commandLog(),
    discardedCommands: transport.discardedCommandCount, lastInterruption: transport.lastInterruption,
    events: allEvents,
  };
  download('counterpoint-events.json', JSON.stringify(data, null, 2), 'application/json');
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    visibilityChanges++;
    if (started) transport.interrupt('page-hidden');
  }
});
const applyMotion = event => {
  renderer?.setReducedMotion(event.matches);
  views?.setReducedMotion(event.matches);
};
if (motion.addEventListener) motion.addEventListener('change', applyMotion);
else motion.addListener?.(applyMotion);

try {
  views = createViews($('view-canvas'), { reducedMotion: motion.matches });
  const startWorld = worldId;
  worldId = null;
  started = true;
  chooseWorld(startWorld, true);
  $('performance').hidden = false;
  updateSoundButton();
  void enableAudio();
  setView(view);
  if (typeof ResizeObserver === 'function') {
    const stageObserver = new ResizeObserver(resize);
    stageObserver.observe(stage);
    stageObserver.observe($('view-canvas'));
  } else window.addEventListener('resize', resize);
} catch (error) {
  console.warn(error);
  $('status').textContent = 'The artwork could not start. A browser with Canvas 2D is required.';
  $('sound').disabled = $('lab-toggle').disabled = true;
  for (const button of $('worlds').children) button.disabled = true;
}

function draw(now) {
  try {
    fpsFrames++;
    if (now - lastFpsTime >= 1000) {
      fps = fpsFrames * 1000 / (now - lastFpsTime);
      fpsFrames = 0;
      lastFpsTime = now;
    }
    const frame = transport.frame();
    lastFrame = frame;
    if (frame.snapshot) {
      const events = visualFloorMs < 0 ? allEvents : allEvents.filter(event => event.tMs > visualFloorMs);
      if (view === 'network') {
        renderer.render(frame.snapshot, events, frame.presentedMs);
      } else {
        views.draw({ events, presentedMs: frame.presentedMs, lab: labOpen() });
      }
      updateCard(frame, now);
    }
    updateInspection(frame, now);
    updatePacingReadout(frame, now);
  } catch (error) {
    $('status').textContent = error.message;
    console.error(error);
  }
  requestAnimationFrame(draw);
}
if (renderer) requestAnimationFrame(draw);

window.counterpoint = {
  engine,
  transport,
  get events() { return allEvents; },
  get mixer() { return mixer; },
  get retention() { return { discardedEvents, captureTotal, retained: allEvents.length }; },
  get worldId() { return worldId; },
  get view() { return view; },
  get card() { return card; },
  get studyLab() { return studyLab; },
  get views() { return views; },
  get musicTable() { return musicTable; },
  get liveCurve() { return liveCurve.points; },
  get selectedSite() { return renderer?.selected ?? null; },
};
