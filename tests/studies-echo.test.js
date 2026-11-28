// II. Echo oracle (design/study-2-spec.md, "II. Echo", with G1 correction 4:
// the AH jump falls at the first S2 below the fast-pathway ERP, below 300 ms).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEchoWorld, echoPresentation, echoWorld } from '../src/worlds/echo.js';
import { acts, after, assertLaws, blocked, diffs, play, times } from './studies-common.js';

const findEcho = echoPresentation.protocols.find(p => p.id === 'find-echo');
const s2Time = commands => commands.find(c => c.commandId === 'S2').tMs;

function s2Run(s2, horizon = 4000, extra = []) {
  const commands = findEcho.commands(s2);
  const t2 = s2Time(commands);
  const events = play(createEchoWorld(), [...commands, ...extra.map(c => ({ ...c, tMs: t2 + c.tMs }))], t2 + horizon);
  return { events, t2, late: after(events, t2) };
}
const ah = ({ late }) => acts(late, 'H')[0].tMs - acts(late, 'CSp')[0].tMs;
const echoes = late => acts(late, 'CSp').filter(a => a.incomingLinkIds.includes('CF'));

test('Echo AH curve rises smoothly on the fast pathway, then jumps at least 50 ms below 300 ms', () => {
  const curve = [];
  for (let s2 = 400; s2 >= 240; s2 -= 10) curve.push([s2, ah(s2Run(s2))]);
  const steps = diffs(curve.map(([, value]) => value));
  const jump = steps.findIndex(step => step >= 50);
  assert.ok(jump >= 0, 'a jump exists');
  assert.ok(steps.every((step, i) => i === jump || (step >= 0 && step < 40)), `smooth elsewhere: ${steps}`);
  // At 1 ms resolution the jump is at the first S2 below the fast-pathway ERP: 297 conducts fast, 296 jumps.
  const fine = [297, 296].map(s2 => ah(s2Run(s2)));
  assert.ok(fine[1] - fine[0] >= 50, `jump 297 -> 296: ${fine}`);
  // Fast-pathway conduction at 297 (FP captured from CF), slow-pathway at 296 (FP blocked).
  assert.equal(blocked(s2Run(297).late, 'FP').length, 0);
  assert.ok(blocked(s2Run(296).late, 'FP').length >= 1);
});

test('Echo laws: every ERP and every launch in an S1–S2 run follows §A, decrement and §B from event fields', () => {
  const { events } = s2Run(280, 3000);
  assert.ok(assertLaws(echoWorld, events) > 100);
});

test('Echo single-echo window: S2 from 256 to 230 ms gives exactly one echo (CSp captured from FP), then FP blocks', () => {
  for (let s2 = 256; s2 >= 230; s2 -= 2) {
    const run = s2Run(s2);
    assert.equal(echoes(run.late).length, 1, `S2 ${s2}`);
    const echo = echoes(run.late)[0];
    assert.ok(blocked(run.late, 'FP').some(b => b.tMs > echo.tMs), `second lap blocks retrogradely in FP at S2 ${s2}`);
  }
});

test('Echo sustained circulation for 60 s with CSp-to-V between 10 and 60 ms, and Stillness ends it by nodal block within 3 laps', () => {
  const run = s2Run(280, 62_000);
  const csp = acts(run.late, 'CSp');
  const v = acts(run.late, 'V');
  assert.ok(csp.at(-1).tMs - run.t2 >= 60_000, 'circulates past 60 s');
  const cycles = diffs(csp.map(a => a.tMs));
  assert.ok(cycles.every(c => c > 250 && c < 330), 'every lap is a reentrant lap');
  for (const atrial of csp.slice(3, -2)) {
    const ventricle = v.find(a => a.tMs >= atrial.tMs);
    const gap = ventricle.tMs - atrial.tMs;
    assert.ok(gap >= 10 && gap <= 60, `CSp→V ${gap}`);
  }
  assert.ok(csp.length - acts(run.late, 'H').length <= 1, 'His follows 1:1 (the last lap may be cut by the horizon)');

  const stillAt = 3000;
  const still = s2Run(280, 15_000, [{ commandId: 'still', tMs: stillAt, type: 'applyAgent', agent: 'stillness', doseScale: 1 }]);
  const lap = diffs(times(still.late, 'CSp')).slice(3, 6).reduce((a, b) => a + b) / 3;
  const ending = blocked(still.late).find(b => b.tMs >= still.t2 + stillAt);
  assert.equal(createEchoWorld().nodes.find(n => n.id === ending.nodeId).tissue, 'nodal');
  assert.ok(ending.tMs - (still.t2 + stillAt) <= 3 * lap, 'within 3 laps');
  const reentrant = echoes(still.late).filter(a => a.tMs > ending.tMs);
  assert.equal(reentrant.length, 0, 'no further echo after the nodal block');
  assert.ok(still.events.every(e => e.type !== 'link_changed'), 'never by a cut');
});

test('Guided windows from S: 230–256 ms gives one echo, 257–296 ms sustained reentry', () => {
  for (const s2 of [230, 243, 256]) assert.equal(echoes(s2Run(s2, 5000).late).length, 1, `S2 ${s2}`);
  for (const s2 of [257, 277, 296]) assert.ok(echoes(s2Run(s2, 5000).late).length >= 10, `S2 ${s2}`);
  assert.equal(echoes(s2Run(229, 5000).late).length, 0);
  assert.equal(echoes(s2Run(297, 5000).late).length, 0);
  const s2Of = id => echoPresentation.protocols.find(p => p.id === id).s2;
  assert.deepEqual([s2Of('find-echo'), s2Of('find-arrhythmia')], [243, 277]);
});
