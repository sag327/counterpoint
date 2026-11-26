import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const glossary = JSON.parse(read('src/content/glossary.json'));
const studies = JSON.parse(read('src/content/studies.json'));
const words = (s) => s.trim().split(/\s+/).length;
const byId = new Map(glossary.map((g) => [g.id, g]));
const studyIds = new Set(studies.map((s) => s.id));
const layer2 = glossary.filter((g) => g.layer === 2).map((g) => g.term);
const hasWord = (text, w) => new RegExp(`\\b${w}\\b`, 'i').test(text);

const LAYER1 = ['rhythm', 'beat', 'tempo', 'rest', 'pause', 'melody', 'arpeggio', 'chord', 'echo', 'round', 'faster', 'slower'];
const LAYER2 = ['hemiola', 'ostinato', 'retrograde', 'canon', 'phasing', 'meter', 'fermata', 'accelerando', 'rubato', 'suspension', 'polyrhythm'];
const HEADINGS = ['The musical idea', 'What the tissue is doing', 'How the model makes it', 'A note from history', 'Try this', 'Further reading'];
const ABBREV = ['AH', 'HV', 'TCL', 'PPI', 'ERP', 'AVNRT', 'AVRT'];

test('content files are valid JSON with expected shape', () => {
  assert.ok(Array.isArray(glossary) && Array.isArray(studies));
  for (const g of glossary) {
    assert.ok(g.id && g.term && [1, 2].includes(g.layer), g.id);
    assert.equal(g.short.length, 2, g.id);
    assert.equal(typeof g.studyNotes, 'object');
    assert.ok(Array.isArray(g.demo.solo));
    assert.ok([null, 'groups', 'figure', 'mirror'].includes(g.demo.brackets), g.id);
  }
  assert.equal(studies.length, 9);
});

test('glossary covers the specified layer 1 and layer 2 terms exactly', () => {
  assert.deepEqual(glossary.filter((g) => g.layer === 1).map((g) => g.id).sort(), [...LAYER1].sort());
  assert.deepEqual(glossary.filter((g) => g.layer === 2).map((g) => g.id).sort(), [...LAYER2].sort());
  assert.equal(byId.size, glossary.length, 'unique ids');
});

test('every glossaryId resolves', () => {
  for (const s of studies) for (const id of s.glossaryIds) assert.ok(byId.has(id), `${s.id}: ${id}`);
});

test('studyNotes keys are real study ids', () => {
  for (const g of glossary) for (const k of Object.keys(g.studyNotes)) assert.ok(studyIds.has(k), `${g.id}: ${k}`);
});

test('each study has at most one layer 2 term, matching its chip', () => {
  for (const s of studies) {
    const l2 = s.glossaryIds.filter((id) => byId.get(id).layer === 2);
    assert.ok(l2.length <= 1, `${s.id} has ${l2.length}`);
    if (s.layer2Term === null) assert.equal(l2.length, 0, s.id);
    else assert.deepEqual(l2, [s.layer2Term], s.id);
  }
});

test('every card sentence is under 20 words', () => {
  for (const g of glossary) {
    for (const t of [...g.short, ...Object.values(g.studyNotes)]) {
      assert.ok(words(t) < 20, `${g.id}: "${t}" (${words(t)})`);
    }
  }
});

test('study subtitles contain no layer 2 word except their own chip term', () => {
  for (const s of studies) {
    for (const t of layer2) {
      if (t === s.layer2Term) continue;
      assert.ok(!hasWord(s.subtitle, t), `${s.id} subtitle uses "${t}"`);
    }
  }
});

test('no EP abbreviations in title, subtitle or tryThis', () => {
  for (const s of studies) {
    for (const field of [s.title, s.subtitle, s.tryThis]) {
      for (const a of ABBREV) assert.ok(!new RegExp(`\\b${a}\\b`).test(field), `${s.id}: ${a} in "${field}"`);
    }
  }
});

test('studies have required fields and lumped-element mechanism wording', () => {
  for (const s of studies) {
    for (const k of ['id', 'numeral', 'title', 'subtitle', 'epMechanism', 'tryThis']) assert.ok(s[k], `${s.id}.${k}`);
    assert.ok(s.epMechanism.startsWith('In this lumped-element model'), s.id);
    assert.equal(s.tryThis.split(/[.!?]/).filter(Boolean).length, 1, `${s.id} tryThis is one sentence`);
  }
});

test('liner-note scaffolds have six headings, draft marker and verification note', () => {
  for (const s of studies) {
    const md = read(`src/content/notes/${s.id}.md`);
    assert.ok(md.includes('DRAFT — creator writes final text'), s.id);
    assert.ok(/References must be verified/i.test(md), s.id);
    const found = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(found, HEADINGS, s.id);
  }
});
