// Laboratory panel for Study No. 2 studies (v0.2: Echo): protocol runner,
// plots with data-table alternatives, CSV export, live curves, glossary cards
// and model notes. Full EP nomenclature lives here (spec, audience rule).
//
// The runner builds a fresh engine per step from the world the model currently
// describes (preset plus the player's edits), never from live state, so its
// results are deterministic. It runs in a Web Worker when one can be started:
// in the single-file build the worker's bundled source is embedded as
// a text/plain script element (id protocol-worker-source) and loaded as a
// classic worker from a Blob URL; if that fails, protocols run on the main
// thread in 12 ms slices.
import { createProtocolRunner } from '../lab/worker.js';
import { protocolCsv } from '../lab/protocols.js';
import { PLOT_CATALOG, drawPlot, tableHtml } from '../lab/plots.js';
import { cardModel } from '../lab/inspector-card.js';
import { activationTimes, intervals } from '../lab/measure.js';

export function protocolWorkerUrl(doc = globalThis.document) {
  const source = doc?.getElementById?.('protocol-worker-source')?.textContent ?? '';
  if (!source.trim() || typeof Blob !== 'function' || typeof URL?.createObjectURL !== 'function') return null;
  try {
    return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  } catch {
    return null;
  }
}

// Protocol presets for Echo. Values follow the Echo receipt (studies-01) and the
// guided "Find the echo" protocol; the runner fields are editable.
export const RUNNER_PRESETS = Object.freeze({
  s1s2: { label: 'S1–S2 decremental atrial extrastimulus', fields: { siteId: 'CSp', driveCycleMs: 600, driveCount: 8, fromMs: 400, toMs: 200, stepMs: 10 } },
  s1s2s3: { label: 'S1–S2–S3 atrial extrastimuli', fields: { siteId: 'CSp', driveCycleMs: 600, driveCount: 8, s2Ms: 300, fromMs: 400, toMs: 200, stepMs: 10 } },
  incremental: { label: 'Incremental atrial pacing', fields: { siteId: 'CSp', fromMs: 600, toMs: 250, stepMs: 10, beats: 16 } },
});

const FIELD_LABELS = {
  siteId: 'Pacing site', driveCycleMs: 'Drive cycle (ms)', driveCount: 'Drive beats', s2Ms: 'S2 coupling (ms)',
  fromMs: 'From (ms)', toMs: 'To (ms)', stepMs: 'Step (ms)', beats: 'Beats per step',
};

export function buildProtocol(kind, fields, { his = 'H', ventricle = 'V', labels = {}, erpSites = ['CSp', 'FP', 'SP'] } = {}) {
  const sites = { atrium: fields.siteId, his, ventricle };
  const range = { fromMs: fields.fromMs, toMs: fields.toMs, stepMs: fields.stepMs };
  if (kind === 's1s2') {
    return { type: 's1s2', siteId: fields.siteId, driveCycleMs: fields.driveCycleMs, driveCount: fields.driveCount, s2: range, sites, labels, erpSites };
  }
  if (kind === 's1s2s3') {
    return { type: 's1s2', siteId: fields.siteId, driveCycleMs: fields.driveCycleMs, driveCount: fields.driveCount, s2: fields.s2Ms, s3: range, sites, labels, erpSites };
  }
  return { type: 'incremental', siteId: fields.siteId, outputId: his, cycles: range, beats: fields.beats };
}

export function plotsForResult(kind, result, labels = {}) {
  if (kind === 'incremental') return [PLOT_CATALOG.incremental.build(result, { outputLabel: 'A–H' })];
  return [
    PLOT_CATALOG.s1s2Conduction.build(result, { atriumLabel: labels.CSp === 'atrial' ? 'septal atrium' : (labels[result.protocol.siteId] ?? 'atrium'), outputLabel: 'His' }),
    PLOT_CATALOG.s1s2Output.build(result, { output: 'h1h2Ms', outputLabel: 'H1–H2', erpSites: result.protocol.erpSites }),
  ];
}

