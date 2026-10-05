const counters = new Map();

/** Deterministic, per-prefix ids: ord-1, ord-2, usr-1 ... */
export function newId(prefix) {
  const next = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, next);
  return `${prefix}-${next}`;
}
