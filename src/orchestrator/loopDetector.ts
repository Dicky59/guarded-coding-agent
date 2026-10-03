function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/**
 * Detects the agent repeating the exact same tool call back-to-back
 * (edit -> test fails -> same edit -> test fails ...).
 */
export class LoopDetector {
  private last: string | null = null;
  private streak = 0;

  constructor(private readonly threshold = 3) {}

  /** Returns true when the same call has now been made `threshold` times in a row. */
  record(name: string, input: Record<string, unknown>): boolean {
    const sig = `${name}:${stableStringify(input)}`;
    if (sig === this.last) {
      this.streak++;
    } else {
      this.last = sig;
      this.streak = 1;
    }
    return this.streak >= this.threshold;
  }
}
