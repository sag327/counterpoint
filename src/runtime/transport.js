export const DEFAULT_DILATION = 4;
export const WAKE_WALL_MS = 25;
export const LOOKAHEAD_WALL_MS = 60;
export const INPUT_MARGIN_WALL_MS = 5;
export const COMMAND_LOG_LIMIT = 4096;

const TICKS_PER_MS = 1_000;
const clockTolerance = (sec) => 8 * Number.EPSILON * Math.max(1, Math.abs(sec));
// Comparisons at a microsecond boundary allow for subtraction of large clock anchors.
const tickTolerance = (sec) => 1e-7 + clockTolerance(sec) * 1_000 * TICKS_PER_MS;
const floorTick = (ms, audioSec = 0) => Math.floor(ms * TICKS_PER_MS + tickTolerance(audioSec));
const ceilTick = (ms, audioSec = 0) => Math.ceil(ms * TICKS_PER_MS - tickTolerance(audioSec));

export function createTransport({
  engine,
  dilation = DEFAULT_DILATION,
  nowSec = () => performance.now() / 1_000,
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (handle) => clearTimeout(handle),
  onCommit = () => {},
  onReset = () => {},
  onSilence = () => {},
  onFault = () => {},
  onStateChange = () => {},
}) {
  if (!Number.isFinite(dilation) || dilation < 1 || dilation > 8) {
    throw new RangeError('Dilation must be between 1 and 8');
  }

  const usedRunIds = new Set();
  let status = 'idle';
  let runId = null;
  let restedSnapshot = null;
  let timer = null;
  let segments = [];
  let committedTick = null;
  let lastFrameMs = 0;
  let pendingEvents = [];
  let acceptedCommands = [];
  let discardedCommandCount = 0;
  let commandIds = new Set();
  let nextCommandOrdinal = 1;
  let reason = null;
  let error = null;
  let lastInterruption = null;

  function committedThroughMs() {
    return committedTick === null ? null : committedTick / TICKS_PER_MS;
  }

  function pendingDilation() {
    const selected = segments.at(-1)?.dilation ?? dilation;
    return selected === dilation ? null : selected;
  }

  function state() {
    return { status, runId, dilation, pendingDilation: pendingDilation(), reason, error };
  }

  function emitState() {
    onStateChange(state());
  }

  function audioSecAt(tMs) {
    if (segments.length === 0) throw new Error('Transport has no time anchor');
    let index = segments.length - 1;
    while (index > 0 && tMs < segments[index].simMs) index--;
    const segment = segments[index];
    return segment.audioSec + (tMs - segment.simMs) * segment.dilation / 1_000;
  }

  function projectMs(audioSec) {
    let index = segments.length - 1;
    while (index > 0 && audioSec < segments[index].audioSec) index--;
    const segment = segments[index];
    return segment.simMs + (audioSec - segment.audioSec) * 1_000 / segment.dilation;
  }

  function isPlaying() {
    return status === 'running' || status === 'pausing';
  }

  function presentedAt(audioSec) {
    const boundary = committedThroughMs() ?? 0;
    if (!isPlaying()) return boundary;
    if (audioSec + clockTolerance(audioSec) >= audioSecAt(boundary)) return boundary;
    return Math.max(segments[0].simMs, projectMs(audioSec));
  }

  function presentedMs() {
    return presentedAt(isPlaying() ? nowSec() : 0);
  }

  function earliestAt(presented) {
    const playing = isPlaying();
    const marginSec = playing ? audioSecAt(presented) + INPUT_MARGIN_WALL_MS / 1_000 : 0;
    const marginMs = playing ? projectMs(marginSec) : presented + INPUT_MARGIN_WALL_MS / dilation;
    return Math.max((committedTick ?? -1) + 1, ceilTick(marginMs, marginSec)) / TICKS_PER_MS;
  }

  function earliestInputMs() {
    return runId === null ? null : earliestAt(presentedMs());
  }

  function cancelWake() {
    if (timer === null) return;
    const { handle } = timer;
    timer = null;
    clearTimer(handle);
  }

  function armWake() {
    if (timer !== null || !isPlaying()) return;
    const token = {};
    timer = token;
    token.handle = setTimer(() => {
      if (timer !== token) return;
      timer = null;
      wake();
    }, WAKE_WALL_MS);
  }

  function silence(stopReason) {
    onSilence({ runId, reason: stopReason });
  }

  function finishPause(pauseReason) {
    dilation = segments.at(-1).dilation;
    status = 'paused';
    reason = pauseReason;
    cancelWake();
    silence(pauseReason);
    emitState();
  }

  function interruptAt(interruptionReason, audioSec) {
    const throughMs = committedThroughMs() ?? 0;
    lastInterruption = Object.freeze({
      runId,
      reason: interruptionReason,
      fromMs: lastFrameMs,
      throughMs,
      discardedEvents: pendingEvents.length,
      overdueWallMs: Math.max(0, (audioSec - audioSecAt(throughMs)) * 1_000),
    });
    pendingEvents = [];
    finishPause(interruptionReason);
  }

  function refresh(audioSec) {
    if (!isPlaying()) return;
    const boundary = committedThroughMs() ?? 0;
    const boundarySec = audioSecAt(boundary);
    const tolerance = clockTolerance(audioSec);
    if (status === 'running' && committedTick !== null && audioSec > boundarySec + tolerance) {
      interruptAt('late-wake', audioSec);
      return;
    }
    if (status === 'pausing' && audioSec + tolerance >= boundarySec) {
      finishPause('pause');
      return;
    }
    while (segments.length > 1 && audioSec + tolerance >= segments[1].audioSec) {
      segments.shift();
    }
    if (dilation !== segments[0].dilation) {
      dilation = segments[0].dilation;
      emitState();
    }
  }

  function fault(failure) {
    if (failure && Object.hasOwn(failure, 'committedThroughMs')) {
      committedTick = failure.committedThroughMs === null ? null : floorTick(failure.committedThroughMs);
    }
    status = 'faulted';
    reason = 'fault';
    error = failure;
    pendingEvents = [];
    cancelWake();
    silence(reason);
    onFault(failure);
    emitState();
  }

  function commit(audioSec) {
    const horizonSec = audioSec + LOOKAHEAD_WALL_MS / 1_000;
    const horizonTick = floorTick(projectMs(horizonSec), horizonSec);
    if (committedTick !== null && horizonTick <= committedTick) return;
    try {
      const events = engine.advanceTo(horizonTick / TICKS_PER_MS);
      committedTick = horizonTick;
      if (events.length > 0) {
        pendingEvents = pendingEvents.concat(events);
        onCommit(events);
      }
    } catch (failure) {
      fault(failure);
    }
  }

  function wake() {
    if (!isPlaying()) return;
    const audioSec = nowSec();
    refresh(audioSec);
    if (status === 'running') commit(audioSec);
    armWake();
  }

  function resume() {
    if (runId === null || (status !== 'idle' && status !== 'paused')) return false;
    const audioSec = nowSec();
    segments = [{ simMs: committedThroughMs() ?? 0, audioSec, dilation }];
    status = 'running';
    reason = null;
    commit(audioSec);
    if (status === 'running') emitState();
    armWake();
    return status === 'running';
  }

  function pause() {
    if (status !== 'running') return false;
    const audioSec = nowSec();
    refresh(audioSec);
    if (status !== 'running') return false;
    status = 'pausing';
    reason = 'pause';
    emitState();
    refresh(audioSec);
    armWake();
    return true;
  }

  function interrupt(interruptionReason = 'interrupted') {
    if (!isPlaying()) return false;
    interruptAt(interruptionReason, nowSec());
    return true;
  }

  function setDilation(value) {
    if (!Number.isFinite(value) || value < 1 || value > 8) {
      throw new RangeError('Dilation must be between 1 and 8');
    }
    if (isPlaying()) refresh(nowSec());
    if (value === (pendingDilation() ?? dilation)) return false;
    if (isPlaying()) {
      const simMs = committedThroughMs() ?? 0;
      const audioSec = audioSecAt(simMs);
      if (segments.at(-1).simMs === simMs) segments.pop();
      if (segments.at(-1)?.dilation !== value) segments.push({ simMs, audioSec, dilation: value });
    } else {
      dilation = value;
      if (segments.length > 0) {
        const simMs = committedThroughMs() ?? 0;
        segments = [{ simMs, audioSec: audioSecAt(simMs), dilation }];
      }
    }
    emitState();
    return true;
  }

  function rememberCommand(command) {
    const accepted = Object.freeze(command);
    engine.enqueue(accepted);
    commandIds.add(accepted.commandId);
    acceptedCommands.push(accepted);
    if (acceptedCommands.length > COMMAND_LOG_LIMIT) {
      acceptedCommands.shift();
      discardedCommandCount++;
    }
    return accepted;
  }

  function reset(world, freshRunId, { commands = [], start = false } = {}) {
    if (usedRunIds.has(freshRunId)) throw new Error('Reset requires a fresh run ID');
    const nextSnapshot = engine.reset(world, freshRunId);
    const selected = pendingDilation() ?? dilation;
    cancelWake();
    if (runId !== null) silence('reset');
    usedRunIds.add(freshRunId);
    runId = freshRunId;
    restedSnapshot = nextSnapshot;
    status = 'idle';
    dilation = selected;
    reason = null;
    error = null;
    segments = [];
    committedTick = null;
    lastFrameMs = 0;
    pendingEvents = [];
    acceptedCommands = [];
    discardedCommandCount = 0;
    commandIds = new Set();
    nextCommandOrdinal = 1;
    lastInterruption = null;
    onReset(restedSnapshot);
    try {
      for (const command of commands) rememberCommand({ ...command, runId });
    } catch (failure) {
      fault(failure);
      throw failure;
    }
    if (start) resume();
    else emitState();
    return restedSnapshot;
  }

  function submit(fields) {
    if (status !== 'running') return null;
    const audioSec = nowSec();
    refresh(audioSec);
    if (status !== 'running') return null;
    let { commandId } = fields;
    if (commandId === undefined) {
      do commandId = `live-${nextCommandOrdinal++}`;
      while (commandIds.has(commandId));
    }
    return rememberCommand({ ...fields, commandId, runId, tMs: earliestAt(presentedAt(audioSec)) });
  }

  function frame() {
    const audioSec = isPlaying() ? nowSec() : 0;
    refresh(audioSec);
    const tMs = presentedAt(audioSec);
    const tick = floorTick(tMs, audioSec);
    let due = 0;
    while (due < pendingEvents.length && floorTick(pendingEvents[due].tMs) <= tick) due++;
    const snapshot = committedTick === null ? restedSnapshot : engine.readAt(tick / TICKS_PER_MS);
    lastFrameMs = tMs;
    return { runId, presentedMs: tMs, snapshot, events: pendingEvents.splice(0, due) };
  }

  return {
    get status() { return status; },
    get runId() { return runId; },
    get dilation() { return dilation; },
    get pendingDilation() { return pendingDilation(); },
    get lastInterruption() { return lastInterruption; },
    get discardedCommandCount() { return discardedCommandCount; },
    state,
    reset,
    resume,
    pause,
    interrupt,
    setDilation,
    submit,
    wake,
    frame,
    presentedMs,
    committedThroughMs,
    earliestInputMs,
    audioSecAt,
    commandLog: () => acceptedCommands.slice(),
  };
}
