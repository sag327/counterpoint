// Every registered study world: valid contract 1.1.0 world, every site tagged with
// tissue (lintStudyWorld), nodal and sinus sites silent, every audible site has
// music in the tissue's register and voice, and layout, tiers, staves and protocols
// reference real ids. Protocols only enqueue stimuli and trains.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEngine } from '../src/engine/index.js';
import { lintStudyWorld } from '../src/engine/input.js';
import { describeNodeMusic } from '../src/music/mapping.js';
import { STUDIES } from '../src/worlds/studies.js';

const DORIAN = new Set([2, 4, 5, 7, 9, 0]); // D E F G A C (pitch classes)
const REGISTER = { atrial: [62, 74], hisPurkinje: [81, 86], ventricular: [50, 57], accessory: [76, 76] };
const VOICES = { atrial: ['felt', 'pluck'], hisPurkinje: ['glass'], ventricular: ['bow'], accessory: ['glass'] };

for (const study of STUDIES) {
  test(`${study.id}: world lint, tissue, music, layout, tiers, staves`, () => {
    const world = study.create();
    assert.deepEqual(world, study.preset, 'factory equals the frozen preset');
    assert.ok(Object.isFrozen(study.preset) && Object.isFrozen(study.presentation));
    assert.equal(world.contractVersion, '1.1.0');
    createEngine().reset(world, 'lint');
    assert.deepEqual(lintStudyWorld(world), []);
    const ids = new Set(world.nodes.map(n => n.id));
    const { layout, tiers, staves, music, protocols } = study.presentation;
    for (const node of world.nodes) {
      assert.ok(typeof node.tissue === 'string', `${node.id} tissue`);
      if (node.tissue === 'nodal' || node.tissue === 'sinus') assert.equal(node.audible, false, `${node.id} silent`);
      const position = layout[node.id];
      assert.ok(Array.isArray(position) && position.length === 2 && position.every(v => v >= -1 && v <= 1), `${node.id} layout`);
      if (node.audible === false) {
        assert.equal(music[node.id], null);
        assert.equal(describeNodeMusic(world.worldId, node.id, { nodes: music }), null);
        continue;
      }
      const [midi, voice, pan] = music[node.id];
      assert.ok(DORIAN.has(midi % 12), `${node.id} pitch in the D-Dorian set`);
      const [lo, hi] = REGISTER[node.tissue];
      assert.ok(midi >= lo && midi <= hi, `${node.id} register`);
      assert.ok(VOICES[node.tissue].includes(voice), `${node.id} voice`);
      assert.ok(Math.abs(pan) <= 1);
      describeNodeMusic(world.worldId, node.id, { nodes: music });
    }
    assert.deepEqual(Object.keys(layout).sort(), [...ids].sort());
    assert.deepEqual(Object.keys(music).sort(), [...ids].sort());
    const tiered = tiers.flat();
    assert.ok(tiered.every(id => ids.has(id)) && new Set(tiered).size === tiered.length && tiered.length === ids.size, 'tiers cover every site once');
    assert.ok(staves.every(id => ids.has(id) && world.nodes.find(n => n.id === id).audible !== false), 'staves: audible sites only');
    assert.deepEqual([...staves].sort(), world.nodes.filter(n => n.audible !== false).map(n => n.id).sort(), 'one staff per audible site');
    for (const protocol of protocols) {
      assert.ok(protocol.label && protocol.lab && typeof protocol.commands === 'function');
      const commands = protocol.commands(270);
      assert.ok(commands.every(c => (c.type === 'stimulate' || c.type === 'stimulateTrain') && ids.has(c.nodeId)), `${protocol.id} only stimulates`);
      const engine = createEngine();
      engine.reset(world, 'p');
      for (const c of commands) engine.enqueue({ runId: 'p', ...c });
    }
  });
}
