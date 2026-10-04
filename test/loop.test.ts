import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runAgent } from "../src/orchestrator/loop.js";
import { done, ScriptedModel, toolCall } from "./helpers.js";

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

const fixture = path.resolve("evals/fixtures/sum-bug");
function tmpWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-test-"));
  fs.cpSync(fixture, dir, { recursive: true });
  return dir;
}

test("fixes a failing test end-to-end (scripted model)", async () => {
  const ws = tmpWorkspace();
  assert.throws(() => execSync("npm test", { cwd: ws, stdio: "pipe", env: cleanEnv() })); // starts red

  const model = new ScriptedModel([
    () => toolCall("run_command", { command: "npm test" }),
    () => toolCall("read_file", { path: "sum.js" }),
    () => toolCall("edit_file", { path: "sum.js", old_str: "i < to", new_str: "i <= to" }),
    () => toolCall("run_command", { command: "npm test" }),
    () => done("Fixed off-by-one in sumRange."),
  ]);

  const result = await runAgent({ task: "fix tests", workspace: ws, model });
  assert.equal(result.status, "completed");
  assert.equal(result.iterations, 5);
  execSync("npm test", { cwd: ws, stdio: "pipe", env: cleanEnv() }); // now green
});

test("tool results are fed back as is_error when a command fails", async () => {
  const ws = tmpWorkspace();
  const model = new ScriptedModel([() => toolCall("run_command", { command: "npm test" }), () => done("ok")]);
  await runAgent({ task: "x", workspace: ws, model });
  const lastUser = model.calls[1]!.messages.at(-1)!;
  const block = (lastUser.content as any[])[0];
  assert.equal(block.type, "tool_result");
  assert.equal(block.is_error, true);
  assert.match(block.content, /exit code: 1/);
});

test("stops when the agent repeats the identical tool call", async () => {
  const ws = tmpWorkspace();
  const same = () => toolCall("run_command", { command: "npm test" });
  const model = new ScriptedModel([same, same, same, same, same]);
  const result = await runAgent({ task: "x", workspace: ws, model });
  assert.equal(result.status, "stuck");
  assert.equal(model.calls.length, 3); // never reached a 4th call
});

test("enforces the iteration cap", async () => {
  const ws = tmpWorkspace();
  let i = 0;
  const model = new ScriptedModel(
    Array.from({ length: 10 }, () => () => toolCall("search", { pattern: `x${i++}` })),
  );
  const result = await runAgent({ task: "x", workspace: ws, model, maxIterations: 4 });
  assert.equal(result.status, "max_iterations");
  assert.equal(result.iterations, 4);
});

test("kills a hanging command at the timeout", async () => {
  const ws = tmpWorkspace();
  const model = new ScriptedModel([
    () => toolCall("run_command", { command: 'node -e "setInterval(()=>{},1000)"' }),
    () => done("gave up"),
  ]);
  const t0 = Date.now();
  const result = await runAgent({ task: "x", workspace: ws, model, commandTimeoutMs: 800 });
  assert.ok(Date.now() - t0 < 5000);
  const block = (model.calls[1]!.messages.at(-1)!.content as any[])[0];
  assert.equal(block.is_error, true);
  assert.match(block.content, /timeout/);
  assert.equal(result.status, "completed");
});

test("rejects paths that escape the workspace", async () => {
  const ws = tmpWorkspace();
  const model = new ScriptedModel([
    () => toolCall("read_file", { path: "../../etc/passwd" }),
    () => toolCall("edit_file", { path: "/tmp/evil.txt", old_str: "", new_str: "x" }),
    () => done("ok"),
  ]);
  await runAgent({ task: "x", workspace: ws, model });
  for (const idx of [1, 2]) {
    const block = (model.calls[idx]!.messages.at(-1)!.content as any[])[0];
    assert.equal(block.is_error, true);
    assert.match(block.content, /escapes workspace/);
  }
});

test("edit_file requires a unique match", async () => {
  const ws = tmpWorkspace();
  fs.writeFileSync(path.join(ws, "dup.txt"), "a\na\n");
  const model = new ScriptedModel([
    () => toolCall("edit_file", { path: "dup.txt", old_str: "a", new_str: "b" }),
    () => done("ok"),
  ]);
  await runAgent({ task: "x", workspace: ws, model });
  const block = (model.calls[1]!.messages.at(-1)!.content as any[])[0];
  assert.match(block.content, /matches 2 places/);
  assert.equal(fs.readFileSync(path.join(ws, "dup.txt"), "utf8"), "a\na\n"); // unchanged
});
test("does not leak ANTHROPIC_API_KEY to agent commands", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-secret";
  const ws = tmpWorkspace();
  const model = new ScriptedModel([
    () => toolCall("run_command", { command: 'node -e "console.log(process.env.ANTHROPIC_API_KEY ?? \'unset\')"' }),
    () => done("ok"),
  ]);
  await runAgent({ task: "x", workspace: ws, model });
  const block = (model.calls[1]!.messages.at(-1)!.content as any[])[0];
  assert.match(block.content, /unset/);
  assert.doesNotMatch(block.content, /sk-ant-test-secret/);
});