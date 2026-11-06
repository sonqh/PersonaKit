// Deterministic JSON: sorted keys, two-space indent, LF, final newline.
// REQ-PER-004
// The same value always gives the same bytes, so git diffs stay small.

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      out[key] = canonicalize(v);
    }
    return out;
  }
  return value;
}

export function stringifyCanonical(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2) + "\n";
}
