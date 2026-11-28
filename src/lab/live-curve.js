// Live S1–S2 curve: the AH jump curve built from the performance itself.
//
// A premature stimulus at the septal atrium or the upstream pacing site
// becomes one point: the septal coupling interval A1–A2 against A2–H2, the time to the
// first causally descended His activation. Points are kept across runs, so the
// curve grows as the player tries different premature beats. All values
// are intervals (EP-relative), never the run clock.
//
// The store is pure and DOM-free. Feed it events with ingest(); a point is final
// once the presentation has passed its stimulus by settleMs, so nothing is
// plotted before it is heard.
import { descendantsOf, detectJumps, firstDescendant, round3 } from './measure.js';

// Drive pulses come from a train (triggerId `<train>#<k>`) and are S1 by
// definition; an extrastimulus is a single stimulus.
const isExtrastimulus = event => event.type === 'stimulus_attempted' && event.source === 'stimulus'
  && !String(event.triggerId ?? '').includes('#') && !String(event.triggerId ?? '').startsWith('pace-');

// Pure: the extrastimulus points in one run's events, up to throughMs.
// A single (non-train) stimulus counts as premature when its coupling interval is at least
// prematureMs shorter than the cycle that preceded it at the pacing site.
export function extrastimulusPoints(events, { atrium = 'CSp', upstream = 'S', his = 'H', settleMs = 1200, prematureMs = 20, throughMs = Infinity } = {}) {
  const points = [];
  const activations = [];
  for (const event of events) {
    if (event.type === 'activation' && event.nodeId === atrium) {
      activations.push(event.tMs);
      continue;
    }
    if (!isExtrastimulus(event) || (event.nodeId !== atrium && event.nodeId !== upstream)) continue;
    if (event.tMs + settleMs > throughMs) continue;
    // Activations strictly before this stimulus define A1 and the preceding cycle.
    const before = activations.filter(tMs => tMs < event.tMs);
    if (before.length < 2) continue;
    const a1 = before.at(-1);
    const cycleMs = round3(a1 - before.at(-2));
    const set = descendantsOf(events, [event.eventId]);
    const a2 = firstDescendant(events, set, atrium, ['activation']);
    // An upstream stimulus blocked before the septal atrium has no local A2.
    if (!a2 && event.nodeId !== atrium) continue;
    const couplingMs = round3((a2?.tMs ?? event.tMs) - a1);
    if (couplingMs > cycleMs - prematureMs) continue;
    const h2 = a2 ? firstDescendant(events, set, his, ['activation']) : null;
    points.push({
      key: `${event.runId}:${event.eventId}`,
      runId: event.runId,
      triggerId: event.triggerId,
      couplingMs,
      driveCycleMs: cycleMs,
      captured: a2 !== null,
      ahMs: a2 && h2 ? round3(h2.tMs - a2.tMs) : null,
    });
  }
  return points;
}

export function createLiveCurve(options = {}) {
  const settings = { atrium: 'CSp', his: 'H', settleMs: 1200, prematureMs: 20, limit: 400, ...options };
  let points = [];
  const seen = new Set();
  let version = 0;
  return {
    get points() { return points; },
    get version() { return version; },
    // events: the retained events of the current run; throughMs: the presented time.
    ingest(events, throughMs) {
      let added = false;
      for (const point of extrastimulusPoints(events, { ...settings, throughMs })) {
        if (seen.has(point.key)) continue;
        seen.add(point.key);
        points.push(point);
        added = true;
      }
      if (points.length > settings.limit) points = points.slice(-settings.limit);
      if (added) version++;
      return added;
    },
    clear() {
      points = [];
      seen.clear();
      version++;
    },
  };
}

