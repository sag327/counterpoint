// G1 independent review, check 1: contract 1.0.0 invariance.
// Extracts the engine at 806459d (pre-1.1.0) into a scratch directory inside the
// worktree, then compares it with the current engine on (a) the frozen fixtures,
// (b) both committed evidence files, and (c) a seeded differential fuzz of 1.0.0
// worlds and commands (events and readAt snapshots, byte for byte).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const scratch = join(root, 'tests', 'review', '.v10-engine');
const BASE = '806459d';
rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });
for (const f of ['agenda.js', 'history.js', 'index.js', 'input.js', 'time.js']) {
  writeFileSync(join(scratch, f), execFileSync('git', ['-C', root, 'show', `${BASE}:src/engine/${f}`]));
}
const old = await import(pathToFileURL(join(scratch, 'index.js')));
const cur = await import(pathToFileURL(join(root, 'src', 'engine', 'index.js')));
const results = [];
const ok = (name, detail = '') => { results.push(`PASS ${name}${detail ? ` (${detail})` : ''}`); };

try {
  // (0) frozen files untouched
  const frozen = ['contracts/command.v1.schema.json', 'contracts/event.v1.schema.json', 'contracts/world.v1.schema.json',
    'contracts/noteIntent.v1.schema.json', 'tests/fixtures', 'src/worlds', 'dist', 'RELEASE.sha256',
    'evidence/engine-01.json', 'evidence/worlds-01.json', 'tests/engine.test.js', 'tests/worlds.test.js',
    'tests/engine-scenes.js', 'tests/worlds-scenes.js', 'tests/engine-evidence.js', 'tests/worlds-evidence.js',
    'tests/engine-contract.py', 'src/music', 'src/runtime', 'src/ui', 'src/visuals', 'src/index.html'];
  const diff = execFileSync('git', ['-C', root, 'diff', '--name-only', `${BASE}..HEAD`, '--', ...frozen]).toString().trim();
  assert.equal(diff, '', `frozen files changed: ${diff}`);
  ok('frozen v1 files unchanged since 806459d', frozen.length + ' paths');

  // (a) fixtures
  const fx = name => JSON.parse(readFileSync(join(root, 'tests/fixtures/v1', `${name}.json`), 'utf8'));
  const ring = fx('ring');
  const { circulationWorld } = await import(pathToFileURL(join(root, 'src/worlds/circulation.js')));
  assert.deepEqual(circulationWorld, ring);
  for (const p of ['A', 'B', 'C']) {
    const commands = fx(`${p}.commands`);
    const expected = fx(`${p}.presentation`);
    for (const [label, mod] of [['old', old], ['new', cur]]) {
      const e = mod.createEngine(); e.reset(ring, commands[0].runId);
      commands.forEach(c => e.enqueue(c));
      const events = e.advanceTo(expected.throughMs);
      assert.deepEqual(JSON.parse(JSON.stringify(events)), expected.events, `${p} ${label}`);
    }
    // and byte-identical old vs new
    const run = mod => { const e = mod.createEngine(); e.reset(ring, commands[0].runId); commands.forEach(c => e.enqueue(c)); return JSON.stringify(e.advanceTo(expected.throughMs)); };
    assert.equal(run(cur), run(old));
    ok(`fixture ${p}`, `${expected.events.length} events, by value vs hand fixture, byte-identical old vs new`);
  }

  // (b) committed evidence regenerates byte for byte
  for (const [gen, file] of [['tests/engine-evidence.js', 'evidence/engine-01.json'], ['tests/worlds-evidence.js', 'evidence/worlds-01.json']]) {
    const out = execFileSync('node', [join(root, gen)], { cwd: root, maxBuffer: 1 << 28 }).toString();
    const committed = readFileSync(join(root, file), 'utf8');
    assert.equal(out, committed.endsWith('\n') ? committed : committed + '\n', file);
    ok(`${file} regenerates byte-identically`, `${committed.length} bytes`);
  }

  // (b2) the same 1.0.0 scenes marked contractVersion 1.1.0 have identical dynamics once the
  // three 1.1.0 annotations (diastolicIntervalMs, delayParts, cause) are removed.
  {
    const strip = events => JSON.stringify(events.map(e => { const { diastolicIntervalMs, delayParts, cause, ...rest } = e;
      return e.type === 'parameter_changed' || e.type === 'link_changed' || e.type === 'activation' || e.type === 'conduction_launched' ? rest : e; }));
    let scenes = 0;
    for (const file of ['evidence/engine-01.json', 'evidence/worlds-01.json']) {
      const { traces } = JSON.parse(readFileSync(join(root, file), 'utf8'));
      for (const [name, tr] of Object.entries(traces)) {
        const e = cur.createEngine({ processingBudget: 1e7 }); e.reset({ ...tr.world, contractVersion: '1.1.0' }, tr.commands[0]?.runId ?? tr.runId ?? 'r');
        tr.commands.forEach(c => e.enqueue(c));
        const events = e.advanceTo(tr.throughMs);
        assert.equal(strip(events), JSON.stringify(tr.events), `${file} ${name} as 1.1.0`);
        scenes++;
      }
    }
    ok('1.0.0 evidence scenes re-run as contractVersion 1.1.0 worlds: identical after removing 1.1.0 annotations', `${scenes} scenes`);
  }

  // (c) seeded differential fuzz on 1.0.0 worlds
  let seed = 0x9e3779b9;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 2 ** 32; };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = xs => xs[ri(0, xs.length - 1)];
  let totalEvents = 0;
  const CASES = 400;
  for (let c = 0; c < CASES; c++) {
    const n = ri(2, 7);
    const nodes = Array.from({ length: n }, (_, i) => ({
      id: `N${i}`, erpMs: ri(30, 350), recoveryTailMs: ri(10, 200),
      automaticity: rnd() < 0.3 ? { cycleMs: ri(200, 1200), firstAttemptMs: ri(0, 500), resetOnCapture: rnd() < 0.5 } : null,
    }));
    const links = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rnd() < 0.45) {
      const dir = () => ({ enabled: rnd() < 0.9, delayMs: ri(1, 150) + (rnd() < 0.2 ? 0.5 : 0),
        decrement: rnd() < 0.3 ? { maxExtraMs: ri(0, 120), tauMs: ri(20, 200) } : null });
      links.push({ id: `L${i}_${j}`, a: `N${i}`, b: `N${j}`, enabled: rnd() < 0.9, ab: dir(), ba: dir() });
    }
    const world = { worldId: 'fuzz', nodes, links };
    const runId = `f${c}`;
    const commands = [];
    const m = ri(1, 25);
    let t = 0;
    for (let k = 0; k < m; k++) {
      t += pick([0, 0, 1, 7, 33, 60, 120, 250]) + (rnd() < 0.1 ? 0.0005 : 0);
      const tMs = Math.round(t * 10000) / 10000;
      const type = pick(['stimulate', 'stimulate', 'stimulate', 'setLinkEnabled', 'setNodeERP', 'setDirectionDelay', 'setAutomaticity']);
      const base = { runId, commandId: `c${k}`, tMs, type };
      if (type === 'stimulate') commands.push({ ...base, nodeId: pick(nodes).id });
      else if (type === 'setNodeERP') commands.push({ ...base, nodeId: pick(nodes).id, erpMs: ri(50, 400) });
      else if (type === 'setAutomaticity') commands.push({ ...base, nodeId: pick(nodes).id, cycleMs: rnd() < 0.3 ? null : ri(200, 1500) });
      else if (links.length && type === 'setLinkEnabled') commands.push({ ...base, linkId: pick(links).id, enabled: rnd() < 0.5 });
      else if (links.length && type === 'setDirectionDelay') commands.push({ ...base, linkId: pick(links).id, direction: pick(['ab', 'ba']), delayMs: ri(1, 200) });
    }
    const horizon = t + ri(200, 3000);
    const steps = [];
    for (let h = 0; h < horizon;) { h = Math.min(horizon, h + pick([1, 13, 97, 400, 1000])); steps.push(h); }
    const play = mod => {
      const e = mod.createEngine({ processingBudget: 200000 });
      const initial = e.reset(world, runId);
      const out = { initial, events: [], snaps: [], error: null };
      let ci = 0;
      try {
        for (const h of steps) {
          while (ci < commands.length && commands[ci].tMs <= h + 1e-9) {
            try { e.enqueue(commands[ci]); } catch (err) { out.events.push({ rejected: commands[ci].commandId, msg: err.message }); }
            ci++;
          }
          out.events.push(...e.advanceTo(h));
          for (const q of [h, h / 2, Math.max(0, h - 37)]) {
            try { out.snaps.push(e.readAt(q)); } catch (err) { out.snaps.push(err.message); }
          }
        }
      } catch (err) { out.error = err.message; }
      out.diag = e.diagnostics();
      return JSON.stringify(out);
    };
    const a = play(old); const b = play(cur);
    if (a !== b) {
      writeFileSync(join(scratch, 'mismatch.json'), JSON.stringify({ world, commands, steps }, null, 1));
      assert.fail(`differential mismatch in fuzz case ${c}`);
    }
    totalEvents += JSON.parse(b).events.length;
  }
  ok('seeded differential fuzz, 1.0.0 worlds, old vs new engine', `${CASES} cases, ${totalEvents} events + readAt snapshots byte-identical`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(results.join('\n'));
