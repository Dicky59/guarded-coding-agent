import fs from "node:fs/promises";
import path from "node:path";
import { resolveInWorkspace, truncate } from "../paths.js";
import type { Tool } from "../types.js";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".agent", ".next", "build", "coverage"]);
const MAX_MATCHES = 200;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
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
      "Search workspace files for a regular expression (JS syntax). Returns file:line: text. Also use with an empty pattern and list_files=true to list files.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "JS regular expression." },
        path: { type: "string", description: "Subdirectory to search (default: workspace root)." },
        list_files: { type: "boolean", description: "If true, list file paths instead of matching content." },
      },
      required: ["pattern"],
    },
  },
  async run(input, ctx) {
    const root = resolveInWorkspace(ctx.workspace, String(input.path ?? "."));
    const results: string[] = [];

    if (input.list_files) {
      for await (const file of walk(root)) {
        results.push(path.relative(ctx.workspace, file));
        if (results.length >= MAX_MATCHES * 5) break;
      }
      return { content: results.join("\n") || "(no files)" };
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
