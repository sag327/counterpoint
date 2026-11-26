import { Engine } from '../engine/index.js';
import { createCirculationWorld } from '../worlds/circulation.js';
import { createConductionWorld } from '../worlds/conduction.js';
import { createDualityWorld } from '../worlds/duality.js';
import { createTransport, LOOKAHEAD_WALL_MS } from '../runtime/transport.js';
import { createRenderer } from '../visuals/renderer.js';
import { mapActivation, createAudioMixer, describeNodeMusic, PALETTES, CHAMBER_VOICINGS } from '../music/index.js';
import { createInspector } from './inspector.js';
import { readPreferences, savePreferences } from './preferences.js';

const $ = id => document.getElementById(id);
const WORLDS = {
  conduction: {
    create: createConductionWorld,
    name: 'Conduction',
    topology: 'Six sites in a branching pathway, led by an automatic focus.',
    hint: 'Tap a site to stimulate it. Swipe across a connection to cut it.',
    status: 'An automatic impulse leads the way.',
  },
  circulation: {
    create: createCirculationWorld,
    name: 'Circulation',
    topology: 'Eight excitable sites joined in a bidirectional ring.',
    hint: 'Swipe across a connection to cut it. Find a rhythm resets the ring and sends two impulses.',
    status: 'The ring rests until a site is stimulated.',
  },
  duality: {
    create: createDualityWorld,
    name: 'Duality',
    topology: 'Two disconnected pathways, each with its own automatic focus.',
    hint: 'Tap a site to stimulate it. Swipe across a connection to cut it.',
    status: 'Two independent rhythms share the space.',
  },
};

const preferences = readPreferences(PALETTES, CHAMBER_VOICINGS);
const engine = new Engine();
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const pendingLinks = new Map();
const EVENT_LIMIT = 4096;
const GUIDE_COUPLING_MS = 240;
const SWIPE_THRESHOLD = 10;
let worldId = 'conduction';
let world;
let renderer;
let inspector;
let context;
let mixer;
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

