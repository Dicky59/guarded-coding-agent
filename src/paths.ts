import fs from "node:fs";
import path from "node:path";

function outside(rel: string): boolean {
  return rel.startsWith("..") || path.isAbsolute(rel);
}

/**
 * Resolve a user/model-supplied path inside the workspace.
 * Throws if it escapes lexically OR through a symlink/junction: the deepest
 * existing ancestor is resolved with realpath and must stay inside the real workspace.
 */
export function resolveInWorkspace(workspace: string, p: string): string {
  const abs = path.resolve(workspace, p);
  if (outside(path.relative(workspace, abs))) throw new Error(`Path escapes workspace: ${p}`);

  const realWs = fs.realpathSync(workspace);
  let probe = abs;
  for (;;) {
    try {
      const real = fs.realpathSync(probe);
      if (outside(path.relative(realWs, real))) throw new Error(`Path escapes workspace via symlink: ${p}`);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      // A dangling symlink exists on disk but cannot be resolved: refuse to write through it.
      if (fs.lstatSync(probe, { throwIfNoEntry: false })) throw new Error(`Refusing dangling symlink: ${p}`);
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return abs;
}

export function truncate(s: string, max = 20_000): string {
  if (s.length <= max) return s;
  const half = Math.floor(max / 2);
  return `${s.slice(0, half)}\n...[truncated ${s.length - max} chars]...\n${s.slice(-half)}`;
}
