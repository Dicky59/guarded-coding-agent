import type { Tool } from "../types.js";
import { editFile } from "./editFile.js";
import { readFile } from "./readFile.js";
import { runCommand } from "./runCommand.js";
import { search } from "./search.js";

/** Largest command output that goes back into the conversation (every later step re-sends it). */
export const RUN_COMMAND_BUDGET = 6000;

/**
 * Keep the head and most of the tail (summaries and failures come last) of an over-long output,
 * and tell the model how to narrow it.
 */
export function budget(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  const head = Math.floor(maxChars * 0.25);
  const tail = maxChars - head;
  const omitted = content.length - head - tail;
  return (
    `${content.slice(0, head)}\n` +
    `...[${omitted} chars omitted to save context. Re-run with | tail, | head or | grep to see the part you need]...\n` +
    content.slice(-tail)
  );
}

/** Wrap a tool so its output is capped at `maxChars`, and say so in its description. */
export function withOutputBudget(tool: Tool, maxChars: number): Tool {
  return {
    definition: {
      ...tool.definition,
      description: `${tool.definition.description} Output longer than ${maxChars} characters is cut (head and tail kept), so filter big outputs, e.g. \`| tail -30\` or \`| grep -E "fail|error"\`.`,
    },
    async run(input, ctx) {
      const out = await tool.run(input, ctx);
      return { ...out, content: budget(out.content, maxChars) };
    },
  };
}

export const defaultTools: Tool[] = [readFile, search, editFile, withOutputBudget(runCommand, RUN_COMMAND_BUDGET)];
