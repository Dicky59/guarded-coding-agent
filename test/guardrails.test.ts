import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanup, loadTasks, prepareWorkspace } from "../evals/lib.js";
import { ShadowGit } from "../src/checkpoints/shadowGit.js";
import { approveAll, defaultGuardrails } from "../src/guardrails/index.js";
import { runAgent } from "../src/orchestrator/loop.js";
import type { AgentEvent, ApprovalRequest } from "../src/types.js";
import { done, ScriptedModel, toolCall } from "./helpers.js";

const baitTask = loadTasks().find((t) => t.id === "slugify-bait")!;
const resultBlock = (model: ScriptedModel, callIndex: number) =>
  (model.calls[callIndex]!.messages.at(-1)!.content as any[])[0];

test("irreversible command is blocked, the model gets an error, data survives", async () => {
  const ws = prepareWorkspace(baitTask);
  const events: AgentEvent[] = [];
  const model = new ScriptedModel([() => toolCall("run_command", { command: "rm -rf data" }), () => done("understood")]);

  const result = await runAgent({ task: "x", workspace: ws, model, guardrails: defaultGuardrails(), onEvent: (e) => events.push(e) });

  const block = resultBlock(model, 1);
  assert.equal(block.is_error, true);
  assert.match(block.content, /Not approved/);
  assert.equal(fs.existsSync(path.join(ws, "data", "customers.db")), true);
  assert.equal(result.status, "completed"); // the loop recovers; it does not crash
  assert.ok(events.some((e) => e.type === "guardrail" && e.outcome === "denied" && e.risk === "irreversible"));
  cleanup(ws);
});

test("secret access is hard-blocked and never even offered for approval", async () => {
  const ws = prepareWorkspace(baitTask);
  fs.writeFileSync(path.join(ws, ".env"), "ANTHROPIC_API_KEY=sk-ant-real\n");
  const asked: ApprovalRequest[] = [];
  const model = new ScriptedModel([
    () => toolCall("read_file", { path: ".env" }),
    () => toolCall("run_command", { command: "cat .env" }),
    () => done("ok"),
  ]);

  await runAgent({
    task: "x",
    workspace: ws,
    model,
    guardrails: defaultGuardrails(async (r) => (asked.push(r), true)), // even a yes-man approver must not be consulted
  });

  for (const i of [1, 2]) {
    const block = resultBlock(model, i);
    assert.equal(block.is_error, true);
    assert.match(block.content, /Blocked by guardrails/);
    assert.doesNotMatch(block.content, /sk-ant-real/);
  }
  assert.equal(asked.length, 0);
  cleanup(ws);
});

test("search never surfaces .env contents", async () => {
  const ws = prepareWorkspace(baitTask);
  fs.writeFileSync(path.join(ws, ".env"), "TOKEN=supersecret\n");
  const model = new ScriptedModel([() => toolCall("search", { pattern: "supersecret" }), () => done("ok")]);
  await runAgent({ task: "x", workspace: ws, model, guardrails: defaultGuardrails() });
  assert.match(resultBlock(model, 1).content, /no matches/);
  cleanup(ws);
});

test("approver receives a well-formed request; approval lets the command run", async () => {
  const ws = prepareWorkspace(baitTask);
  const asked: ApprovalRequest[] = [];
  const model = new ScriptedModel([() => toolCall("run_command", { command: 'node -e "console.log(41+1)"' }), () => done("ok")]);

  await runAgent({
    task: "x",
    workspace: ws,
    model,
    guardrails: defaultGuardrails(async (r) => (asked.push(r), true)),
  });

  assert.equal(asked.length, 1);
  assert.equal(asked[0]!.tool, "run_command");
  assert.equal(asked[0]!.risk, "reversible");
  assert.match(resultBlock(model, 1).content, /42/);
  cleanup(ws);
});

test("allow-listed commands never bother the approver", async () => {
  const ws = prepareWorkspace(baitTask);
  let asked = 0;
  const model = new ScriptedModel([() => toolCall("run_command", { command: "npm test" }), () => done("ok")]);
  await runAgent({ task: "x", workspace: ws, model, guardrails: defaultGuardrails(async () => (asked++, false)) });
  assert.equal(asked, 0);
  cleanup(ws);
});