const transport = createTransport({
  engine,
  dilation: preferences.dilation,
  nowSec: () => context ? context.currentTime : performance.now() / 1000,
  onCommit(events) {
    retainEvents(events);
    if (!mixer) return;
    for (const event of events) {
      const intent = mapActivation(event, preferences);
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
  onReset(snapshot) {
    allEvents = [];
    discardedEvents = 0;
    captureTotal = 0;
    visualFloorMs = -1;
    lastFrame = undefined;
    pendingLinks.clear();
    gesture = undefined;
    renderer.clearGestures();
    mixer?.beginRun(snapshot.runId);
    inspectionDirty = true;
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

function startRun(kind = 'quiet', nodeId = selectedNodeId, interval = couplingMs, autoStart = started) {
  if (kind === 'single' && !world.nodes.some(node => node.id === nodeId)) return;
  if (kind === 'guide' && (worldId !== 'circulation' || !world.nodes.some(node => node.id === nodeId)
    || !Number.isInteger(interval) || interval < 1 || interval > 5000)) return;
  if (kind === 'premature' && worldId !== 'conduction') return;
  const runId = `run-${++runCounter}`;
  const commands = [];
  const stimulus = (commandId, nodeId, tMs) => ({ commandId, type: 'stimulate', nodeId, tMs });
  let status = WORLDS[worldId].status;
  if (kind === 'single') {
    commands.push(stimulus('protocol-s1', nodeId, 0));
    status = 'One impulse travels through the circuit.';
  } else if (kind === 'guide' && worldId === 'circulation') {
    commands.push(stimulus('protocol-s1', nodeId, 0), stimulus('protocol-s2', nodeId, interval));
    status = 'Two impulses. A chance to keep going.';
  } else if (kind === 'premature' && worldId === 'conduction') {
    commands.push(stimulus('protocol-premature', 'A', 275));
    status = 'An early impulse takes the slower path.';
  }
  $('status').textContent = started ? status : WORLDS[worldId].topology;
  transport.reset(world, runId, {
    commands, start: autoStart && !document.hidden && (!context || context.state === 'running'),
  });
  updateButtons();
  if (!$('lab').hidden) {
    lastFrame = transport.frame();
    updateInspection(lastFrame, performance.now());
  }
}

function chooseWorld(id) {
  if (!Object.hasOwn(WORLDS, id) || (id === worldId && selectedNodeId)) return;
  const autoStart = transport.status === 'running';
  const settings = WORLDS[id];
  const nextWorld = settings.create();
  const nextRenderer = createRenderer($('canvas'), nextWorld, { reducedMotion: motion.matches });
  worldId = id;
  world = nextWorld;
  renderer = nextRenderer;
  selectedNodeId = world.nodes[0].id;
  selectedLinkId = world.links[0].id;
  for (const button of $('worlds').children) {
    button.setAttribute('aria-pressed', String(button.dataset.world === worldId));
  }
  $('canvas').setAttribute('aria-label', settings.topology + ' Use the site buttons to stimulate.');
  $('single').hidden = $('guide').hidden = id !== 'circulation';
  $('premature').hidden = id !== 'conduction';
  updatePaletteControls();
  $('protocol-hint').textContent = id === 'conduction'
    ? settings.hint + ' Premature impulse resets the pathway for the reference trial.'
    : settings.hint;
  buildSiteButtons();
  buildLinkButtons();
  resize();
  startRun('quiet', selectedNodeId, couplingMs, autoStart);
}

function updateButtons() {
  const running = transport.status === 'running';
  if (!running) gesture = undefined;
  for (const button of $('sites').children) button.disabled = !running;
  for (const button of $('cuts').children) button.disabled = !running;
  $('restore').disabled = !running;
  for (const id of ['single', 'guide', 'premature', 'reset']) $(id).disabled = !started;
  $('pause').textContent = transport.status === 'pausing' ? 'Pausing…' : running ? 'Pause' : 'Resume';
  $('pause').disabled = !started || ['pausing', 'faulted'].includes(transport.status);
}

function updatePaletteControls() {
  $('voicing-control').hidden = worldId !== 'circulation' || preferences.palette !== 'chamber';
}

function updateAudioControls() {
  $('mute').disabled = !mixer;
  $('volume').disabled = !mixer;
  $('mute').textContent = !mixer ? 'Sound disabled' : preferences.muted ? 'Unmute' : 'Mute';
  $('mute').setAttribute('aria-pressed', String(Boolean(mixer && preferences.muted)));
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
      mixer = createAudioMixer(context, { volume: preferences.volume });
      mixer.setMuted(preferences.muted);
      context.onstatechange = () => {
        if (['suspended', 'interrupted'].includes(context.state)) transport.interrupt('audio-interrupted');
      };
    }
    started = true;
    $('intro').hidden = true;
    $('performance').hidden = false;
    updateAudioControls();
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

function linkEnabled(linkId) {
  return pendingLinks.get(linkId)?.enabled ?? lastFrame?.snapshot.links[linkId]?.enabled ?? true;
}

function setLinkEnabled(linkId, enabled) {
  if (transport.status !== 'running' || !world.links.some(link => link.id === linkId) || linkEnabled(linkId) === enabled) return false;
  const command = transport.submit({ type: 'setLinkEnabled', linkId, enabled });
  if (!command) return false;
  pendingLinks.set(linkId, { enabled, tMs: command.tMs });
  return true;
}

function toggleLink(linkId) {
  selectLink(linkId);
  setLinkEnabled(linkId, !linkEnabled(linkId));
}

function buildSiteButtons() {
  $('sites').replaceChildren();
  for (const { id } of world.nodes) {
    const button = document.createElement('button');
    button.className = 'site';
    button.disabled = true;
    button.textContent = id;
    button.setAttribute('aria-label', `Stimulate site ${id}`);
    // Pointer activation is handled on the stage so a stroke can start on a site.
    button.onclick = event => { if (!event.detail) stimulate(id); };
    $('sites').append(button);
  }
}

function buildLinkButtons() {
  $('cuts').replaceChildren();
  for (const link of world.links) {
    const button = document.createElement('button');
    button.textContent = `${link.a}–${link.b}`;
    button.setAttribute('aria-label', `Cut or restore connection ${link.a} to ${link.b}`);
    button.setAttribute('aria-pressed', 'false');
    button.onclick = () => toggleLink(link.id);
    button.dataset.link = link.id;
    $('cuts').append(button);
  }
}

function resize() {
  renderer.resize();
  for (const button of $('sites').children) {
    const point = renderer.nodePosition(button.textContent);
    if (!point) continue;
    button.style.left = `${point.x}px`;
    button.style.top = `${point.y}px`;
  }
}

function canvasPoint(event) {
  const rect = $('canvas').getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function crossConnections(from, to, previous) {
  for (const linkId of renderer.crossedLinks(from, to, previous)) {
    if (!setLinkEnabled(linkId, false)) continue;
    selectLink(linkId);
    const link = world.links.find(link => link.id === linkId);
    $('status').textContent = `Connection ${link.a}–${link.b} cut.`;
  }
}

function trackGesture(event) {
  const active = gesture;
  if (active?.pointerId !== event.pointerId) return;
  const samples = event.getCoalescedEvents?.() ?? [];
  for (const sample of [...samples, event]) {
    if (gesture !== active) return;
    const point = canvasPoint(sample);
    if (point.x === active.last.x && point.y === active.last.y) continue;
    if (active.swiping) {
      crossConnections(active.last, point, active.previous);
    } else {
      active.path.push(point);
      active.travel += Math.hypot(point.x - active.last.x, point.y - active.last.y);
      if (active.travel >= SWIPE_THRESHOLD) {
        active.swiping = true;
        for (let i = 1; i < active.path.length; i++) {
          crossConnections(active.path[i - 1], active.path[i], active.path[i - 2]);
        }
      }
    }
    active.previous = active.last;
    active.last = point;
  }
}

const stage = $('stage');
stage.addEventListener('pointerdown', event => {
  if (gesture || !event.isPrimary || event.button !== 0 || transport.status !== 'running') return;
  const point = canvasPoint(event);
  const site = renderer.hitTest(point.x, point.y);
  gesture = { pointerId: event.pointerId, last: point, path: [point], travel: 0, swiping: false, site };
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener('pointermove', trackGesture);
stage.addEventListener('pointerup', event => {
  if (gesture?.pointerId !== event.pointerId) return;
  trackGesture(event);
  if (!gesture) return;
  const { site, swiping } = gesture;
  gesture = undefined;
  if (site && !swiping) stimulate(site);
});
for (const type of ['pointercancel', 'lostpointercapture']) {
  stage.addEventListener(type, event => {
    if (gesture?.pointerId === event.pointerId) gesture = undefined;
  });
}

function updateInspection(frame, now) {
  if ($('lab').hidden || (!inspectionDirty && now - lastInspectionTime < 120)) return;
  lastInspectionTime = now;
  inspectionDirty = false;
  const settings = WORLDS[worldId];
  inspector ??= createInspector($('lab-content'), {
    onStimulus: stimulate,
    onToggleLink: toggleLink,
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
    nodeMusic: describeNodeMusic(worldId, selectedNodeId, preferences),
  });
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
$('reset').onclick = () => startRun();
for (const button of $('worlds').children) button.onclick = () => chooseWorld(button.dataset.world);
$('dilation').value = String(preferences.dilation);
$('palette').value = preferences.palette;
$('voicing').value = preferences.voicing;
$('volume').value = String(preferences.volume);
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
$('mute').onclick = () => {
  preferences.muted = !preferences.muted;
  mixer?.setMuted(preferences.muted);
  updateAudioControls();
  savePreferences(preferences);
};
$('volume').oninput = () => {
  preferences.volume = Number($('volume').value);
  mixer?.setVolume(preferences.volume);
  savePreferences(preferences);
};
$('restore').onclick = () => {
  let restored = false;
  for (const link of world.links) {
    if (setLinkEnabled(link.id, true)) restored = true;
  }
  if (restored) $('status').textContent = 'Connections restored.';
};
$('lab-toggle').onclick = () => {
  const open = $('lab').hidden;
  $('lab').hidden = !open;
  $('lab-toggle').setAttribute('aria-expanded', String(open));
  if (open && lastFrame) {
    inspectionDirty = true;
    updateInspection(lastFrame, performance.now());
  }
};
$('export').onclick = () => {
  const data = {
    origin: 'actual-engine', contract: '1.0.0', runId: transport.runId, world,
    presentedMs: transport.presentedMs(), committedMs: transport.committedThroughMs(),
    retentionLimit: EVENT_LIMIT, discardedEvents, commands: transport.commandLog(),
    discardedCommands: transport.discardedCommandCount, lastInterruption: transport.lastInterruption,
    events: allEvents,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = 'counterpoint-events.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    visibilityChanges++;
    if (started) transport.interrupt('page-hidden');
  }
});
const applyMotion = event => renderer?.setReducedMotion(event.matches);
if (motion.addEventListener) motion.addEventListener('change', applyMotion);
else motion.addListener?.(applyMotion);

try {
  chooseWorld(worldId);
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);
} catch {
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
      renderer.render(frame.snapshot, events, frame.presentedMs);
      for (const [id, pending] of pendingLinks) {
        if (pending.tMs <= frame.presentedMs) pendingLinks.delete(id);
      }
      for (const button of $('cuts').children) {
        const pressed = String(!frame.snapshot.links[button.dataset.link].enabled);
        if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
      }
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
};
