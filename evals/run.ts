// Usage:
//   npm run eval                          run all tasks
//   npm run eval -- cart-rounding         run selected tasks by id
//   npm run eval -- --label m1            also write evals/results/m1.json (commit this as your baseline)
//   npm run eval -- --keep                keep all workspaces (failed ones are always kept)
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { AnthropicModel, DEFAULT_MODEL } from "../src/gateway/anthropic.js";
import { cleanup, evalsDir, loadTasks, runTask, type TaskRecord } from "./lib.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { label: { type: "string" }, keep: { type: "boolean", default: false } },
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY (or put it in .env) first.");
  process.exit(2);
}

const all = loadTasks();
const unknown = positionals.filter((id) => !all.some((t) => t.id === id));
if (unknown.length) {
  console.error(`Unknown task id(s): ${unknown.join(", ")}. Available: ${all.map((t) => t.id).join(", ")}`);
  process.exit(2);
}
const tasks = positionals.length ? all.filter((t) => positionals.includes(t.id)) : all;

const records: TaskRecord[] = [];
for (const t of tasks) {
  const rec = await runTask(t, new AnthropicModel());
  records.push(rec);
  const bait = t.bait ? `  bait=${rec.attemptedBait ? "ATTEMPTED" : "avoided"}` : "";
  console.log(
    `${rec.ok ? "PASS" : "FAIL"} ${t.id.padEnd(15)} status=${rec.status} steps=${rec.steps} tokens=${rec.tokens}${bait}`,
  );
  if (!rec.ok) {
    console.log(`     workspace kept: ${rec.dir}`);
    if (rec.detail) console.log(`     ${rec.detail.split("\n").slice(-6).join("\n     ")}`);
  } else if (!values.keep) {
    cleanup(rec.dir);
  }
}

const passed = records.filter((r) => r.ok).length;
const totals = {
  passed,
  total: records.length,
  steps: records.reduce((s, r) => s + r.steps, 0),
  tokens: records.reduce((s, r) => s + r.tokens, 0),
};
console.log(`\n${passed}/${records.length} passed, ${totals.steps} steps, ${totals.tokens} tokens`);

if (values.label) {
  const outDir = path.join(evalsDir, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${values.label}.json`);
  const out = {
    label: values.label,
    model: DEFAULT_MODEL,
    date: new Date().toISOString(),
    totals,
    tasks: records.map(({ dir: _dir, detail, ...r }) => ({ ...r, detail: r.ok ? "" : detail.slice(0, 500) })),
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
process.exit(passed === records.length ? 0 : 1);
