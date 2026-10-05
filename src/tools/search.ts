import fs from "node:fs/promises";
import path from "node:path";
import { isSecretPath } from "../guardrails/secrets.js";
import { resolveInWorkspace, truncate } from "../paths.js";
import type { Tool } from "../types.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".agent", ".next", "build", "coverage"]);
const MAX_MATCHES = 200;
/** Up to this many files are listed one per line; above it the listing collapses into directories. */
const LIST_FLAT_LIMIT = 60;
const MAX_LISTED = 5000;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (isSecretPath(entry.name)) continue; // never surface .env / keys through search
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else if (entry.isFile()) {
      yield path.join(dir, entry.name);
    }
  }
}

export const search: Tool = {
  definition: {
    name: "search",
    description:
      "Search workspace files for a regular expression (JS syntax). Returns file:line: text. To list files use list_files=true (pattern may be empty): small trees are listed in full, big ones are collapsed into directories with file counts; pass path to list inside one directory, or depth for more levels. Prefer a targeted pattern over listing everything.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "JS regular expression." },
        path: { type: "string", description: "Subdirectory to search (default: workspace root)." },
        list_files: { type: "boolean", description: "If true, list file paths instead of matching content." },
        depth: { type: "integer", description: "With list_files on a big tree: how many directory levels to show before collapsing (default 2)." },
      },
      required: ["pattern"],
    },
  },
  async run(input, ctx) {
    const root = resolveInWorkspace(ctx.workspace, String(input.path ?? "."));
    const results: string[] = [];

    if (input.list_files) {
      const base = path.relative(ctx.workspace, root).split(path.sep).join("/"); // "" for the workspace root
      const all: string[] = [];
      for await (const file of walk(root)) {
        all.push(path.relative(ctx.workspace, file).split(path.sep).join("/"));
        if (all.length >= MAX_LISTED) break;
      }
      if (all.length === 0) return { content: "(no files)" };
      if (all.length <= LIST_FLAT_LIMIT) return { content: all.join("\n") };

      // Big tree: a flat list of every path is expensive and gets re-sent on every later step.
      // Group files by their directory, truncated to `depth` levels; small groups show their file names inline.
      const depth = Math.max(1, Math.min(6, Number(input.depth ?? 2) || 2));
      const rootFiles: string[] = [];
      const groups = new Map<string, string[]>();
      for (const rel of all) {
        const parts = (base ? rel.slice(base.length + 1) : rel).split("/");
        const dirParts = parts.slice(0, -1);
        if (dirParts.length === 0) {
          rootFiles.push(rel);
          continue;
        }
        const key = `${base ? base + "/" : ""}${dirParts.slice(0, depth).join("/")}/`;
        const list = groups.get(key) ?? [];
        list.push(rel.slice(key.length));
        groups.set(key, list);
      }
      const INLINE = 6;
      const plural = (n: number) => `${n} file${n === 1 ? "" : "s"}`;
      const lines = [
        ...rootFiles.sort(),
        ...[...groups.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([dir, names]) => (names.length <= INLINE ? `${dir} (${plural(names.length)}: ${names.sort().join(", ")})` : `${dir} (${plural(names.length)})`)),
        "",
        `(${all.length}${all.length >= MAX_LISTED ? "+" : ""} files total; grouped by directory, ${depth} level${depth === 1 ? "" : "s"} deep. ` +
          `Call search with list_files=true and path="<dir>" to list inside one, or depth=N for more levels.)`,
      ];
      return { content: lines.join("\n") };
    }

    let re: RegExp;
    try {
      re = new RegExp(String(input.pattern));
    } catch (e) {
      return { content: `Invalid regex: ${(e as Error).message}`, isError: true };
    }

    outer: for await (const file of walk(root)) {
      let text: string;
      try {
        text = await fs.readFile(file, "utf8");
      } catch {
        continue;
      }
      if (text.includes("\u0000")) continue; // binary
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i]!)) {
          results.push(`${path.relative(ctx.workspace, file)}:${i + 1}: ${lines[i]!.trim()}`);
          if (results.length >= MAX_MATCHES) break outer;
        }
      }
    }
    return { content: truncate(results.join("\n") || "(no matches)") };
  },
};
