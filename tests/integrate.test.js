// Integration v0.2 (Echo): study registry, fragments, view feeds, carried edits,
// liner notes and the single-file build with its embedded protocol worker.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { Engine } from '../src/engine/index.js';
import { applyCommand, createParameterState, editCommand, modifiedElements } from '../src/lab/inspector-card.js';
import { SCENES, SHOW_MUSIC_LABELS, VIEWS, WITHDRAWN, carryCommands, formatFragment, glossaryFor, ladderTiers, parseFragment, staveSpecs, worldFromState } from '../src/ui/studies.js';
import { renderNotes, isDraft } from '../src/ui/notes.js';
import { buildProtocol, plotsForResult } from '../src/ui/lab-panel.js';
import { runProtocolSync } from '../src/lab/protocols.js';
import { echoPresentation, echoWorld } from '../src/worlds/echo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Scenes: Conduction, Circulation and Echo; Duality withdrawn; musical labels hidden', () => {
  // Creator decisions 2026-11-27: Duality leaves the menu, music stays in the sound only.
  assert.deepEqual(Object.keys(SCENES), ['conduction', 'circulation', 'echo']);
  assert.equal(SHOW_MUSIC_LABELS, false);
  assert.equal(typeof WITHDRAWN.duality.create, 'function', 'the Duality world stays available to its fixtures');
  for (const id of ['conduction', 'circulation']) assert.equal(SCENES[id].study, undefined);
  const echo = SCENES.echo;
  assert.equal(echo.name, 'Echo');
  assert.equal(echo.numeral, 'II');
  assert.equal(echo.subtitle, 'Two routes through the junction');
  assert.equal(echo.musicalSubtitle, 'An arpeggio folds into a chord', 'the musical copy is kept for its return');
  assert.equal(echo.layer2Term, null);
  assert.deepEqual(glossaryFor(echo), []);
  for (const text of [echo.subtitle, echo.status]) assert.doesNotMatch(text, /arpeggio|chord|voice|melody/i, text);
  assert.deepEqual(echo.create(), structuredClone(echoWorld));
  // Plain words on the main canvas: no EP abbreviations, no digits.
  for (const text of [echo.subtitle, echo.status, echo.hint, ...Object.values(echo.labels.plain), ...echo.labels.tiers.plain]) {
    assert.doesNotMatch(text, /\b(HRA|CSp|AVN|ERP|LCP|AH|HV)\b|\d/, text);
  }
});

test('Fragments remember study and view; unknown values are ignored', () => {
  assert.deepEqual(parseFragment('#study=echo&view=ladder'), { study: 'echo', view: 'ladder' });
  assert.deepEqual(parseFragment('#view=staves'), { study: null, view: null }, 'Staves is hidden');
  assert.deepEqual(VIEWS, ['network', 'ladder']);
  assert.deepEqual(parseFragment('#view=map&study=nope'), { study: null, view: null });
  assert.equal(formatFragment({ study: 'echo', view: 'network' }), '#study=echo');
  assert.equal(formatFragment({ study: null, view: 'ladder' }), '#view=ladder');
  assert.deepEqual(parseFragment(formatFragment({ study: 'echo', view: 'ladder' })), { study: 'echo', view: 'ladder' });
});

test('Ladder tiers cover each Echo site once; Staves are the audible sites in channel order', () => {
  const echo = SCENES.echo;
  for (const lab of [false, true]) {
    const tiers = ladderTiers(echo, echoWorld, { lab });
    const ids = tiers.flatMap(tier => tier.sites.map(site => site.id)).sort();
    assert.deepEqual(ids, echoWorld.nodes.map(node => node.id).sort());
    for (const tier of tiers) for (const site of tier.sites) assert.equal(site.audible, echoWorld.nodes.find(node => node.id === site.id).audible);
    const staves = staveSpecs(echo, echoWorld, { lab });
    assert.deepEqual(staves.map(stave => stave.nodeId), ['HRA', 'H', 'CSp', 'V']);
    assert.ok(staves.every(stave => stave.pitch === undefined), 'pitch names hidden with the music labels');
  }
  // v1.0 worlds fall back to one tier and one stave per site.
  const world = SCENES.circulation.create();
  assert.deepEqual(ladderTiers(SCENES.circulation, world), world.nodes.map(node => node.id));
  assert.equal(staveSpecs(SCENES.circulation, world).length, 8);
});

