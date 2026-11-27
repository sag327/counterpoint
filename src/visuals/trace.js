// Causal trace shared by Ladder and Network marks. Pure functions of the event list.
// A launch is a "transit". It ends in exactly one of: captured, blocked, collision, canceled, pending.
// Concealed (spec §E): a launch tree that ends in activation_blocked or conduction_collision
// (or a lesion/cut cancel) without ever reaching an audible site. A bare block at the first silent site
// (the source is audible and nothing penetrated) is an ordinary block and keeps its bar: `concealed` is
// true only when the wave penetrated a silent site or started from one.

export function indexEvents(events) {
  const index = {
    byId: new Map(),
    launches: new Map(),
    launchList: [],
    arrivals: new Map(),
    collisions: new Map(),
    cancels: new Map(),
    outcomeByCause: new Map(),
    launchesByActivation: new Map(),
  };
  for (const event of events) {
    index.byId.set(event.eventId, event);
    switch (event.type) {
      case 'conduction_launched': {
        index.launches.set(event.transitId, event);
        index.launchList.push(event);
        const siblings = index.launchesByActivation.get(event.activationId);
        if (siblings) siblings.push(event);
        else index.launchesByActivation.set(event.activationId, [event]);
        break;
      }
      case 'conduction_arrived': index.arrivals.set(event.transitId, event); break;
      case 'conduction_collision':
        for (const transitId of event.transitIds) index.collisions.set(transitId, event);
        break;
      case 'conduction_canceled': index.cancels.set(event.transitId, event); break;
      case 'activation':
      case 'activation_blocked':
        for (const causeId of event.causeIds) index.outcomeByCause.set(causeId, event);
        break;
      default:
    }
  }
  return index;
}

// isAudible(nodeId) -> boolean. Returns Map transitId -> { end, state, launch, arrival, outcome, terminal, concealed }.
export function classifyTransits(index, isAudible = () => true) {
  const result = new Map();
  // Children are launched after their parent, so a reverse sweep resolves every tree without recursion.
  for (let i = index.launchList.length - 1; i >= 0; i -= 1) {
    const launch = index.launchList[i];
    const id = launch.transitId;
    const collision = index.collisions.get(id);
    const cancel = index.cancels.get(id);
    const arrival = index.arrivals.get(id) ?? null;
    const outcome = arrival ? index.outcomeByCause.get(arrival.eventId) ?? null : null;
    let end;
    let terminal = null;
    if (collision) { end = 'collision'; terminal = collision; }
    else if (cancel) { end = 'canceled'; terminal = cancel; }
    else if (arrival && outcome) { end = outcome.type === 'activation' ? 'captured' : 'blocked'; terminal = outcome; }
    else end = 'pending';

    let state;
    if (isAudible(launch.toNodeId)) state = 'audible';
    else if (end === 'pending') state = 'open';
    else if (end !== 'captured') state = 'concealed';
    else {
      state = 'concealed';
      for (const child of index.launchesByActivation.get(outcome.eventId) ?? []) {
        const childState = result.get(child.transitId)?.state;
        if (childState === 'audible') { state = 'audible'; break; }
        if (childState === 'open') state = 'open';
      }
    }
    result.set(id, { end, state, launch, arrival, outcome, terminal, concealed: state === 'concealed' && (end === 'captured' || !isAudible(launch.fromNodeId)) });
  }
  return result;
}
