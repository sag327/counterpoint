import { Engine } from '../engine/index.js';
import { stillnessEnvelope } from '../engine/laws.js';
import { createTransport, LOOKAHEAD_WALL_MS } from '../runtime/transport.js';
import { createRenderer } from '../visuals/renderer.js';
import { mapActivation, createAudioMixer, describeNodeMusic, musicTableFor, PALETTES, CHAMBER_VOICINGS } from '../music/index.js';
import { createInspector } from './inspector.js';
import { createInspectorCard } from '../lab/inspector-card.js';
import { DILATIONS, dilationLabel, readPreferences, savePreferences } from './preferences.js';
import { SCENES, SHOW_MUSIC_LABELS, VIEWS, carryCommands, formatFragment, glossaryFor, parseFragment, worldFromState } from './studies.js';
import { createViews } from './views.js';
import { createStudyLab, protocolWorkerUrl } from './lab-panel.js';
import { isDraft, renderNotes } from './notes.js';
import { createLiveCurve } from '../lab/live-curve.js';
import { controlTargets } from '../lab/model-controls.js';
import ECHO_NOTES from '../content/notes/echo.md' with { type: 'text' };

const $ = id => document.getElementById(id);
const WORLDS = SCENES;
const NOTES = { echo: ECHO_NOTES };

const preferences = readPreferences(PALETTES, CHAMBER_VOICINGS);
const engine = new Engine();
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const EVENT_LIMIT = 4096;
const GUIDE_COUPLING_MS = 240;
// A pointer that travels this far is a drag, not a tap or a hold: it does nothing.
const DRAG_THRESHOLD = 10;
const HOLD_SITE_MS = 500;
const HOLD_CENTRE_MS = 600;
// "Find the chord" starts at the jump: in the shipped tuning S2 from 299 to 265 ms
// sustains circulation (docs/runs/studies-01.md); S3 follows at the same coupling.
const CHORD_STEPS = Object.freeze({ from: 300, to: 240, step: -10 });
const initialFragment = parseFragment(location.hash);
let worldId = initialFragment.study ?? 'conduction';
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
let view = initialFragment.view ?? 'network';
let started = false;
let beginning = false;
let visibilityChanges = 0;
let runCounter = 0;
let allEvents = [];
let lastFrame;
let discardedEvents = 0;
let captureTotal = 0;
let visualFloorMs = -1;
let selectedNodeId;
let selectedLinkId;
let couplingMs = GUIDE_COUPLING_MS;
let gesture;
let lastFpsTime = 0;
let fpsFrames = 0;
let fps = 0;
let lastInspectionTime = -Infinity;
let inspectionDirty = true;
let lastCardUpdate = -Infinity;
let stillnessDoses = [];
let guidedNext = { 'find-echo': 0, 'find-chord': 0 };
let guidedLast = null;
let workerUrl;
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
  return musicTable ? { ...preferences, nodes: musicTable } : preferences;
}