test('Guided protocols only enqueue labelled stimuli and trains', () => {
  for (const protocol of echoPresentation.protocols) {
    for (const s2 of [400, 300, 250]) {
      const commands = protocol.commands(s2);
      assert.ok(commands.every(command => ['stimulate', 'stimulateTrain'].includes(command.type)));
      assert.equal(new Set(commands.map(command => command.commandId)).size, commands.length);
      const engine = new Engine();
      engine.reset(echoWorld, `guided-${protocol.id}-${s2}`);
      for (const command of commands) engine.enqueue({ ...command, runId: `guided-${protocol.id}-${s2}` });
      assert.ok(engine.advanceTo(6000).some(event => event.type === 'activation' && event.nodeId === 'V'));
    }
  }
});

function activationsOf(world, commands, runId, untilMs = 7000) {
  const engine = new Engine();
  engine.reset(world, runId);
  for (const command of commands) engine.enqueue({ ...command, runId });
  const events = [];
  for (let t = 1000; t <= untilMs; t += 1000) events.push(...engine.advanceTo(t));
  return events.filter(event => event.type === 'activation').map(event => [event.nodeId, event.tMs]);
}

test('Model edits carry into a new run as t = 0 commands and match the edited world', () => {
  const state = createParameterState(echoWorld);
  for (const [target, param, value] of [
    [{ kind: 'node', id: 'FP' }, 'erpMaxMs', 290],
    [{ kind: 'link', id: 'SL', direction: 'ab' }, 'decrement.maxExtraMs', 45],
    [{ kind: 'link', id: 'CF', direction: 'ab' }, 'delayMs', 14],
  ]) applyCommand(state, editCommand(state, target, param, value));
  assert.deepEqual([...modifiedElements(echoWorld, state).nodes], ['FP']);
  const carried = carryCommands(echoWorld, state);
  assert.ok(carried.length >= 3);
  // Replaying the carried bodies onto a fresh state reproduces the edits exactly.
  const replay = createParameterState(echoWorld);
  for (const body of carried) applyCommand(replay, body);
  assert.deepEqual(replay, state);
  // And the engine run with carried commands matches a run of the edited world.
  const protocol = echoPresentation.protocols[0].commands(280);
  const carriedRun = activationsOf(echoWorld, [...protocol, ...carried.map((body, i) => ({ ...body, commandId: `carry-${i + 1}`, tMs: 0 }))], 'carry');
  const editedRun = activationsOf(worldFromState(echoWorld, state), protocol, 'edited');
  assert.deepEqual(carriedRun, editedRun);
  assert.deepEqual(carryCommands(echoWorld, createParameterState(echoWorld)), []);
});

test('Runner presets build valid protocols; S1–S2 on Echo plots the jump and the ERPs', () => {
  const labels = SCENES.echo.labels.lab;
  const protocol = buildProtocol('s1s2', { siteId: 'CSp', driveCycleMs: 600, driveCount: 8, fromMs: 400, toMs: 200, stepMs: 10 }, { labels });
  const result = runProtocolSync(echoWorld, protocol);
  assert.ok(result.summary.jump && result.summary.jump.jumpMs >= 50);
  assert.deepEqual(Object.keys(result.summary.erps).sort(), ['CSp', 'FP', 'SP']);
  const [conduction, output] = plotsForResult('s1s2', result, labels);
  assert.match(conduction.summary, /^Jump of \d+ ms at \d+ ms\.$/);
  assert.match(output.summary, /fast pathway ERP/);
  assert.ok(conduction.table.rows.length > 10 && output.table.rows.length > 10);
  const incremental = runProtocolSync(echoWorld, buildProtocol('incremental', { siteId: 'CSp', fromMs: 400, toMs: 300, stepMs: 50, beats: 12 }));
  assert.equal(plotsForResult('incremental', incremental)[0].kind, 'incremental');
});

