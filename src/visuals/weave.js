import { clamp, memoByEvents } from './common.js';
import { indexEvents } from './trace.js';

const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };

// Terminal events can arrive in the committed lookahead. Apply their limits
// only once presented, so a wave never changes shape in anticipation of block.
export function createWeaveHistory() {
  return memoByEvents((events, runId) => {
    const trace = indexEvents(events.filter(event => event.runId === runId));
    const links = new Map();
    for (const launch of trace.launchList) {
      const arrival = trace.arrivals.get(launch.transitId);
      const terminal = trace.collisions.get(launch.transitId) ?? trace.cancels.get(launch.transitId)
        ?? (arrival && trace.outcomeByCause.get(arrival.eventId));
      let link = links.get(launch.linkId);
      if (!link) {
        link = { passages: [], longest: 0 };
        links.set(launch.linkId, link);
      }
      link.passages.push({ launch, terminal });
      link.longest = Math.max(link.longest, launch.arrivalMs - launch.departureMs);
    }
    return links;
  });
}

export function pathPassages(history, active, linkId, time, maxErp, generation) {
  const link = history.get(linkId);
  const passages = [];
  const retained = new Set();
  if (link) {
    for (let i = link.passages.length - 1; i >= 0; i--) {
      const passage = link.passages[i];
      const { launch } = passage;
      if (launch.departureMs < time - link.longest - maxErp) break;
      if (launch.departureMs > time || (generation !== undefined && launch.linkGeneration !== generation)) continue;
      passages.push(passage);
      retained.add(launch.transitId);
    }
  }
  for (const launch of active) {
    if (launch.linkId === linkId && !retained.has(launch.transitId)) passages.push({ launch });
  }
  return passages;
}

// Fractions measure arc length, using the same clock and curve as the wavehead.
export function sampleWeave(passages, sourceId, fraction, time, erp) {
  let opening = 0;
  let glow = 0;
  for (const { launch, terminal } of passages) {
    const forward = launch.fromNodeId === sourceId;
    const progress = forward ? fraction : 1 - fraction;
    const duration = launch.arrivalMs - launch.departureMs;
    const crossing = launch.departureMs + progress * duration;
    const age = time - crossing;
    if (age <= 0 || age >= erp) continue;
    let weight = 1;
    if (terminal && terminal.tMs <= time) {
      if (terminal.position !== undefined && (forward ? fraction > terminal.position : fraction < terminal.position)) continue;
      if (terminal.type === 'activation_blocked') weight = 1 - smooth((progress - .78) / .22);
    }
    const recovery = weight * (1 - age / erp) ** .55;
    opening = Math.max(opening, recovery * smooth(age / 11));
    // A point glows for 58% of the transit duration, about 2.5 times the
    // old centerline tail. The clock keeps running after arrival.
    const trailAge = age / (.58 * duration);
    glow = Math.max(glow, recovery * smooth(trailAge / .16) * (1 - clamp(trailAge)) ** 1.4);
  }
  return { opening, glow };
}

export function threadShape(phase, strand) {
  const swell = .76 + .22 * Math.sin(3 * phase + .7) + .13 * Math.sin(7 * phase - 1.1);
  const drift = 2.4 * Math.sin(5 * phase + .4) + 1.2 * Math.sin(9 * phase + 1.3);
  if (strand === 0) return drift - 9 * swell + 2.8 * Math.sin(4 * phase + .3);
  if (strand === 1) return drift + 3.8 * Math.sin(3 * phase + 1.8) + 1.5 * Math.sin(8 * phase);
  return drift + 8 * swell + 3.2 * Math.sin(6 * phase + 2.1);
}

export function junctionTaper(distance) {
  return smooth(distance / 15);
}

export function junctionOpening(state, time) {
  const start = state?.lastActivationMs;
  const end = state?.refractoryUntilMs;
  if (start == null || end == null || time <= start || time >= end) return 0;
  return ((end - time) / (end - start)) ** .55 * smooth((time - start) / 11);
}
