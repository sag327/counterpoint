// The scenes the app offers: the three v0.1 worlds (contract 1.0.0, unchanged)
// and the Study No. 2 studies registered in src/worlds/studies.js (v0.2: Echo).
// Pure data and helpers, so they can be tested without a DOM.
import { createCirculationWorld } from '../worlds/circulation.js';
import { createConductionWorld } from '../worlds/conduction.js';
import { createDualityWorld } from '../worlds/duality.js';
import { STUDIES } from '../worlds/studies.js';
import { createParameterState, defaultCommands, modifiedElements } from '../lab/inspector-card.js';
import STUDY_COPY from '../content/studies.json' with { type: 'json' };
import GLOSSARY from '../content/glossary.json' with { type: 'json' };

// Creator decisions (2026-11-27): the music analogy stays in the sound, not in the
// labels. Musical subtitles, chips, pitch names and the Staves view are hidden but
// kept in the source so they can return. Duality is withdrawn from the menu.
export const SHOW_MUSIC_LABELS = false;
// The Laboratory panel (diagnostics, live curves, Model sliders, protocol runner,
// liner notes) is hidden for now (creator decision 2026-11-27). Its code stays.
export const SHOW_LABORATORY = false;
export const ALL_VIEWS = Object.freeze(['network', 'ladder', 'staves']);
export const VIEWS = Object.freeze(['network', 'ladder']);

// Plain, non-musical subtitles shown while SHOW_MUSIC_LABELS is false.
const PLAIN_SUBTITLES = Object.freeze({
  echo: 'Two routes through the junction',
});

// Plain labels for the main canvas, EP labels for the Lab (spec, audience rule).
const ECHO_LABELS = Object.freeze({
  plain: { S: 'sinus', HRA: 'high atrium', CSp: 'septal atrium', FP: 'fast path', SP: 'slow path', LCP: 'junction', H: 'bundle', V: 'ventricle' },
  ep: { S: 'sinus node', HRA: 'HRA', CSp: 'CS proximal', FP: 'AVN fast pathway', SP: 'AVN slow pathway', LCP: 'lower common pathway', H: 'His', V: 'V' },
  // Lab and runner labels (full EP nomenclature).
  lab: { S: 'sinus node', HRA: 'high right atrium', CSp: 'atrial', FP: 'fast pathway', SP: 'slow pathway', LCP: 'lower common pathway', H: 'His', V: 'ventricle',
    HC: 'HRA–CS proximal', CF: 'atrium–fast pathway', FL: 'fast pathway', CS: 'atrium–slow pathway', SL: 'slow pathway', LH: 'lower common pathway–His', HV: 'His–ventricle', SH: 'sinus exit' },
  tiers: { plain: ['atrium', 'fast path', 'slow path', 'junction', 'bundle', 'ventricle'], ep: ['A', 'AVN fast', 'AVN slow', 'LCP', 'His', 'V'] },
});

const SCENE_LIST = {
  conduction: {
    create: createConductionWorld,
    name: 'Conduction',
    topology: 'Six sites in a branching pathway, led by an automatic focus.',
    hint: 'Tap a site to stimulate it · Hold a site to inspect it',
    status: 'An automatic impulse leads the way.',
  },
  circulation: {
    create: createCirculationWorld,
    name: 'Circulation',
    topology: 'Eight excitable sites joined in a bidirectional ring.',
    hint: 'Tap a site to stimulate it · Hold a site to inspect it',
    status: 'The ring rests until a site is stimulated.',
  },
  ...Object.fromEntries(STUDIES.map(study => {
    const copy = STUDY_COPY.find(entry => entry.id === study.id);
    if (!copy) throw new Error(`No study copy for ${study.id}`);
    return [study.id, {
      create: study.create,
      preset: study.preset,
      presentation: study.presentation,
      study: true,
      numeral: copy.numeral,
      name: copy.title,
      subtitle: SHOW_MUSIC_LABELS ? copy.subtitle : (PLAIN_SUBTITLES[study.id] ?? ''),
      musicalSubtitle: copy.subtitle,
      layer2Term: SHOW_MUSIC_LABELS ? copy.layer2Term : null,
      glossaryIds: SHOW_MUSIC_LABELS ? copy.glossaryIds : [],
      mechanism: copy.epMechanism,
      tryThis: copy.tryThis,
      labels: study.id === 'echo' ? ECHO_LABELS : null,
      topology: 'Two routes through the junction between upper and lower chambers. Silent sites are open rings.',
      hint: 'Tap a site to stimulate it · Hold a site to inspect it',
      status: 'Steady rhythm: atrium, then ventricle.',
    }];
  })),
};

