import { runWorldCase, worldCases } from './worlds-scenes.js';

const traces = Object.fromEntries(Object.keys(worldCases).map(runId => {
  const { world, commands, throughMs, engine, events } = runWorldCase(runId);
  return [runId, { world, runId, commands, throughMs, diagnostics: engine.diagnostics(), events }];
}));

console.log(JSON.stringify({ contract: '1.0.0', origin: 'actual-headless-engine', traces }, null, 2));