const transport = createTransport({
  engine,
  dilation: preferences.dilation,
  nowSec: () => context ? context.currentTime : performance.now() / 1000,
  onCommit(events) {
    retainEvents(events);
    if (!mixer) return;
    const options = musicOptions();
    for (const event of events) {
      const intent = mapActivation(event, options);
      if (intent) mixer.schedule(intent, transport.audioSecAt(event.tMs));
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
    stillnessDoses = [];
    renderer.clearGestures();
    renderer.setDim(0);
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

function guidedCommands(kind) {
  const protocol = scene.presentation.protocols.find(entry => entry.id === kind);
  const steps = kind === 'find-echo' ? protocol.steps : CHORD_STEPS;
  const count = Math.floor((steps.to - steps.from) / steps.step) + 1;
  const index = guidedNext[kind] % count;
  guidedNext[kind] = index + 1;
  const s2 = steps.from + index * steps.step;
  const commands = kind === 'find-echo' ? protocol.commands(s2) : protocol.commands(s2, s2);
  guidedLast = { kind, label: protocol.lab, s2, s3: kind === 'find-chord' ? s2 : null };
  return commands;
}

function startRun(kind = 'quiet', nodeId = selectedNodeId, interval = couplingMs, autoStart = started) {
  if (kind === 'single' && !world.nodes.some(node => node.id === nodeId)) return;
  if (kind === 'guide' && (worldId !== 'circulation' || !world.nodes.some(node => node.id === nodeId)
    || !Number.isInteger(interval) || interval < 1 || interval > 5000)) return;
  if (kind === 'premature' && worldId !== 'conduction') return;
  if ((kind === 'find-echo' || kind === 'find-chord') && worldId !== 'echo') return;
  const runId = `run-${++runCounter}`;
  const commands = [];
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
    commands.push(stimulus('protocol-premature', 'A', 275));
    status = 'An early impulse takes the slower path.';
  } else if (kind === 'find-echo' || kind === 'find-chord') {
    commands.push(...guidedCommands(kind));
    fromMs = scene.presentation.protocols.find(entry => entry.id === kind).presentFromMs ?? 0;
    status = kind === 'find-echo'
      ? 'Seven beats already given. The last beat, then one early touch. Each try comes a little earlier.'
      : 'Seven beats already given. The last beat, then two early touches. Each try comes a little earlier.';
  }
  if (kind !== 'find-echo' && kind !== 'find-chord') guidedLast = null;
  // The player's model edits carry into the new run as logged commands at t = 0.
  if (card) {
    carryCommands(scene.preset ?? world, card.state).forEach((body, index) => commands.push({ ...body, commandId: `carry-${index + 1}`, tMs: 0 }));
  }
  $('status').textContent = started ? status : WORLDS[worldId].topology;
  transport.reset(world, runId, {
    commands, fromMs, start: autoStart && !document.hidden && (!context || context.state === 'running'),
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
  studyLab.setGuided(guidedLast
    ? `Last guided run: ${guidedLast.label}. S1 600 ms × 8 from CSp, S2 ${guidedLast.s2} ms${guidedLast.s3 === null ? '' : `, S3 ${guidedLast.s3} ms`}.`
    : '');
}

function updateFragment() {
  const fragment = formatFragment({ study: worldId === 'conduction' ? null : worldId, view });
  if (location.hash !== fragment) history.replaceState(null, '', fragment || `${location.pathname}${location.search}`);
}

function labOpen() {
  return !$('lab').hidden;
}

function chooseWorld(id) {
  if (!Object.hasOwn(WORLDS, id) || (id === worldId && selectedNodeId)) return;
  const autoStart = transport.status === 'running';
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
  selectedNodeId = world.nodes.find(node => node.audible !== false)?.id ?? world.nodes[0].id;
  renderer.setSelected(selectedNodeId);
  selectedLinkId = world.links[0].id;
  guidedNext = { 'find-echo': 0, 'find-chord': 0 };
  guidedLast = null;
  for (const button of $('worlds').children) {
    button.setAttribute('aria-pressed', String(button.dataset.world === worldId));
  }
  $('canvas').setAttribute('aria-label', settings.topology + ' Use the site buttons to stimulate.');
  $('single').hidden = $('guide').hidden = id !== 'circulation';
  $('premature').hidden = id !== 'conduction';
  $('find-echo').hidden = $('find-chord').hidden = $('stillness').hidden = id !== 'echo';
  updatePaletteControls();
  $('protocol-hint').textContent = settings.hint;
  setupCard();
  views.configure(settings, world, { lab: labOpen() });
  buildSiteButtons();
  buildInspectButtons();
  if (studyLab) setupStudyLab();
  $('lab-study').hidden = !settings.study;
  resize();
  startRun('quiet', selectedNodeId, couplingMs, autoStart);
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
  for (const button of $('sites').children) button.disabled = !running;
  for (const id of ['single', 'guide', 'premature', 'find-echo', 'find-chord', 'reset']) $(id).disabled = !started;
  $('stillness').disabled = !running;
  $('pause').textContent = transport.status === 'pausing' ? 'Pausing…' : running ? 'Pause' : 'Resume';
  $('pause').disabled = !started || ['pausing', 'faulted'].includes(transport.status);
}

function updatePaletteControls() {
  $('voicing-control').hidden = worldId !== 'circulation' || preferences.palette !== 'chamber';
}

async function begin(silent) {
  if (beginning || started) return;
  beginning = true;
  const visibilityAtRequest = visibilityChanges;
  $('begin').disabled = $('silent').disabled = true;
  let candidate;
  try {
    if (!silent) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      candidate = new AudioContext();
      await candidate.resume();
      context = candidate;
      // No in-app volume or mute: listeners use the device's own controls (creator decision 2026-11-27).
      mixer = createAudioMixer(context, { volume: preferences.volume });
      mixer.setMuted(false);
      context.onstatechange = () => {
        if (['suspended', 'interrupted'].includes(context.state)) transport.interrupt('audio-interrupted');
      };
    }
    started = true;
    $('intro').hidden = true;
    $('performance').hidden = false;
    const stillVisible = !document.hidden && visibilityAtRequest === visibilityChanges;
    startRun(worldId === 'circulation' ? 'single' : 'quiet', selectedNodeId, couplingMs, stillVisible);
    if (!stillVisible) $('status').textContent = 'Paused while away. Resume when ready.';
    $('pause').focus({ preventScroll: true });
  } catch (error) {
    if (candidate) await candidate.close().catch(() => {});
    context = mixer = undefined;
    $('status').textContent = `Sound could not start. Begin in silence is available. ${error.message}`;
  } finally {
    beginning = false;
    $('begin').disabled = $('silent').disabled = false;
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

// Stillness: an adenosine-like agent. One logged applyAgent command; the engine
// applies the envelope to nodal, sinus and atrial sites in 100 ms steps.
function stillness() {
  if (!scene.study || transport.status !== 'running') return;
  const command = transport.submit({ type: 'applyAgent', agent: 'stillness', doseScale: 1 });
  if (!command) return;
  stillnessDoses.push({ tMs: command.tMs, runId: command.runId });
  $('status').textContent = 'Stillness. The junction goes quiet for a while.';
}

function stillnessLevel(frame) {
  let level = 0;
  for (const dose of stillnessDoses) {
    if (dose.runId === frame.runId) level = Math.max(level, stillnessEnvelope((frame.presentedMs - dose.tMs) * 1000));
  }
  return level;
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
    button.setAttribute('aria-label', `Stimulate site ${siteLabel(id)}. Press I to inspect it.`);
    // Pointer activation is handled on the stage so a stroke can start on a site.
    button.onclick = event => { if (!event.detail) stimulate(id); };
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

// Keyboard access to the inspector card through the connection list.
function buildInspectButtons() {
  $('inspect-sites').replaceChildren();
  $('inspect-links').replaceChildren();
  for (const node of world.nodes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = node.id;
    button.dataset.inspect = node.id;
    button.setAttribute('aria-label', `Inspect site ${siteLabel(node.id)}`);
    button.onclick = () => openCard({ kind: 'node', id: node.id });
    $('inspect-sites').append(button);
  }
  for (const link of world.links) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${link.a}–${link.b}`;
    button.dataset.inspect = link.id;
    button.setAttribute('aria-label', `Inspect connection ${link.a} to ${link.b}`);
    button.onclick = () => openCard({ kind: 'link', id: link.id });
    $('inspect-links').append(button);
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
  if (!VIEWS.includes(next)) return;
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

// Press and hold: a site or a connection opens the inspector card (every world);
// the open centre gives Stillness (Echo). A drag cancels a hold and does nothing.
function armHold(active, point) {
  const link = active.site ? null : renderer.hitTestLink(point.x, point.y);
  const centre = renderer.centre;
  const inCentre = scene.study && !active.site && !link && centre && Math.hypot(point.x - centre.x, point.y - centre.y) < centre.radius * 0.8;
  if (!active.site && !link && !inCentre) return;
  active.timer = setTimeout(() => {
    if (gesture !== active || active.dragged) return;
    active.held = true;
    active.timer = null;
    if (active.site) openCard({ kind: 'node', id: active.site });
    else if (link) openCard({ kind: 'link', id: link });
    else stillness();
  }, active.site || link ? HOLD_SITE_MS : HOLD_CENTRE_MS);
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
  if (site && !dragged && !held) stimulate(site);
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
    audioState: context?.state ?? (started ? 'silent' : 'awaiting Begin'),
    audioDiagnostics: mixer?.diagnostics(),
    palette: preferences.palette,
    voicing: preferences.voicing,
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

$('begin').onclick = () => begin(false);
$('silent').onclick = () => begin(true);
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
$('guide').onclick = () => startRun('guide', 'R0', GUIDE_COUPLING_MS);
$('premature').onclick = () => startRun('premature');
$('find-echo').onclick = () => startRun('find-echo');
$('find-chord').onclick = () => startRun('find-chord');
$('stillness').onclick = stillness;
$('reset').onclick = () => startRun();
$('notes-close').onclick = () => $('notes-sheet').close?.() ?? $('notes-sheet').removeAttribute('open');
$('notes-sheet').addEventListener('click', event => { if (event.target === $('notes-sheet')) $('notes-sheet').close(); });
for (const button of $('worlds').children) button.onclick = () => chooseWorld(button.dataset.world);
for (const button of $('views').querySelectorAll('button')) button.onclick = () => setView(button.dataset.view);
$('dilation').replaceChildren(...DILATIONS.map(value => {
  const option = document.createElement('option');
  option.value = String(value);
  option.textContent = dilationLabel(value);
  return option;
}));
$('dilation').value = String(preferences.dilation);
$('palette').value = preferences.palette;
$('voicing').value = preferences.voicing;
$('dilation').onchange = () => {
  preferences.dilation = Number($('dilation').value);
  transport.setDilation(preferences.dilation);
  savePreferences(preferences);
};
$('palette').onchange = () => {
  preferences.palette = $('palette').value;
  updatePaletteControls();
  savePreferences(preferences);
};
$('voicing').onchange = () => {
  preferences.voicing = $('voicing').value;
  savePreferences(preferences);
};
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
  chooseWorld(startWorld);
  setView(view);
  if (typeof ResizeObserver === 'function') {
    const stageObserver = new ResizeObserver(resize);
    stageObserver.observe(stage);
    stageObserver.observe($('view-canvas'));
  } else window.addEventListener('resize', resize);
} catch (error) {
  console.warn(error);
  $('status').textContent = 'The artwork could not start. A browser with Canvas 2D is required.';
  $('begin').disabled = $('silent').disabled = $('lab-toggle').disabled = true;
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
        renderer.setDim(stillnessLevel(frame));
        renderer.render(frame.snapshot, events, frame.presentedMs);
      } else {
        views.draw({ events, presentedMs: frame.presentedMs, lab: labOpen() });
      }
      updateCard(frame, now);
    }
    updateInspection(frame, now);
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
  stillnessLevel: () => (lastFrame ? stillnessLevel(lastFrame) : 0),
};
