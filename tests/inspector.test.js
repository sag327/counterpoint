import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInspector } from '../src/ui/inspector.js';
import { Engine } from '../src/engine/index.js';
import { createCirculationWorld } from '../src/worlds/circulation.js';
import { createConductionWorld } from '../src/worlds/conduction.js';
import { describeNodeMusic } from '../src/music/index.js';

class Element {
  constructor(tag, identifier = {}) {
    this.tag = tag;
    this.dataset = identifier;
    this.children = [];
    this.attributes = {};
    this.classList = { add() {} };
    this.textContent = '';
  }
  get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  append(...children) { this.children.push(...children.flatMap(child => child.tag === 'fragment' ? child.children : child)); }
  replaceChildren(...children) { this.children = []; this.append(...children); }
}
test('Laboratory renders actual state at the presentation boundary and routes validated controls', () => {
  const doc = {
    createElement: tag => new Element(tag),
    createDocumentFragment: () => new Element('fragment'),
    createElementNS: (_, tag) => doc.createElement(tag),
  };
  const tree = new Element('aside');
  tree.ownerDocument = doc;
  Object.defineProperty(tree, 'innerHTML', { set(markup) {
    for (const type of ['read', 'control']) {
      this[type] = new Map([...markup.matchAll(new RegExp('data-' + type + '="([^"]+)"', 'g'))]
        .map(([, key]) => [key, new Element(type, { [type]: key })]));
    }
    this.control.get("raster").ownerDocument = doc;
    this.ids = new Map([...markup.matchAll(/ id="([^"]+)"/g)].map(([, key]) => [key, new Element('lookup')]));
    this.filters = [...markup.matchAll(/type="checkbox" value="([^"]+)" checked/g)]
      .map(([, value]) => Object.assign(new Element('input'), { value, checked: true }));
  }});
  tree.querySelector = selector => tree.ids.get(selector.slice(1));
  tree.querySelectorAll = selector => {
    if (selector === '[data-read]') return tree.read.values();
    if (selector === '[data-control]') return tree.control.values();
    return tree.filters;
  };

  const callbackCalls = [];
  const inspector = createInspector(tree, {
    onStimulus: (...args) => callbackCalls.push(['stimulus', ...args]),
    onToggleLink: (...args) => callbackCalls.push(['toggle', ...args]),
    onSelectNode: (...args) => callbackCalls.push(['site', ...args]),
    onSelectLink: (...args) => callbackCalls.push(['link', ...args]),
    onProtocolChange: (...args) => callbackCalls.push(['coupling', ...args]),
    onRunProtocol: (...args) => callbackCalls.push(['protocol', ...args]),
    onReset: (...args) => callbackCalls.push(['reset', ...args]),
  });
  const reading = k => tree.read.get(k).textContent;
  const control = k => tree.control.get(k);
  const log = () => tree.ids.get('log').children;
  const rasterMarks = k => control('raster').children.filter(e => e.attributes.class === 'raster-' + k);
  const ring = createCirculationWorld();
  const engine = new Engine();
  engine.reset(ring, 'ring');
  for (const tMs of [0, 240]) engine.enqueue({ runId: 'ring', commandId: 's' + tMs, type: 'stimulate', nodeId: 'R0', tMs });
  engine.enqueue({ runId: 'ring', commandId: 'cut', type: 'setLinkEnabled', linkId: 'L0', enabled: false, tMs: 1210 });
  const ringEvents = engine.advanceTo(1250);
  function renderRing(tMs, site = 'R0') {
    inspector.render({ runId: 'ring', snapshot: engine.readAt(tMs), events: [], presentedMs: tMs }, {
      world: ring, worldName: 'Circulation', topology: 'Ring', events: ringEvents,
      transport: { status: 'running', dilation: 4 }, committedMs: 1250, lookaheadMs: 60, fps: 61,
      audioState: 'running', palette: 'chamber', audioDiagnostics: { masterGain: 0.3, activeVoices: 3, late: 2, stolen: 1 },
      couplingMs: 240, selectedNodeId: site, selectedLinkId: 'L0', nodeMusic: describeNodeMusic('circulation', site),
    });
  }
  renderRing(299, 'R1');
  assert.equal(reading('link-state'), 'Enabled');
  assert.equal(rasterMarks('blocked').length, 0);
  assert.equal(rasterMarks('stimulus').length, 2);
  assert.ok(log().every(row => row.children[2].textContent !== 'activation_blocked'));
  renderRing(300, 'R1');
  assert.equal(rasterMarks('blocked').length, 1);
  const blocked = log().find(row => row.children[2].textContent === 'activation_blocked');
  assert.deepEqual(blocked.children.map(cell => cell.textContent).slice(0, 6), ['300 ms', 'R1', 'activation_blocked', 'conduction', 'refractory', '240 ms']);
  assert.equal(reading('refractory'), 'Refractory until 360 ms');
  assert.equal(reading('presented'), '300 ms');
  assert.equal(reading('committed'), '1,250 ms');
  assert.equal(reading('fps'), '61 fps');
  assert.equal(reading('master-gain'), '30%');
  assert.equal(reading('voices'), '3');
  assert.equal(reading('stolen'), '1');
  assert.match(reading('note'), /F4 · 349.2 Hz · pluck/);
  for (const filter of tree.filters) filter.checked = filter.value === 'blocked';
  tree.filters[0].onchange();
  assert.equal(log().length, 1);
  assert.equal(rasterMarks('blocked').length, 1);

  renderRing(1200);
  assert.equal(reading('cycle-length'), '480 ms');
  assert.ok(rasterMarks('accepted').length > 20);
  assert.equal(reading('link-state'), 'Enabled');
  renderRing(1210);
  assert.equal(reading('link-state'), 'Cut');
  assert.equal(control('toggle-link').textContent, 'Restore link');
  assert.equal(reading('transits'), 'None');
  control('toggle-link').onclick();
  control('node').value = 'R4';
  control('node').onchange();
  control('link').value = 'L2';
  control('link').onchange();
  control('stimulate').onclick();
  control('single').onclick();
  control('reset').onclick();

  control('coupling').value = '0.5';
  control('coupling').oninput();
  control('coupling').onchange();
  assert.equal(control('coupling').attributes['aria-invalid'], 'true');
  assert.equal(control('guide').disabled, true);
  control('guide').onclick();
  control('coupling').value = '222';
  control('coupling').oninput();
  assert.equal(control('guide').disabled, false);
  control('coupling').onkeydown({ key: 'Enter', preventDefault() {} });
  control('guide').onclick();
  assert.deepEqual(callbackCalls, [
    ['toggle', 'L0'], ['site', 'R4'], ['link', 'L2'], ['stimulus', 'R4'],
    ['protocol', 'single', 'R4'], ['reset'], ['coupling', 222], ['protocol', 'guide', 'R0', 222],
  ]);

  const branch = createConductionWorld();
  engine.reset(branch, 'branch');
  engine.enqueue({ runId: 'branch', commandId: 'cycle', type: 'setAutomaticity', nodeId: 'S', cycleMs: 900, tMs: 50 });
  const branchEvents = engine.advanceTo(100);
  const contextual = { world: branch, events: [...ringEvents, ...branchEvents], transport: { status: 'paused', dilation: 4 },
    selectedLinkId: 'NH', selectedNodeId: 'S', nodeMusic: describeNodeMusic('conduction', 'S') };
  inspector.render({ runId: 'branch', snapshot: engine.readAt(49), presentedMs: 49 }, contextual);
  assert.equal(reading('automatic-cycle'), '800 ms');
  assert.equal(reading('ab'), '65 ms base · max extra 90 ms · τ 120 ms');
  assert.equal(reading('ba'), 'Disallowed');
  assert.equal(control('ring-protocol').hidden, true);
  assert.equal(control('conduction-protocol').hidden, false);
  assert.equal(control('stimulate').disabled, true);
  assert.equal(control('toggle-link').disabled, true);
  inspector.render({ runId: 'branch', snapshot: engine.readAt(50), presentedMs: 50 }, contextual);
  assert.equal(reading('automatic-cycle'), '900 ms');
  control('premature').onclick();
  assert.deepEqual(callbackCalls.at(-1), ['protocol', 'premature', 'A', 275]);
  assert.equal(log().length, 0);
});