// A protocol-result-shaped object, so the Lab's S1–S2 plot renderer draws it.
// When the same coupling interval was delivered more than once, the latest wins.
export function liveCurveResult(points, { maxStepMs = 20, minJumpMs = 50 } = {}) {
  const byCoupling = new Map();
  for (const point of points) byCoupling.set(point.couplingMs, point);
  const rows = [...byCoupling.values()]
    .sort((a, b) => b.couplingMs - a.couplingMs)
    .map(point => ({ s2Ms: point.couplingMs, captured: point.captured, a2h2Ms: point.ahMs }));
  const jumps = detectJumps(rows.map(row => ({ couplingMs: row.s2Ms, valueMs: row.a2h2Ms })), { maxStepMs, minJumpMs });
  const cycles = points.map(point => point.driveCycleMs).sort((a, b) => a - b);
  const driveCycleMs = cycles.length ? Math.round(cycles[Math.floor(cycles.length / 2)]) : null;
  const blocked = rows.filter(row => row.captured && row.a2h2Ms === null).map(row => row.s2Ms);
  const refused = rows.filter(row => !row.captured).map(row => row.s2Ms);
  return {
    columns: ['s2Ms', 'captured', 'a2h2Ms'],
    protocol: { type: 'live', driveCycleMs },
    rows,
    summary: {
      jump: jumps.length ? jumps.reduce((a, b) => (b.jumpMs > a.jumpMs ? b : a)) : null,
      // Longest coupling that reached the atrium but not His, and longest refused at the atrium.
      conductionBlockMs: blocked.length ? Math.max(...blocked) : null,
      atrialRefusedMs: refused.length ? Math.max(...refused) : null,
    },
  };
}

export function liveCurveSummary(result) {
  const { rows, summary } = result;
  const conducted = rows.filter(row => row.a2h2Ms !== null).length;
  if (rows.length === 0) return 'No premature beats yet. Run Find the echo, or touch the septal atrium early.';
  const parts = [`${rows.length} premature ${rows.length === 1 ? 'beat' : 'beats'}, ${conducted} conducted to His`];
  if (summary.jump) parts.push(`jump of ${Math.round(summary.jump.jumpMs)} ms at ${summary.jump.couplingMs} ms`);
  if (summary.conductionBlockMs !== null) parts.push(`AV block at ${summary.conductionBlockMs} ms`);
  if (summary.atrialRefusedMs !== null) parts.push(`atrium refractory at ${summary.atrialRefusedMs} ms`);
  return `${parts.join('; ')}.`;
}

// Plot model for the Lab, drawn with the shared S1–S2 renderer. Premature beats
// that captured the atrium but never reached His sit on the floor as open marks.
export function liveCurveModel(points, { buildConduction, atriumLabel = 'septal atrium', outputLabel = 'His', frame = { couplingMs: [200, 420], ahMs: [60, 320] } } = {}) {
  const result = liveCurveResult(points);
  const model = buildConduction(result, { atriumLabel, outputLabel });
  // A fixed EP frame that the data can widen, so the first points read in context
  // and the axes do not jump as the curve grows.
  const xs = result.rows.map(row => row.s2Ms);
  const ys = result.rows.map(row => row.a2h2Ms).filter(Number.isFinite);
  model.xDomain = [Math.min(frame.couplingMs[0], ...xs) - 5, Math.max(frame.couplingMs[1], ...xs) + 5];
  model.yDomain = [Math.min(frame.ahMs[0], ...ys) - 10, Math.max(frame.ahMs[1], ...ys) + 10];
  const blocked = result.rows.filter(row => row.captured && row.a2h2Ms === null);
  if (blocked.length) {
    model.layers.push({ type: 'dots', points: blocked.map(row => [row.s2Ms, model.yDomain[0]]), color: '#8b93a1', radius: 2.4, hollow: true });
  }
  model.kind = 'liveS1S2';
  model.title = 'S1–S2 · as you pace';
  model.subtitle = `${atriumLabel} to ${outputLabel}${result.protocol.driveCycleMs ? ` · Drive ${result.protocol.driveCycleMs} ms` : ''} · from this session`;
  model.summary = liveCurveSummary(result);
  model.table = {
    caption: 'Premature beats delivered in this session',
    columns: ['A1–A2 (ms)', 'Atrium captured', 'A2–H2 (ms)'],
    rows: result.rows.map(row => [row.s2Ms, row.captured ? 'yes' : 'no', row.a2h2Ms ?? 'block']),
  };
  return model;
}
