// Plot catalog tests. Run directly with an output directory to render the
// receipt sheets: node tests/lab-plots.test.js docs/runs
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { activationTimes, conductionDots, erpSequence, intervals, phaseDots, restitutionDots } from '../src/lab/measure.js';
import { pacingCommands, runProtocolSync, simulate } from '../src/lab/protocols.js';
import { LAB_STYLE, PLOT_CATALOG, drawPlot, entrainmentMapData, handlePoints, tableHtml, valueAtPixel } from '../src/lab/plots.js';
import { circulationWorld } from '../src/worlds/circulation.js';
import { chainWorld, entryRingWorld, focusWorld, hemiolaWorld, restitutionLaw, restitutionWorld } from './engine-v11-scenes.js';
import { ECHO_LABELS, ECHO_SITES, echoPlateWorld, echoV11World } from './lab-worlds.js';

const require = createRequire(import.meta.url);
const canvasModule = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/@napi-rs/canvas`
  : '@napi-rs/canvas';
const { createCanvas, GlobalFonts } = require(canvasModule);
const FONT_DIR = '/home/claude/fonts/ttf/';
for (const name of ['eb-garamond-latin-400-italic', 'eb-garamond-latin-400-normal', 'inter-latin-300-normal', 'inter-latin-400-normal']) {
  if (existsSync(`${FONT_DIR}${name}.ttf`)) GlobalFonts.registerFromPath(`${FONT_DIR}${name}.ttf`, name.startsWith('eb') ? 'EB Garamond' : 'Inter');
}

// Every input below comes from engine runs; nothing is drawn from a prototype.
export function buildModels() {
  const echo = echoV11World();
  // Fast-pathway restitution with a live point, from a drive and one extrastimulus.
  const drive = [...pacingCommands(echo, { id: 'S1', nodeId: 'CSp', startMs: 200, cycleMs: 600, count: 8 }), { commandId: 'S2', tMs: 4700, type: 'stimulate', nodeId: 'CSp' }];
  const fpRun = simulate(echo, drive, 5200, { runId: 'plot-fp' });
  const fp = echo.nodes.find(n => n.id === 'FP');
  const lastFp = fpRun.events.filter(e => e.type === 'activation' && e.nodeId === 'FP').at(-1);
  const restitution = PLOT_CATALOG.restitution.build({
    siteLabel: 'fast pathway', law: { ...fp.restitution, erpMinMs: 200 }, dots: restitutionDots(fpRun.events, 'FP'), live: { diMs: 5200 - lastFp.refractoryUntilMs },
  });
  // Slow-pathway conduction: every SP→LCP launch over an S2 scan (plate 6 right panel).
  const plate = echoPlateWorld();
  const slDots = [];
  const echoSl = [];
  for (let s2 = 440; s2 >= 240; s2 -= 8) {
    const cmds = [...pacingCommands(plate, { id: 'S1', nodeId: 'CSp', startMs: 200, cycleMs: 600, count: 8 }), { commandId: 'S2', tMs: 4400 + s2, type: 'stimulate', nodeId: 'CSp' }];
    slDots.push(...conductionDots(simulate(plate, cmds, 4400 + s2 + 1500, { runId: 'sl' }).events, 'SL', 'SP').filter(d => d.tMs > 4390));
    const cmds11 = [...pacingCommands(echo, { id: 'S1', nodeId: 'CSp', startMs: 200, cycleMs: 600, count: 8 }), { commandId: 'S2', tMs: 4400 + s2, type: 'stimulate', nodeId: 'CSp' }];
    echoSl.push(...conductionDots(simulate(echo, cmds11, 4400 + s2 + 1500, { runId: 'sl11' }).events, 'SL', 'SP').filter(d => d.tMs > 4390));
  }
  const conduction = PLOT_CATALOG.conduction.build({ linkLabel: 'slow pathway', delayMs: 160, decrement: { maxExtraMs: 60, tauMs: 120 }, dots: slDots });
  const conduction11 = PLOT_CATALOG.conduction.build({ linkLabel: 'slow pathway (v1.1)', delayMs: 160, decrement: { maxExtraMs: 60, tauMs: 120 }, entry: { maxExtraMs: 30, tauMs: 80 }, dots: echoSl });
  const s1s2 = runProtocolSync(plate, { type: 's1s2', siteId: 'CSp', driveCycleMs: 600, driveCount: 8, s2: { fromMs: 440, toMs: 200, stepMs: 4 }, sites: ECHO_SITES, labels: { ...ECHO_LABELS, CSp: 'atrial', SP: 'slow', FP: 'fast' }, erpSites: ['CSp', 'FP', 'SP'] });
  const s1s2Output = PLOT_CATALOG.s1s2Output.build(s1s2);
  const s1s2Conduction = PLOT_CATALOG.s1s2Conduction.build(s1s2);
  // Return plots: breath (§C), Meter (§E chain at 310 ms, 5:4), Hemiola drifting and locked (§D).
  const breath = simulate(focusWorld({ overdrive: null, autonomic: { breathPeriodMs: 4000, depth: 0.05, targets: ['sinus'] } }), [], 170000, { runId: 'breath' });
  const meter = simulate(chainWorld(), pacingCommands(chainWorld(), { id: 'M', nodeId: 'A', startMs: 0, cycleMs: 310, count: 64 }), 64 * 310, { runId: 'meter' });
  const drift = simulate(hemiolaWorld(0.08), [], 400000, { runId: 'h1' });
  const locked = simulate(hemiolaWorld(0.17), [], 400000, { runId: 'h2' });
  const returns = {
    breath: PLOT_CATALOG.returnPlot.build({ intervals: intervals(activationTimes(breath.events, 'S')), siteLabel: 'Prelude · breath', title: 'Prelude · breath', subtitle: 'Sinus RR(n) against RR(n+1) · engine §C breath', limits: [740, 860] }),
    meter: PLOT_CATALOG.returnPlot.build({ intervals: intervals(activationTimes(meter.events, 'H')), siteLabel: 'Meter · 5 : 4', title: 'Meter · 5 : 4', subtitle: 'His intervals, drive 310 ms · engine §E chain', limits: [250, 700] }),
    drift: PLOT_CATALOG.returnPlot.build({ intervals: intervals(activationTimes(drift.events, 'B')), siteLabel: 'Hemiola · drifting', title: 'Hemiola · drifting', subtitle: 'B intervals, coupling 0.08 · engine §D', color: LAB_STYLE.blue, limits: [880, 1180] }),
    locked: PLOT_CATALOG.returnPlot.build({ intervals: intervals(activationTimes(locked.events, 'B')), siteLabel: 'Hemiola · locked 2 : 3', title: 'Hemiola · locked 2 : 3', subtitle: 'B intervals, coupling 0.17 · engine §D', color: LAB_STYLE.blue, limits: [880, 1180] }),
  };
  const sweep = runProtocolSync(hemiolaWorld(0.17), { type: 'couplingSweep', couplingId: 'AB', from: 0, to: 0.3, step: 0.0025, cycles: 300 });
  const staircase = PLOT_CATALOG.staircase.build(sweep, { current: 0.17 });
  const phase = PLOT_CATALOG.phaseResponse.build({ cycleMs: 1030, amplitude: 0.08, dots: phaseDots(drift.events, 'B').slice(-150) });
  const restRun = simulate(restitutionWorld(), pacingCommands(restitutionWorld(), { id: 'T', nodeId: 'A', startMs: 0, cycleMs: 300, count: 40 }), 12100, { runId: 'cob' });
  const cobweb = PLOT_CATALOG.cobweb.build({ siteLabel: 'test site', law: restitutionLaw, cycleMs: 300, erps: erpSequence(restRun.events, 'A') });
  const incremental = PLOT_CATALOG.incremental.build(runProtocolSync(chainWorld(), { type: 'incremental', siteId: 'A', outputId: 'H', cycles: { fromMs: 400, toMs: 250, stepMs: 10 }, beats: 32 }), { outputLabel: 'A–H' });
  const resetting = PLOT_CATALOG.resetting.build(runProtocolSync(entryRingWorld(), {
    type: 'resetting', siteId: 'R0', induction: [{ commandId: 'S', tMs: 0, type: 'stimulate', nodeId: 'R4' }], couplings: { fromMs: 320, toMs: 150, stepMs: 5 },
  }));
  // The ring plus a bystander X hanging off R0 (60 ms each way): PPI − TCL there is 2 × 60.
  const spur = structuredClone(circulationWorld);
  spur.nodes.push({ id: 'X', erpMs: 200, recoveryTailMs: 120, automaticity: null });
  spur.links.push({ id: 'LX', a: 'R0', b: 'X', enabled: true, ab: { enabled: true, delayMs: 60, decrement: null }, ba: { enabled: true, delayMs: 60, decrement: null } });
  const entResult = runProtocolSync(spur, {
    type: 'entrainment', candidates: ['R0', 'R2', 'R4', 'R6', 'X'],
    induction: [{ commandId: 'S1', tMs: 0, type: 'stimulate', nodeId: 'R0' }, { commandId: 'S2', tMs: 240, type: 'stimulate', nodeId: 'R0' }],
  });
  const entrainment = PLOT_CATALOG.entrainment.build(entResult);
  return { restitution, conduction, conduction11, s1s2Output, s1s2Conduction, returns, staircase, phase, cobweb, incremental, resetting, entrainment, entResult };
}

function sheet(width, height, panels, caption) {
  const dpr = 2;
  const canvas = createCanvas(width * dpr, height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = LAB_STYLE.background;
  ctx.fillRect(0, 0, width, height);
  for (const [model, rect, options] of panels) drawPlot(ctx, model, rect, options);
  if (caption) {
    ctx.fillStyle = LAB_STYLE.text;
    ctx.font = `italic 400 24px ${LAB_STYLE.serif}`;
    ctx.textAlign = 'center';
    ctx.fillText(caption[0], width / 2, height - 42);
    ctx.fillStyle = LAB_STYLE.text2;
    ctx.font = `300 11px ${LAB_STYLE.sans}`;
    ctx.fillText(caption[1], width / 2, height - 18);
  }
  return canvas;
}

export function renderSheets(models) {
  const m = models;
  const plate6 = sheet(1200, 560, [
    [m.restitution, { x: 40, y: 40, width: 340, height: 420 }, { activeHandle: 'tau' }],
    [m.s1s2Output, { x: 430, y: 40, width: 340, height: 420 }],
    [m.conduction, { x: 820, y: 40, width: 350, height: 420 }],
  ], ['Model · visible and adjustable', 'Lab 14f · every panel drawn by src/lab/plots.js from engine runs; handles are the inspector card\'s editable points.']);
  const plate4 = sheet(1200, 760, [
    [m.s1s2Conduction, { x: 40, y: 40, width: 520, height: 300 }],
    [m.returns.breath, { x: 620, y: 40, width: 270, height: 300 }],
    [m.returns.meter, { x: 910, y: 40, width: 270, height: 300 }],
    [m.staircase, { x: 40, y: 380, width: 520, height: 300 }],
    [m.returns.drift, { x: 620, y: 380, width: 270, height: 300 }],
    [m.returns.locked, { x: 910, y: 380, width: 270, height: 300 }],
  ], ['Laboratory · curves and return plots', 'Lab 14f · all panels are engine runs: the jump uses the Echo plate tuning, the others contract 1.1.0 §C–§E. Points fade with age.']);
  const protocols = sheet(1200, 760, [
    [m.incremental, { x: 40, y: 40, width: 360, height: 300 }],
    [m.resetting, { x: 430, y: 40, width: 360, height: 300 }],
    [m.entrainment, { x: 820, y: 40, width: 350, height: 300 }],
    [m.cobweb, { x: 40, y: 380, width: 360, height: 320 }],
    [m.phase, { x: 430, y: 380, width: 360, height: 300 }],
    [m.conduction11, { x: 820, y: 380, width: 350, height: 320 }],
  ], null);
  return { plate6, plate4, protocols };
}

test('Every catalog plot builds from engine data, draws, and has a table and a one-sentence summary', () => {
  const models = buildModels();
  const all = [models.restitution, models.conduction, models.conduction11, models.s1s2Output, models.s1s2Conduction, ...Object.values(models.returns),
    models.staircase, models.phase, models.cobweb, models.incremental, models.resetting, models.entrainment];
  assert.equal(new Set(all.map(m => m.kind)).size, Object.keys(PLOT_CATALOG).length);
  const canvas = createCanvas(400, 320);
  const ctx = canvas.getContext('2d');
  for (const model of all) {
    const entry = PLOT_CATALOG[model.kind];
    assert.ok(entry, model.kind);
    entry.draw(ctx, model, { x: 0, y: 0, width: 400, height: 320 });
    const table = entry.table(model);
    assert.ok(table.rows.length > 0, `${model.kind} table`);
    assert.ok(table.columns.length === table.rows[0].length, `${model.kind} columns`);
    assert.match(tableHtml(table), /^<table><caption>/);
    const summary = entry.summary(model);
    assert.match(summary, /^[^.]*\S.*\.$/s, `${model.kind} summary`);
  }
  assert.equal(models.s1s2Conduction.summary, 'Jump of 178 ms at 296 ms.');
  assert.match(models.s1s2Output.summary, /fast ERP 296–300 ms; slow ERP 236–240 ms; atrial ERP 228–232 ms/);
  assert.match(models.restitution.summary, /(\d+) of \1 captures lie on the curve/);
  assert.deepEqual(entrainmentMapData(models.entResult).R0, { ppiMinusTclMs: 0, captured: true, near: true });
  assert.deepEqual(entrainmentMapData(models.entResult).X, { ppiMinusTclMs: 120, captured: true, near: false });
});

test('Handle geometry: pixel positions invert back to the handle values', () => {
  const model = PLOT_CATALOG.restitution.build({ siteLabel: 'x', law: { erpMaxMs: 300, amplitudeMs: 60, tauMs: 120, erpMinMs: 200 } });
  const rect = { x: 10, y: 20, width: 360, height: 400 };
  for (const handle of handlePoints(model, rect)) {
    const value = valueAtPixel(model, rect, handle, handle.px, handle.py);
    const expected = handle.axis === 'x' ? handle.x : handle.y;
    assert.ok(Math.abs(value - expected) < 1e-6, handle.id);
  }
  assert.deepEqual(handlePoints(model, rect).map(h => h.id), ['erpMax', 'amplitude', 'tau']);
});

if (process.argv[2]) {
  const sheets = renderSheets(buildModels());
  for (const [name, canvas] of Object.entries(sheets)) {
    const file = `${process.argv[2]}/lab-01-${name}.png`;
    writeFileSync(file, canvas.toBuffer('image/png'));
    console.log(`wrote ${file}`);
  }
}
