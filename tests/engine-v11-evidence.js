// Actual headless contract 1.1.0 traces for the oracle scenes, written to
// evidence/engine-v11-01.json and validated by tests/engine-contract-v11.py.
import {
  ablate, chainWorld, entryRingWorld, focusWorld, hemiolaWorld, induction, join, lesionRingWorld, play, pulseAt,
  restitutionWorld, site, train, v11World, way,
} from './engine-v11-scenes.js';

function trace(world, runId, commands, throughMs) {
  const full = commands.map(command => ({ runId, ...command }));
  const { engine, events } = play(world, runId, full, [throughMs]);
  return { world, runId, commands: full, throughMs, diagnostics: engine.diagnostics(), events };
}

const stillWorld = v11World('stillness', [
  site('At', 200, { tissue: 'atrial' }),
  site('No', 300, { tissue: 'nodal' }),
  site('Sx', 150, { tissue: 'sinus', automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } }),
  site('Ve', 250, { tissue: 'ventricular' }),
]);
const slowWorld = v11World('slow', [site('P', 200), site('Q', 100), site('Nd', 100, { tissue: 'nodal' })],
  [join('PQ', 'P', 'Q', way(60)), join('PN', 'P', 'Nd', way(60))]);
const protectedWorld = v11World('protected', [site('P', 200, { automaticity: { cycleMs: 1000, firstAttemptMs: 100, resetOnCapture: true, protected: true } }),
  site('Q', 50)], [join('PQ', 'P', 'Q', way(50), way(50))]);
const toneWorld = v11World('tone', [
  site('S', 200, { tissue: 'sinus', automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } }),
  site('N', 300, { tissue: 'nodal' }),
  site('H', 200, { tissue: 'hisPurkinje' }),
], [join('SN', 'S', 'N', way(20)), join('NH', 'N', 'H', way(60, { decrement: { maxExtraMs: 90, tauMs: 120 } }))]);
const trainsWorld = v11World('trains', [site('A', 100), site('B', 100), site('C', 100)]);
const orderWorld = v11World('order', [site('A', 100), site('B', 100)], [join('L', 'A', 'B', way(100), way(100))]);

const traces = {
  restitution340: trace(restitutionWorld(), 'rest340', [train('S1', 0, 'A', 0, 340, 64)], 64 * 340),
  restitution300: trace(restitutionWorld(), 'rest300', [train('S1', 0, 'A', 0, 300, 64)], 64 * 300),
  restitutionEdits: trace(restitutionWorld(), 'rest-edit', [pulseAt('p1', 0, 'A'), { commandId: 'erp', tMs: 10, type: 'setNodeERP', nodeId: 'A', erpMs: 320 },
    pulseAt('p2', 330, 'A'), { commandId: 'law', tMs: 400, type: 'setRestitution', nodeId: 'A', erpMaxMs: 260, amplitudeMs: 100, tauMs: 50, erpMinMs: 120 },
    pulseAt('p3', 900, 'A')], 1500),
  entryRing: trace(entryRingWorld(), 'entry-ring', [pulseAt('S', 0, 'R4')], 4000),
  overdrive: trace(focusWorld(), 'overdrive', [train('drive', 0, 'S', 500, 500, 30)], 21000),
  pauseCompensatory: trace(focusWorld({ erpMs: 350, overdrive: null, resetOnCapture: false }), 'pvc', [pulseAt('pvc', 0, 'S'), pulseAt('pvc2', 500, 'S')], 2500),
  pauseReset: trace(focusWorld({ erpMs: 350, overdrive: null, resetOnCapture: true }), 'pvc', [pulseAt('pvc', 0, 'S'), pulseAt('pvc2', 500, 'S')], 2500),
  breath: trace(focusWorld({ overdrive: null, autonomic: { breathPeriodMs: 4000, depth: 0.05, targets: ['sinus', 'nodal'] } }), 'breath', [], 12000),
  tone: trace(toneWorld, 'tone', [{ commandId: 'tone', tMs: 100, type: 'setTone', value: 1 }], 5000),
  hemiola: trace(hemiolaWorld(0.17), 'hemiola', [{ commandId: 'k', tMs: 15000, type: 'setCoupling', couplingId: 'AB', value: 0.215 }], 30000),
  protectedFocus: trace(protectedWorld, 'protected', [pulseAt('q', 0, 'Q'), pulseAt('p', 400, 'P')], 1500),
  nodalChain: trace(chainWorld(), 'chain', [train('drive', 0, 'A', 0, 300, 24)], 24 * 300 + 600),
  lesionComplete: trace(lesionRingWorld(), 'lesion', [...induction, ablate('burn', 2000, 'L5', 2000, 1)], 5000),
  lesionIncomplete: trace(lesionRingWorld(), 'gap', [...induction, ablate('pass1', 2000, 'L5', 2000, 0.5)], 6000),
  trains: trace(trainsWorld, 'trains', [train('X', 0, 'A', 300, 200, 3), pulseAt('Y', 300, 'B'), train('Z', 0, 'C', 300, 400, 2),
    train('W', 0, 'B', 1000, 200, 10), { commandId: 'stop', tMs: 1500, type: 'cancelTrain', trainId: 'W' }], 3000),
  stillness: trace(stillWorld, 'still', [{ commandId: 'adeno', tMs: 1000, type: 'applyAgent', agent: 'stillness', doseScale: 1 },
    pulseAt('peakA', 3000, 'At'), pulseAt('peakN', 3000, 'No')], 11000),
  slow: trace(slowWorld, 'slow', [{ commandId: 'ic', tMs: 0, type: 'applyAgent', agent: 'slow', doseScale: 1 },
    pulseAt('a', 4000, 'P'), pulseAt('b', 4500, 'P'), pulseAt('c', 4800, 'P')], 6000),
  ordering: trace(orderWorld, 'order', [ablate('burn', 0, 'L', 500, 0.5), pulseAt('a', 200, 'A'), pulseAt('b', 200, 'B'),
    { commandId: 'tone', tMs: 250, type: 'setTone', value: -0.5 },
    { commandId: 'delay', tMs: 250, type: 'setDirectionDelay', linkId: 'L', direction: 'ab', delayMs: 80 },
    { commandId: 'ic', tMs: 150, type: 'applyAgent', agent: 'slow', doseScale: 1 }], 1000),
};

// Coupling staircase on Duality cycles: B beats during A beats 100..520 (420 A cycles).
const couplingSweep = Array.from({ length: 51 }, (_, k) => k / 200).concat([0.1825, 0.184]).map(amplitude => {
  const { events } = play(hemiolaWorld(amplitude), 'sweep', [], [520 * 720]);
  const beats = events.filter(event => event.type === 'activation' && event.nodeId === 'B' && event.tMs >= 100 * 720 && event.tMs < 520 * 720).length;
  return { amplitude, aCycles: 420, bBeats: beats, ratio: beats / 420 };
});

console.log(JSON.stringify({ contract: '1.1.0', origin: 'actual-headless-engine', traces, couplingSweep }, null, 2));
