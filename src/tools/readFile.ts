import fs from "node:fs/promises";
import { resolveInWorkspace, truncate } from "../paths.js";
import type { Tool } from "../types.js";

export const readFile: Tool = {
  definition: {
    name: "read_file",
    description:
      "Read a UTF-8 text file from the workspace. Returns numbered lines. Use start_line/end_line (1-based, inclusive) for large files.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the workspace root." },
        start_line: { type: "integer" },
        end_line: { type: "integer" },
      },
      required: ["path"],
    },
  },
  async run(input, ctx) {
    const abs = resolveInWorkspace(ctx.workspace, String(input.path));
    const text = await fs.readFile(abs, "utf8");
    const lines = text.split("\n");
    const start = Math.max(1, Number(input.start_line ?? 1));
    const end = Math.min(lines.length, Number(input.end_line ?? lines.length));
    const out = lines
      .slice(start - 1, end)
      .map((l, i) => `${String(start + i).padStart(5)}  ${l}`)
      .join("\n");
    return { content: truncate(out) };
  },
};
