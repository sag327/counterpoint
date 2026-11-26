export function directedLink(id, a, b, delayMs, decrement = null) {
  return {
    id,
    a,
    b,
    enabled: true,
    ab: { enabled: true, delayMs, decrement },
    ba: { enabled: false, delayMs, decrement: null },
  };
}

export function freezePreset(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezePreset(child);
    Object.freeze(value);
  }
  return value;
}
