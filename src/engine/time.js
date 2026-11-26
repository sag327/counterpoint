export const TICKS_PER_MS = 1000;

export function toTick(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite nonnegative number`);
  }
  // Shift the decimal wire value before rounding. Binary multiplication can put
  // a decimal half-tick such as 0.5005 ms just below its intended tie.
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const digits = BigInt(whole + fraction);
  const shift = Number(exponent) + 3 - fraction.length;
  let tick;
  if (shift >= 0) {
    tick = digits * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    tick = (2n * digits + divisor) / (2n * divisor);
  }
  if (tick > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds the safe simulation timeline`);
  }
  return Number(tick);
}

export function toMs(tick) {
  return tick === null ? null : tick / TICKS_PER_MS;
}

export function addTicks(tick, duration) {
  const result = tick + duration;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('Scheduled instant exceeds the safe simulation timeline');
  }
  return result;
}

export function clampUnit(value) {
  return Math.max(0, Math.min(1, value));
}