test('Liner notes render as escaped HTML and the Echo draft is marked', () => {
  const echo = readFileSync(path.join(root, 'src/content/notes/echo.md'), 'utf8');
  assert.ok(isDraft(echo));
  const html = renderNotes(echo);
  for (const heading of ['The musical idea', 'What the tissue is doing', 'How the model makes it', 'A note from history', 'Try this', 'Further reading']) {
    assert.ok(html.includes(`<h3>${heading}</h3>`), heading);
  }
  assert.ok(html.includes('<strong>DRAFT'));
  assert.doesNotMatch(html, /<!--/);
  assert.equal(renderNotes('<img src=x onerror=alert(1)> **b**'), '<p>&lt;img src=x onerror=alert(1)&gt; <strong>b</strong></p>');
});

test('Single-file build: no network references, Echo bundled, embedded worker runs a protocol', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'counterpoint-build-'));
  try {
    const out = path.join(dir, 'counterpoint.html');
    execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs'), '--out', out]);
    const html = readFileSync(out, 'utf8');
    assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i);
    assert.doesNotMatch(html, /@import|url\(\s*["']?https?:/i);
    assert.equal(html.match(/<script/g).length, 2);
    assert.ok(html.includes('data-world="echo"'));
    assert.ok(html.includes('An arpeggio folds into a chord'));
    assert.ok(html.includes('DRAFT — creator writes final text'));
    const worker = html.match(/<script type="text\/plain" id="protocol-worker-source">([\s\S]*?)<\/script>/)[1];
    const app = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.ok(app.length > 100000 && worker.length > 50000);
    // Run the embedded worker bundle in a stand-in worker scope.
    class WorkerGlobalScope {
      listeners = [];
      posted = [];
      addEventListener(type, fn) { if (type === 'message') this.listeners.push(fn); }
      postMessage(data) { this.posted.push(structuredClone(data)); }
    }
    const scope = new WorkerGlobalScope();
    runInNewContext(worker, { self: scope, WorkerGlobalScope, AbortController, DOMException, setTimeout, structuredClone, Date, console });
    assert.equal(scope.listeners.length, 1);
    const protocol = buildProtocol('s1s2', { siteId: 'CSp', driveCycleMs: 600, driveCount: 8, fromMs: 320, toMs: 280, stepMs: 10 }, { labels: SCENES.echo.labels.lab });
    scope.listeners[0]({ data: { id: 7, type: 'run', world: structuredClone(echoWorld), protocol } });
    for (let i = 0; i < 200 && !scope.posted.some(message => message.type !== 'progress'); i++) await new Promise(resolve => setTimeout(resolve, 5));
    const final = scope.posted.find(message => message.type !== 'progress');
    assert.equal(final?.type, 'result', JSON.stringify(final));
    assert.deepEqual(final.result.rows, runProtocolSync(echoWorld, protocol).rows);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Playback speeds run from 1/4 to 1/12 of real time and read as fractions', async () => {
  const { DILATIONS, dilationLabel } = await import('../src/ui/preferences.js');
  const { MAX_DILATION, createTransport } = await import('../src/runtime/transport.js');
  assert.deepEqual(DILATIONS, [4, 5, 6, 8, 10, 12]);
  assert.equal(MAX_DILATION, 12);
  assert.equal(dilationLabel(4), '1/4');
  assert.equal(dilationLabel(8), '1/8');
  assert.equal(dilationLabel(12), '1/12');
  assert.equal(typeof createTransport, 'function');
});