// The v0.1 Duality world stays in src/worlds for its frozen fixtures and tests.
export const WITHDRAWN = Object.freeze({ duality: Object.freeze({ id: 'duality', create: createDualityWorld, name: 'Duality' }) });

export const SCENES = Object.freeze(Object.fromEntries(Object.entries(SCENE_LIST).map(([id, scene]) => [id, Object.freeze({ id, ...scene })])));

export const glossaryFor = scene => (scene.glossaryIds ?? []).map(id => GLOSSARY.find(entry => entry.id === id)).filter(Boolean);

// Tiers for the Ladder: the presentation's tiers with plain or EP labels.
export function ladderTiers(scene, world, { lab = false } = {}) {
  const declared = scene.presentation?.tiers;
  if (!declared) return world.nodes.map(node => node.id);
  const names = scene.labels?.tiers?.[lab ? 'ep' : 'plain'] ?? [];
  return declared.map((sites, index) => ({
    id: sites[0],
    label: names[index] ?? sites.join(' · '),
    group: sites.some(id => ['FP', 'SP', 'LCP'].includes(id)) ? 'av' : null,
    sites: sites.map(id => ({ id, audible: world.nodes.find(node => node.id === id)?.audible !== false })),
  }));
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = midi => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

// Staves: one per audible site in EP channel order. Pitch shows only in the Lab.
export function staveSpecs(scene, world, { lab = false } = {}) {
  const ids = scene.presentation?.staves ?? world.nodes.map(node => node.id);
  const labels = scene.labels?.[lab ? 'ep' : 'plain'] ?? {};
  return ids.map(id => {
    const node = world.nodes.find(entry => entry.id === id);
    const music = scene.presentation?.music?.[id];
    return { nodeId: id, label: labels[id] ?? id, tissue: node?.tissue ?? 'atrial', pitch: SHOW_MUSIC_LABELS && lab && music ? noteName(music[0]) : undefined };
  });
}

// Fragment state: #study=echo&view=ladder. Unknown values are ignored.
export function parseFragment(hash) {
  const params = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  const view = params.get('view');
  const study = params.get('study');
  return {
    view: VIEWS.includes(view) ? view : null,
    study: study !== null && Object.hasOwn(SCENES, study) ? study : null,
  };
}

export function formatFragment({ study, view }) {
  const params = new URLSearchParams();
  if (study) params.set('study', study);
  if (view && view !== 'network') params.set('view', view);
  const text = params.toString();
  return text ? `#${text}` : '';
}

// The world the model currently describes: the preset with the card's
// parameter state written back. The protocol runner builds its engines from it.
export function worldFromState(world, state) {
  const next = structuredClone(world);
  for (const node of next.nodes) {
    const edited = state.nodes[node.id];
    if (!edited) continue;
    node.erpMs = edited.erpMs;
    if (edited.restitution) node.restitution = { ...edited.restitution };
    if (node.automaticity && edited.cycleMs !== null) node.automaticity.cycleMs = edited.cycleMs;
  }
  for (const link of next.links) {
    for (const direction of ['ab', 'ba']) {
      const edited = state.links[link.id]?.[direction];
      if (!edited) continue;
      link[direction].delayMs = edited.delayMs;
      if (state.v11) {
        link[direction].decrement = edited.decrement && edited.decrement.maxExtraMs > 0 ? { ...edited.decrement } : null;
        if ('entry' in link[direction] || edited.entry) link[direction].entry = edited.entry && edited.entry.maxExtraMs > 0 ? { ...edited.entry } : null;
      }
    }
  }
  for (const coupling of next.coupling ?? []) {
    if (Object.hasOwn(state.couplings, coupling.id)) coupling.amplitude = state.couplings[coupling.id];
  }
  return next;
}

// Command bodies that take a fresh run of the preset to the edited state. A
// reset or a guided protocol starts a new run; these go in at t = 0 so the
// player's model edits carry over, logged like any other command.
export function carryCommands(preset, state) {
  const edited = worldFromState(preset, state);
  const base = createParameterState(preset);
  const modified = modifiedElements(preset, state);
  const bodies = [];
  for (const id of modified.nodes) bodies.push(...defaultCommands(edited, base, { kind: 'node', id }));
  for (const id of modified.links) bodies.push(...defaultCommands(edited, base, { kind: 'link', id }));
  for (const id of modified.couplings) bodies.push(...defaultCommands(edited, base, { kind: 'coupling', id }));
  return bodies;
}
