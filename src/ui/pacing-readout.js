import { conductionPattern, descendantsOf, firstDescendant } from '../lab/measure.js';

// Only presented, causally linked beats contribute. A failed stimulus is not an
// atrial activation, and the most recent unfinished traversal is not a block.
export function pacingReadout(events, { worldId, presentedMs, fromMs = 0, pacingNodeId = 'S' } = {}) {
  if (worldId !== 'conduction' || !['S', 'A'].includes(pacingNodeId)) return null;
  const inputId = 'A';
  const visible = events.filter(event => event.tMs <= presentedMs);
  const pulses = visible.filter(event => event.type === 'stimulus_attempted' && event.nodeId === pacingNodeId
    && event.tMs >= fromMs && event.triggerId?.startsWith('pace-'));
  const pacedEvents = descendantsOf(visible, pulses.map(event => event.eventId));
  const inputs = visible.filter(event => event.type === 'activation' && event.nodeId === inputId && pacedEvents.has(event.eventId)).slice(-32);
  const beats = [];
  for (const input of inputs) {
    const descendants = descendantsOf(visible, [input.eventId]);
    const output = firstDescendant(visible, descendants, 'H', ['activation']);
    const blocked = firstDescendant(visible, descendants, 'N', ['activation_blocked']);
    if (!output && !blocked && presentedMs - input.tMs < 1200) break;
    beats.push({ conducted: Boolean(output), intervalMs: output ? output.tMs - input.tMs : null });
  }
  const last = beats.at(-1);
  const pattern = beats.length >= 8 ? conductionPattern(beats) : null;
  return { ratio: pattern?.ratio ?? null, kind: pattern?.kind ?? null,
    lastAhMs: last?.intervalMs ?? null, lastBlocked: last ? !last.conducted : false, beats: beats.length };
}
