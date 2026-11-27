// I. Prelude oracle: the §C overdrive numbers and Breath RR (design/study-2-spec.md, "I. Prelude").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPreludeWorld, preludePresentation, preludeWorld } from '../src/worlds/prelude.js';
import { acts, assertLaws, diffs, play, tick, times } from './studies-common.js';

const hold = preludePresentation.protocols.find(p => p.id === 'hold-tempo');

test('Prelude: releasing a 30 × 500 ms held tempo gives the fermata 1250, then 1070, 962, 897.2 ms', () => {
  const events = play(createPreludeWorld(), hold.commands(1000, 500, 30), 21_000);
  // Hand recurrence of §C at S (T 800, g 0.06, Smax 450, w 0.6), in ticks, from the S capture times:
  // spontaneous firings at 0 and 800, then driven captures 25 ms after each pulse.
  const T = tick(800);
  let suppression = 0;
  let previous = tick(800);
  for (let k = 0; k < 30; k++) {
    const capture = tick(1000 + 500 * k + 25);
    const interval = capture - previous;
    if (interval < T) suppression = Math.min(tick(450), suppression + Math.round(0.06 * (T - interval)));
    previous = capture;
  }
  assert.equal(suppression, tick(450), 'saturated');
  const expected = [];
  let at = previous;
  for (let k = 0; k < 4; k++) {
    at += T + suppression;
    expected.push(at / 1000);
    suppression = Math.round(0.6 * suppression);
  }
  const returns = times(events, 'S').filter(t => t > previous / 1000).slice(0, 4);
  assert.deepEqual(returns, expected);
  assert.deepEqual(diffs([previous, ...returns.map(tick)]), [1250, 1070, 962, 897.2].map(tick));
  // Each return conducts through to both ventricles.
  for (const t of returns) assert.ok(acts(events, 'V1').some(v => v.tMs > t && v.tMs < t + 400));
  assertLaws(preludeWorld, events);
});

test('Prelude Breath: sinus RR follows T (1 + d sin 2πt/P) at each firing within one tick; ventricle follows through the decrement law', () => {
  const world = createPreludeWorld({ breath: true });
  const events = play(world, [], 30_000);
  const s = times(events, 'S');
  for (let i = 1; i < s.length; i++) {
    const t = tick(s[i - 1]);
    const expected = Math.round(tick(800) * (1 + 0.05 * Math.sin((2 * Math.PI * t) / tick(4000))));
    assert.ok(Math.abs(tick(s[i]) - t - expected) <= 1, `RR ${i}`);
  }
  const rr = diffs(s);
  assert.ok(Math.max(...rr) - Math.min(...rr) > 60, 'the breath is audible as phrasing');
  assert.equal(times(events, 'V1').length, s.length);
  assertLaws(world, events);
});
