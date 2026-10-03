import fs from "node:fs/promises";
import path from "node:path";
import { resolveInWorkspace } from "../paths.js";
import type { Tool } from "../types.js";

/** Write via temp file + rename so a crash never leaves a half-written file. */
async function atomicWrite(file: string, content: string): Promise<void> {
  const tmp = `${file}.agent-tmp-${process.pid}-${Date.now()}`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, file);
}

export const editFile: Tool = {
  definition: {
    name: "edit_file",
    description:
      "Edit a file by replacing an exact string. old_str must appear exactly once in the file; include enough surrounding context to make it unique. To create a new file, pass old_str as an empty string and the full contents as new_str (fails if the file exists).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to the workspace root." },
        old_str: { type: "string" },
        new_str: { type: "string" },
      },
      required: ["path", "old_str", "new_str"],
    },
  },
  async run(input, ctx) {
    const abs = resolveInWorkspace(ctx.workspace, String(input.path));
    const oldStr = String(input.old_str);
    const newStr = String(input.new_str);

    let existing: string | null = null;
    try {
      existing = await fs.readFile(abs, "utf8");
    } catch {
      existing = null;
    }

    if (oldStr === "") {
      if (existing !== null) {
        return { content: "File already exists; provide a non-empty old_str to edit it.", isError: true };
      }
      await atomicWrite(abs, newStr);
      return { content: `Created ${input.path}` };
    }

    if (existing === null) return { content: `File not found: ${input.path}`, isError: true };

    const count = existing.split(oldStr).length - 1;
    if (count === 0) return { content: "old_str not found in file. Re-read the file and try again.", isError: true };
    if (count > 1) return { content: `old_str matches ${count} places; add more context to make it unique.`, isError: true };

    await atomicWrite(abs, existing.replace(oldStr, () => newStr));
    return { content: `Edited ${input.path}` };
  },
};
