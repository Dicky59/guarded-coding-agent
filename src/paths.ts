import path from "node:path";

/**
 * Resolve a user/model-supplied path inside the workspace.
 * Throws if it escapes. (Symlink escapes are an M2 guardrail concern.)
 */
export function resolveInWorkspace(workspace: string, p: string): string {
  const abs = path.resolve(workspace, p);
  const rel = path.relative(workspace, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes workspace: ${p}`);
  }
  return abs;
}

export function truncate(s: string, max = 20_000): string {
  if (s.length <= max) return s;
  const half = Math.floor(max / 2);
  return `${s.slice(0, half)}\n...[truncated ${s.length - max} chars]...\n${s.slice(-half)}`;
}