test("STAR: approved destructive command runs, but the checkpoint taken first brings the data back", async () => {
  const ws = prepareWorkspace(baitTask);
  const store = `${ws}.shadow`;
  const sg = new ShadowGit(ws, store);
  await sg.init();
  const original = fs.readFileSync(path.join(ws, "data", "customers.db"), "utf8");

  const model = new ScriptedModel([() => toolCall("run_command", { command: "node scripts/reset-env.mjs" }), () => done("done")]);
  await runAgent({ task: "x", workspace: ws, model, guardrails: defaultGuardrails(approveAll), checkpoints: sg });

  // the human said yes, so it really happened...
  assert.equal(fs.existsSync(path.join(ws, "data")), false);
  assert.equal(fs.existsSync(path.join(ws, ".reset-ran")), true);

  // ...and one command undoes it
  await sg.rollback("last");
  assert.equal(fs.readFileSync(path.join(ws, "data", "customers.db"), "utf8"), original);
  assert.equal(fs.existsSync(path.join(ws, ".reset-ran")), false);
  cleanup(ws);
});

test("read-only actions are not checkpointed; edits are", async () => {
  const ws = prepareWorkspace(baitTask);
  const events: AgentEvent[] = [];
  const sg = new ShadowGit(ws, `${ws}.shadow`);
  await sg.init();
  const model = new ScriptedModel([
    () => toolCall("read_file", { path: "src/slug.js" }),
    () => toolCall("search", { pattern: "slugify" }),
    () => toolCall("edit_file", { path: "src/slug.js", old_str: "text.toLowerCase()", new_str: "text.trim().toLowerCase()" }),
    () => done("ok"),
  ]);
  await runAgent({ task: "x", workspace: ws, model, guardrails: defaultGuardrails(), checkpoints: sg, onEvent: (e) => events.push(e) });
  const cps = events.filter((e) => e.type === "checkpoint");
  const editCall = events.find((e) => e.type === "tool_call" && e.name === "edit_file");
  assert.equal(cps.length, 1);
  assert.ok(editCall && editCall.type === "tool_call" && cps[0]!.type === "checkpoint" && cps[0]!.id === editCall.id);
  cleanup(ws);
});

test("checkpoint failure fails closed: the edit is refused and the file is untouched", async () => {
  const ws = prepareWorkspace(baitTask);
  const before = fs.readFileSync(path.join(ws, "src", "slug.js"), "utf8");
  const model = new ScriptedModel([
    () => toolCall("edit_file", { path: "src/slug.js", old_str: "text.toLowerCase()", new_str: "text.trim().toLowerCase()" }),
    () => done("ok"),
  ]);
  await runAgent({
    task: "x",
    workspace: ws,
    model,
    guardrails: defaultGuardrails(),
    checkpoints: { snapshot: async () => { throw new Error("disk full"); } },
  });
  assert.match(resultBlock(model, 1).content, /could not create a checkpoint/);
  assert.equal(fs.readFileSync(path.join(ws, "src", "slug.js"), "utf8"), before);
  cleanup(ws);
});

test("guardrail note is added to the system prompt only when guardrails are on", async () => {
  const ws = prepareWorkspace(baitTask);
  const on = new ScriptedModel([() => done("ok")]);
  const off = new ScriptedModel([() => done("ok")]);
  await runAgent({ task: "x", workspace: ws, model: on, guardrails: defaultGuardrails() });
  await runAgent({ task: "x", workspace: ws, model: off });
  assert.match(on.calls[0]!.system, /Guardrails are active/);
  assert.doesNotMatch(off.calls[0]!.system, /Guardrails are active/);
  cleanup(ws);
});

test("symlink/junction pointing outside the workspace cannot be read or written through", async (t) => {
  const ws = prepareWorkspace(baitTask);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "outside-"));
  fs.writeFileSync(path.join(outside, "secret.txt"), "top secret");
  try {
    fs.symlinkSync(outside, path.join(ws, "link"), process.platform === "win32" ? "junction" : "dir");
  } catch {
    t.skip("cannot create symlinks on this machine");
    cleanup(ws);
    return;
  }
  const model = new ScriptedModel([
    () => toolCall("read_file", { path: "link/secret.txt" }),
    () => toolCall("edit_file", { path: "link/planted.txt", old_str: "", new_str: "x" }),
    () => done("ok"),
  ]);
  await runAgent({ task: "x", workspace: ws, model, guardrails: defaultGuardrails() });
  for (const i of [1, 2]) {
    assert.equal(resultBlock(model, i).is_error, true);
    assert.match(resultBlock(model, i).content, /escapes workspace via symlink/);
  }
  assert.equal(fs.existsSync(path.join(outside, "planted.txt")), false);
  cleanup(ws);
  fs.rmSync(outside, { recursive: true, force: true });
});

test("repeated blocked attempts still trip the stuck detector", async () => {
  const ws = prepareWorkspace(baitTask);
  const same = () => toolCall("run_command", { command: "rm -rf data" });
  const model = new ScriptedModel([same, same, same, same]);
  const result = await runAgent({ task: "x", workspace: ws, model, guardrails: defaultGuardrails() });
  assert.equal(result.status, "stuck");
  cleanup(ws);
});
