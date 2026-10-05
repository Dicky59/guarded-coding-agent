#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { ShadowGit } from "./checkpoints/shadowGit.js";
import { AnthropicModel } from "./gateway/anthropic.js";
import { defaultGuardrails } from "./guardrails/index.js";
import { cliApprover } from "./guardrails/cliApprover.js";
import { runAgent } from "./orchestrator/loop.js";
import type { AgentEvent } from "./types.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    workspace: { type: "string", short: "w", default: "." },
    "max-iterations": { type: "string", default: "30" },
    "command-timeout": { type: "string", default: "60" },
    model: { type: "string" },
    "no-guardrails": { type: "boolean", default: false },
    "no-checkpoints": { type: "boolean", default: false },
    "approve-reversible": { type: "boolean", default: false },
    checkpoints: { type: "boolean", default: false },
    rollback: { type: "string" },
  },
});

const workspace = path.resolve(values.workspace!);

// ---- maintenance modes (no API key needed) ----
if (values.checkpoints || values.rollback) {
  const sg = new ShadowGit(workspace);
  if (values.rollback) {
    const sha = await sg.rollback(values.rollback);
    console.log(`restored workspace to ${sha.slice(0, 7)} (the pre-rollback state was saved too)`);
  }
  for (const c of await sg.list()) console.log(`${c.sha.slice(0, 7)}  ${c.date}  ${c.label}`);
  process.exit(0);
}

const task = positionals.join(" ").trim();
if (!task) {
  console.error('Usage: agent [-w <dir>] [--model <id>] [--max-iterations N] "<task>"');
  console.error("       agent -w <dir> --checkpoints              list checkpoints");
  console.error("       agent -w <dir> --rollback <sha|last|first>");
  console.error("Flags: --approve-reversible  auto-approve non-destructive asks (never destructive ones)");
  console.error("       --no-guardrails       run without guardrails (unsafe)   --no-checkpoints");
  process.exit(2);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY first.");
  process.exit(2);
}

const guardrails = values["no-guardrails"]
  ? undefined
  : defaultGuardrails(cliApprover({ approveReversible: values["approve-reversible"] }));
if (!guardrails) console.warn("⚠  guardrails are OFF: commands run with your full permissions.");

let checkpoints: ShadowGit | undefined;
if (!values["no-checkpoints"]) {
  try {
    checkpoints = new ShadowGit(workspace);
    await checkpoints.init();
    await checkpoints.snapshot(`run start: ${task.slice(0, 60)}`); // handy "undo this whole run" point
  } catch (e) {
    console.warn(`⚠  checkpoints disabled (is git installed?): ${(e as Error).message}`);
    checkpoints = undefined;
  }
}

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
    case "guardrail":
      console.log(`🛡  ${e.outcome} [${e.risk}] ${e.reason}`);
      break;
    case "checkpoint":
      console.log(`📌 checkpoint ${e.sha.slice(0, 7)}`);
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
  guardrails,
  checkpoints,
  maxIterations: Number(values["max-iterations"]),
  commandTimeoutMs: Number(values["command-timeout"]) * 1000,
  onEvent: render,
});

console.log(`\ntokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out, ${result.iterations} steps`);
if (checkpoints) console.log(`undo anything with: agent -w "${workspace}" --rollback last   (list: --checkpoints)`);
process.exit(result.status === "completed" ? 0 : 1);
