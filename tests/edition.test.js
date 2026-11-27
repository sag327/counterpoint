// The Circulation edition (creator request 2026-11-27): a shareable preview with
// Circulation alone, Network view only, and the sound fixed to Chamber / balanced.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EDITION, EDITIONS_LIST, EDITION_ID } from '../src/ui/edition.js';

const root = path.resolve(import.meta.dirname, '..');

test('the source edition is the full app', () => {
  assert.equal(EDITION_ID, 'full');
  assert.equal(EDITION.worlds, null);
  assert.deepEqual(EDITIONS_LIST, ['full', 'circulation']);
});

test('the circulation build fixes its world, view and sound, and keeps its own preferences', () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'edition-')), 'circulation.html');
  execFileSync(process.execPath, ['scripts/build.mjs', '--edition', 'circulation', '--out', out], { cwd: root });
  const html = readFileSync(out, 'utf8');
  assert.match(html, /<title>Counterpoint · Circulation<\/title>/);
  assert.match(html, /const EDITION_ID = "circulation";/);
  assert.doesNotMatch(html, /const EDITION_ID = 'full';/);
  assert.doesNotMatch(html, /id="(?:palette|voicing)(?:-control)?"/);
  assert.match(html, /worlds: \['circulation'\],\s*views: \['network'\]/);
});

test('an unknown edition fails the build', () => {
  assert.throws(() => execFileSync(process.execPath, ['scripts/build.mjs', '--edition', 'nope', '--out', path.join(tmpdir(), 'nope.html')], { cwd: root, stdio: 'pipe' }));
});