function sizeAndDraw(canvas, model) {
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 240;
  const dpr = Math.min(2.5, globalThis.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
  if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  drawPlot(ctx, model, { x: 0, y: 0, width, height });
}

export function createStudyLab(container, { onDownload, onNotes, workerUrl = null, document: doc = container.ownerDocument } = {}) {
  const runner = createProtocolRunner({ workerUrl, workerType: 'classic' });
  let scene = null;
  let world = null;
  let getWorld = () => world;
  let controller = null;
  let lastRun = null;
  let resultFigures = [];
  let live = { events: [], snapshot: null, tMs: 0, state: null };
  let lastLiveDraw = -Infinity;

  const el = (tag, attrs = {}, text = null) => {
    const node = doc.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'className') node.className = value;
      else node.setAttribute(key, value);
    }
    if (text !== null) node.textContent = text;
    return node;
  };

  container.classList.add('study-lab');
  container.innerHTML = `
    <section class="study-lab-panel study-lab-about" aria-labelledby="study-lab-title">
      <h3 id="study-lab-title"></h3>
      <p class="study-lab-mechanism" data-read="mechanism"></p>
      <p class="study-lab-guided" data-read="guided" aria-live="polite"></p>
      <p class="study-lab-model-note">Model note: a lumped-element model. Sites are a graph, not a continuum; each site has one ERP law and there are no ionic currents. Electrograms on Staves are synthetic.</p>
      <button type="button" data-control="notes">Read the liner notes (draft)</button>
    </section>
    <section class="study-lab-panel" aria-labelledby="study-runner-title">
      <h3 id="study-runner-title">Protocol runner</h3>
      <p class="study-lab-hint">Runs headlessly on fresh engines built from the current model parameters. The performance keeps playing.</p>
      <label class="study-lab-field">Protocol <select data-control="protocol"></select></label>
      <div class="study-lab-fields" data-control="fields"></div>
      <div class="study-lab-actions">
        <button type="button" data-control="run" class="primary">Run protocol</button>
        <button type="button" data-control="cancel" disabled>Cancel</button>
        <button type="button" data-control="csv" disabled>Export CSV</button>
      </div>
      <progress data-control="progress" max="1" value="0" aria-label="Protocol progress"></progress>
      <p class="study-lab-status" data-read="status" aria-live="polite"></p>
      <div class="study-lab-plots" data-control="results"></div>
    </section>
    <section class="study-lab-panel" aria-labelledby="study-curves-title">
      <h3 id="study-curves-title">Live curves</h3>
      <p class="study-lab-hint">Line = model law, dots = this performance's engine events. Press and hold a site or connection on the canvas to edit it.</p>
      <div class="study-lab-curve-controls">
        <label class="study-lab-field">Site <select data-control="curve-site"></select></label>
        <label class="study-lab-field">Link <select data-control="curve-link"></select></label>
        <label class="study-lab-field">Return plot <select data-control="return-site"></select></label>
      </div>
      <div class="study-lab-plots" data-control="curves"></div>
    </section>
    <section class="study-lab-panel" aria-labelledby="study-words-title">
      <h3 id="study-words-title">Words in this study</h3>
      <div class="study-lab-glossary" data-control="glossary"></div>
    </section>`;

  const read = Object.fromEntries([...container.querySelectorAll('[data-read]')].map(node => [node.dataset.read, node]));
  const control = Object.fromEntries([...container.querySelectorAll('[data-control]')].map(node => [node.dataset.control, node]));
  const title = container.querySelector('#study-lab-title');
  for (const [id, preset] of Object.entries(RUNNER_PRESETS)) control.protocol.append(el('option', { value: id }, preset.label));

  function figure(model, { tall = false } = {}) {
    const wrap = el('figure', { className: 'study-lab-figure' });
    const canvas = el('canvas', { className: tall ? 'tall' : '', role: 'img', 'aria-label': `${model.title}. ${model.summary}` });
    const caption = el('figcaption', {}, model.summary);
    const details = el('details', { className: 'study-lab-table' });
    details.append(el('summary', {}, 'Data table'));
    const table = el('div');
    table.innerHTML = tableHtml(model.table);
    details.append(table);
    wrap.append(canvas, caption, details);
    return { wrap, canvas, model };
  }

  function buildFields() {
    const kind = control.protocol.value;
    const preset = RUNNER_PRESETS[kind];
    control.fields.replaceChildren();
    for (const [key, value] of Object.entries(preset.fields)) {
      const label = el('label', { className: 'study-lab-field' }, `${FIELD_LABELS[key]} `);
      let input;
      if (key === 'siteId') {
        input = el('select', { 'data-field': key });
        for (const node of world.nodes.filter(entry => entry.tissue === 'atrial')) input.append(el('option', { value: node.id }, `${scene.labels?.lab?.[node.id] ?? node.id} (${node.id})`));
        input.value = value;
      } else {
        input = el('input', { type: 'number', step: '1', min: key === 'stepMs' ? '1' : '1', max: '5000', 'data-field': key, value: String(value) });
      }
      label.append(input);
      control.fields.append(label);
    }
  }

  function fieldValues() {
    const values = {};
    for (const input of control.fields.querySelectorAll('[data-field]')) {
      values[input.dataset.field] = input.dataset.field === 'siteId' ? input.value : Number(input.value);
    }
    return values;
  }

  function validate(kind, fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'siteId') continue;
      if (!Number.isFinite(value) || value <= 0) return `${FIELD_LABELS[key]} must be a positive number.`;
    }
    if (fields.driveCycleMs !== undefined && fields.driveCycleMs < 150) return 'The drive cycle must be at least 150 ms.';
    if (fields.driveCount !== undefined && (fields.driveCount < 1 || fields.driveCount > 64)) return 'Drive beats must be 1 to 64.';
    if (fields.beats !== undefined && (fields.beats < 2 || fields.beats > 64)) return 'Beats per step must be 2 to 64.';
    const steps = Math.abs(fields.toMs - fields.fromMs) / fields.stepMs + 1;
    if (steps > 400) return 'That range has more than 400 steps: use a coarser step.';
    if (kind === 'incremental' && Math.min(fields.fromMs, fields.toMs) < 150) return 'Cycles below 150 ms are outside the train limits.';
    return null;
  }

  function showResult(kind, result) {
    read.status.textContent = `${result.text} (${result.rows.length} engine runs, ${runner.mode === 'worker' ? 'Web Worker' : 'main thread'}).`;
    resultFigures = plotsForResult(kind, result, scene.labels?.lab ?? {}).map(model => figure(model));
    control.results.replaceChildren(...resultFigures.map(item => item.wrap));
    drawResults();
    control.csv.disabled = false;
  }

  function drawResults() {
    for (const { canvas, model } of resultFigures) sizeAndDraw(canvas, model);
  }

  if (typeof ResizeObserver === 'function') {
    // Keep the canvas backing sizes in sync when the inspector card opens or closes.
    let lastWidth;
    new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (width !== lastWidth && width > 0) drawResults();
      lastWidth = width;
    }).observe(control.results);
  }

  async function run() {
    if (controller) return;
    const kind = control.protocol.value;
    const fields = fieldValues();
    const problem = validate(kind, fields);
    if (problem) {
      read.status.textContent = problem;
      return;
    }
    const protocol = buildProtocol(kind, fields, { labels: scene.labels?.lab ?? {} });
    controller = new AbortController();
    control.run.disabled = true;
    control.cancel.disabled = false;
    control.csv.disabled = true;
    control.progress.value = 0;
    read.status.textContent = 'Running…';
    try {
      const result = await runner.run(getWorld(), protocol, {
        signal: controller.signal,
        onProgress: ({ done, total }) => { control.progress.value = total ? done / total : 0; },
      });
      control.progress.value = 1;
      lastRun = { kind, result };
      showResult(kind, result);
    } catch (error) {
      read.status.textContent = error?.name === 'AbortError' ? 'Protocol cancelled.' : `The protocol stopped: ${error?.message ?? error}`;
    } finally {
      controller = null;
      control.run.disabled = false;
      control.cancel.disabled = true;
    }
  }

  function drawLive(force = false) {
    if (!scene || !live.state || container.closest?.('[hidden]')) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (!force && now - lastLiveDraw < 500) return;
    lastLiveDraw = now;
    const labels = scene.labels?.lab ?? {};
    const site = control['curve-site'].value;
    const linkId = control['curve-link'].value;
    const link = world.links.find(entry => entry.id === linkId);
    const direction = link.ab.enabled ? 'ab' : 'ba';
    const models = [
      cardModel(live.state, { kind: 'node', id: site }, { events: live.events, snapshot: live.snapshot, tMs: live.tMs, labels, compact: false }),
      cardModel(live.state, { kind: 'link', id: linkId, direction, from: direction === 'ab' ? link.a : link.b }, { events: live.events, snapshot: live.snapshot, tMs: live.tMs, labels, compact: false }),
      PLOT_CATALOG.returnPlot.build({ intervals: intervals(activationTimes(live.events, control['return-site'].value)), siteLabel: labels[control['return-site'].value] ?? control['return-site'].value }),
    ];
    const existing = [...control.curves.children];
    if (existing.length !== models.length) {
      control.curves.replaceChildren(...models.map(model => figure(model).wrap));
    }
    [...control.curves.children].forEach((wrap, index) => {
      const model = models[index];
      wrap.querySelector('canvas').setAttribute('aria-label', `${model.title}. ${model.summary}`);
      const caption = wrap.querySelector('figcaption');
      if (caption.textContent !== model.summary) caption.textContent = model.summary;
      const table = wrap.querySelector('details');
      if (table.open) table.querySelector('div').innerHTML = tableHtml(model.table);
      sizeAndDraw(wrap.querySelector('canvas'), model);
    });
  }

  control.protocol.onchange = buildFields;
  control.run.onclick = run;
  control.cancel.onclick = () => controller?.abort();
  control.csv.onclick = () => {
    if (!lastRun) return;
    const { kind, result } = lastRun;
    onDownload?.(`counterpoint-${scene.id}-${kind}.csv`, protocolCsv(result), 'text/csv');
  };
  control.notes.onclick = () => onNotes?.();
  for (const id of ['curve-site', 'curve-link', 'return-site']) control[id].onchange = () => drawLive(true);

  return {
    get runnerMode() { return runner.mode; },
    get lastResult() { return lastRun?.result ?? null; },
    setScene(nextScene, nextWorld, { currentWorld } = {}) {
      scene = nextScene;
      world = nextWorld;
      getWorld = currentWorld ?? (() => world);
      lastRun = null;
      resultFigures = [];
      control.results.replaceChildren();
      control.curves.replaceChildren();
      control.csv.disabled = true;
      control.progress.value = 0;
      read.status.textContent = '';
      title.textContent = `${scene.numeral} · ${scene.name}`;
      read.mechanism.textContent = scene.mechanism ?? '';
      read.guided.textContent = '';
      const labels = scene.labels?.lab ?? {};
      const option = (id, text) => el('option', { value: id }, text);
      control['curve-site'].replaceChildren(...world.nodes.filter(node => node.restitution).map(node => option(node.id, `${labels[node.id] ?? node.id} (${node.id})`)));
      control['curve-site'].value = world.nodes.some(node => node.id === 'FP') ? 'FP' : world.nodes[0].id;
      control['curve-link'].replaceChildren(...world.links.map(link => option(link.id, `${labels[link.id] ?? link.id} (${link.id})`)));
      control['curve-link'].value = world.links.some(link => link.id === 'SL') ? 'SL' : world.links[0].id;
      control['return-site'].replaceChildren(...world.nodes.filter(node => node.audible !== false).map(node => option(node.id, `${labels[node.id] ?? node.id} (${node.id})`)));
      control['return-site'].value = world.nodes.some(node => node.id === 'V') ? 'V' : world.nodes[0].id;
      buildFields();
    },
    setGlossary(entries, studyId) {
      control.glossary.closest('section').hidden = entries.length === 0;
      control.glossary.replaceChildren(...entries.map(entry => {
        const card = el('article', { className: `study-lab-word layer-${entry.layer}` });
        card.append(el('h4', {}, entry.term));
        for (const sentence of entry.short) card.append(el('p', {}, sentence));
        if (entry.studyNotes?.[studyId]) card.append(el('p', { className: 'study-note' }, entry.studyNotes[studyId]));
        return card;
      }));
    },
    setGuided(text) { read.guided.textContent = text; },
    update(next) {
      live = next;
      drawLive();
    },
    redraw() {
      drawLive(true);
      drawResults();
    },
    terminate() { runner.terminate(); },
  };
}
