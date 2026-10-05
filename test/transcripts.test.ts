import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanup, loadTasks, runTask, writeTranscript } from "../evals/lib.js";
import type { ModelResponse } from "../src/types.js";
import { ScriptedModel } from "./helpers.js";

const shop = loadTasks().find((t) => t.id === "shop-shipping")!;

let n = 0;
/** A scripted step that also reports token usage, like a real API response. */
const step = (inputTokens: number, name: string, input: Record<string, unknown>): (() => ModelResponse) => () => ({
  content: [{ type: "tool_use", id: `u${++n}`, name, input }],
  stopReason: "tool_use",
  usage: { inputTokens, outputTokens: 40 },
});
const finish = (inputTokens: number): (() => ModelResponse) => () => ({
  content: [{ type: "text", text: "Fixed the shipping unit mix-up." }],
  stopReason: "end_turn",
  usage: { inputTokens, outputTokens: 30 },
});

// The path a real agent has to walk: failing test -> checkout -> fulfilment -> shipping/index (bug).
const solveShop = () =>
  new ScriptedModel([
    step(900, "run_command", { command: "npm test" }),
    step(1400, "search", { pattern: "shippingFor|quoteShipping" }),
    step(1900, "read_file", { path: "src/orders/fulfilment.js" }),
    step(2300, "read_file", { path: "src/shipping/index.js" }),
    step(2800, "edit_file", { path: "src/shipping/index.js", old_str: "rateFor(kgToGrams(parcel.weightKg), zone)", new_str: "rateFor(parcel.weightKg, zone)" }),
    step(3100, "edit_file", { path: "src/shipping/index.js", old_str: 'import { kgToGrams } from "../utils/units.js";\n', new_str: "" }),
    step(3300, "run_command", { command: "npm test" }),
    finish(3600),
  ]);

test("shop-shipping: solved by walking checkout -> fulfilment -> shipping, with per-step context sizes recorded", async () => {
  const rec = await runTask(shop, solveShop());
  try {
    assert.equal(rec.ok, true, rec.detail);
    assert.equal(rec.steps, 8);
    assert.deepEqual(rec.stepInputTokens, [900, 1400, 1900, 2300, 2800, 3100, 3300, 3600]);
    assert.equal(rec.blockedCalls, 0);
    assert.ok(rec.events.some((e) => e.type === "model_call" && e.messageCount === 1)); // first call sees only the task
  } finally {
    cleanup(rec.dir);
  }
});

test("writeTranscript: header first, events in order, long tool output truncated, usage kept", async () => {
  const rec = await runTask(shop, solveShop());
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tx-")), "nested", "shop-shipping-r1.jsonl");
  try {
    // inject an oversized tool result to check truncation
    rec.events.push({ type: "tool_result", id: "big", name: "run_command", content: "x".repeat(5000), isError: false });
    writeTranscript(file, shop, rec, 2);

    const lines = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines[0].type, "header");
    assert.equal(lines[0].id, "shop-shipping");
    assert.equal(lines[0].rep, 2);
    assert.equal(lines[0].ok, true);
    assert.equal(lines.length, rec.events.length + 1);

    const usage = lines.filter((l) => l.type === "model_call").map((l) => l.inputTokens);
    assert.deepEqual(usage, [900, 1400, 1900, 2300, 2800, 3100, 3300, 3600]);

    const big = lines.find((l) => l.id === "big");
    assert.ok(big.content.length < 1700);
    assert.match(big.content, /\[\+3500 chars\]/);
  } finally {
    cleanup(rec.dir);
  }
});

test("a model_call event is emitted for every model response, even without usage data", async () => {
  const task = loadTasks().find((t) => t.id === "sum-bug")!;
  const rec = await runTask(task, new ScriptedModel([() => ({ content: [{ type: "text", text: "nothing to do" }], stopReason: "end_turn" })]));
  try {
    const calls = rec.events.filter((e) => e.type === "model_call");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.type === "model_call" && calls[0]!.inputTokens, 0);
  } finally {
    cleanup(rec.dir);
  }
});
