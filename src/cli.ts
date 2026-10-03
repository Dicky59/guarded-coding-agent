#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { AnthropicModel } from "./gateway/anthropic.js";
import { runAgent } from "./orchestrator/loop.js";
import type { AgentEvent } from "./types.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    workspace: { type: "string", short: "w", default: "." },
    "max-iterations": { type: "string", default: "30" },
    "command-timeout": { type: "string", default: "60" },
    model: { type: "string" },
  },
});

const task = positionals.join(" ").trim();
if (!task) {
  console.error('Usage: agent [-w <dir>] [--model <id>] [--max-iterations N] "<task>"');
  process.exit(2);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY first.");
  process.exit(2);
}

const workspace = path.resolve(values.workspace!);

function render(e: AgentEvent): void {
  switch (e.type) {
    case "iteration":
      console.log(`\n── step ${e.n} ──`);
      break;
    case "assistant_text":
      console.log(e.text);
      break;
    case "tool_call":
      console.log(`→ ${e.name} ${JSON.stringify(e.input)}`);
      break;
    case "tool_result": {
      const preview = e.content.split("\n").slice(0, 6).join("\n");
      console.log(`${e.isError ? "✗" : "✓"} ${preview}${e.content.split("\n").length > 6 ? "\n  …" : ""}`);
      break;
    }
    case "stopped":
      console.log(`\n■ ${e.status}: ${e.reason}`);
      break;
  }
}

const result = await runAgent({
  task,
  workspace,
  model: new AnthropicModel(values.model),
  maxIterations: Number(values["max-iterations"]),
  commandTimeoutMs: Number(values["command-timeout"]) * 1000,
  onEvent: render,
});

console.log(`\ntokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out, ${result.iterations} steps`);
process.exit(result.status === "completed" ? 0 : 1);
