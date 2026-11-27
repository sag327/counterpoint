// Contract 1.1.0 laws. Every argument and result that is a time is an integer
// microsecond tick. A law that produces a time rounds once with Math.round
// (half ticks toward +infinity), so fixtures can repeat the arithmetic exactly.

export const LESION_STEP = 250_000;
export const AGENT_STEP = 100_000;
export const STILLNESS_RISE = 1_500_000;
export const STILLNESS_HOLD = 2_000_000;
export const STILLNESS_DECAY = 6_000_000;
export const STILLNESS_END = STILLNESS_RISE + STILLNESS_HOLD + STILLNESS_DECAY;
export const SLOW_RAMP = 3_000_000;
export const STILLNESS_NODAL_ERP = 600_000;
export const STILLNESS_ATRIAL_ERP = 0.2;
export const STILLNESS_SINUS_CYCLE = 0.5;
export const SLOW_GAIN = 0.3;
export const SLOW_USE_CYCLE = 400_000;
export const TONE_CYCLE = 0.2;
export const TONE_DECREMENT = 0.5;

// §A. A site that has never been activated (di null) uses erpMax.
export function restitutionErp(restitution, di) {
  const { erpMax, amplitude, tau, erpMin } = restitution;
  if (di === null) return erpMax;
  return Math.min(erpMax, Math.max(erpMin, Math.round(erpMax - amplitude * Math.exp(-di / tau))));
}

// §B. slack is the nominal arrival minus the destination's refractoryUntil (>= 0).
export function entryExtra(entry, slack) {
  return Math.round(entry.maxExtra * Math.exp(-slack / entry.tau));
}

// v1.0 decrement with an optional multiplier for nodal tone and breath.
export function decrementExtra(decrement, recoveryInterval, factor = 1) {
  const maxExtra = factor === 1 ? decrement.maxExtra : decrement.maxExtra * factor;
  return Math.round(maxExtra * Math.exp(-recoveryInterval / decrement.tau));
}

// §F. Delay of a direction after lesion progress p.
export function lesionDelay(delay, progress) {
  return progress === 0 ? delay : Math.round(delay * (1 + 3 * progress * progress));
}

// §C. Respiratory factor at an instant.
export function breathFactor(autonomic, tick) {
  return 1 + autonomic.depth * Math.sin((2 * Math.PI * tick) / autonomic.period);
}

// §D. Sinusoidal phase-response curve.
export function phaseShift(cycle, amplitude, phase) {
  return Math.round(cycle * amplitude * Math.sin(2 * Math.PI * phase));
}

// Stillness envelope e(t) in [0, 1] for elapsed ticks since the command.
export function stillnessEnvelope(elapsed) {
  if (elapsed <= 0 || elapsed >= STILLNESS_END) return 0;
  if (elapsed <= STILLNESS_RISE) return elapsed / STILLNESS_RISE;
  if (elapsed <= STILLNESS_RISE + STILLNESS_HOLD) return 1;
  return 1 - (elapsed - STILLNESS_RISE - STILLNESS_HOLD) / STILLNESS_DECAY;
}

// Slow the current: extra ticks on a non-nodal link. cycle is the source's
// preceding cycle, null on its first activation (no use dependence).
export function slowExtra(linkDelay, level, cycle) {
  const use = cycle === null ? 0 : Math.max(0, (SLOW_USE_CYCLE - cycle) / SLOW_USE_CYCLE);
  return Math.round(linkDelay * SLOW_GAIN * level * (1 + use));
}

// Stillness modifies a site's ERP after its own law: nodal adds, atrial scales.
export function agentErp(node, erp) {
  if (node.agentErpAdd !== 0) return erp + node.agentErpAdd;
  if (node.agentErpScale !== 1) return Math.round(erp * node.agentErpScale);
  return erp;
}

// The ERP a capture would receive after a long rest, as reported by
// parameter_changed (erpMs) and readAt. node.erp tracks erpMax under restitution.
export function restedErp(node) {
  return agentErp(node, node.erp);
}

export function agentCycle(node, cycle) {
  return cycle === null || node.agentCycleScale === 1 ? cycle : Math.round(cycle * node.agentCycleScale);
}
