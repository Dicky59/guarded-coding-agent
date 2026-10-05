// Usage:
//   npm run eval                          run all tasks once
//   npm run eval -- cart-rounding         run selected tasks by id
//   npm run eval -- --repeat 3            run the whole suite 3 times and report mean / min / max
//   npm run eval -- --label m2            also write evals/results/m2.json
//   npm run eval -- --keep                keep all workspaces (failed ones are always kept)
//   npm run eval -- --no-guardrails       reproduce the unguarded M1 behaviour (for comparisons)
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { AnthropicModel, DEFAULT_MODEL } from "../src/gateway/anthropic.js";
import { cleanup, evalsDir, loadTasks, runTask, type BlockedCall, type TaskRecord } from "./lib.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    label: { type: "string" },
    repeat: { type: "string", default: "1" },
    keep: { type: "boolean", default: false },
    "no-guardrails": { type: "boolean", default: false },
  },
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY (or put it in .env) first.");
  process.exit(2);
}

const repeat = Number(values.repeat);
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 20) {
  console.error("--repeat must be an integer between 1 and 20.");
  process.exit(2);
}

const all = loadTasks();
const unknown = positionals.filter((id) => !all.some((t) => t.id === id));
if (unknown.length) {
  console.error(`Unknown task id(s): ${unknown.join(", ")}. Available: ${all.map((t) => t.id).join(", ")}`);
  process.exit(2);
}
const tasks = positionals.length ? all.filter((t) => positionals.includes(t.id)) : all;

const guarded = !values["no-guardrails"];
console.log(guarded ? "guardrails: ON (deny-all approver) + checkpoints" : "guardrails: OFF");
if (repeat > 1) console.log(`repeat: ${repeat} (token cost is ${repeat}x a single run)`);

interface Run extends TaskRecord {
  rep: number;
}
const runs: Run[] = [];

for (let rep = 1; rep <= repeat; rep++) {
  if (repeat > 1) console.log(`\n── run ${rep}/${repeat} ──`);
  for (const t of tasks) {
    const rec = await runTask(t, new AnthropicModel(), { guardrails: guarded ? undefined : false });
    runs.push({ ...rec, rep });
    const bait = t.bait ? `  bait=${rec.attemptedBait ? "ATTEMPTED" : "avoided"}` : "";
    const guard = guarded ? `  blocked=${rec.blockedCalls} checkpoints=${rec.checkpoints}` : "";
    console.log(
      `${rec.ok ? "PASS" : "FAIL"} ${t.id.padEnd(15)} status=${rec.status} steps=${rec.steps} tokens=${rec.tokens}${bait}${guard}`,
    );
    for (const b of rec.blocked) console.log(`     refused: ${b.tool} ${b.target}   (${b.reason})`);
    if (!rec.ok) {
      console.log(`     workspace kept: ${rec.dir}`);
      if (rec.detail) console.log(`     ${rec.detail.split("\n").slice(-6).join("\n     ")}`);
    } else if (!values.keep) {
      cleanup(rec.dir);
    }
  }
}

// ---- aggregate ----
const stats = (nums: number[]) => ({
  mean: Math.round(nums.reduce((a, b) => a + b, 0) / nums.length),
  min: Math.min(...nums),
  max: Math.max(...nums),
});
const fmt = (s: { mean: number; min: number; max: number }) =>
  repeat > 1 ? `${s.mean.toLocaleString()} (min ${s.min.toLocaleString()}, max ${s.max.toLocaleString()})` : s.mean.toLocaleString();

const perTask = tasks.map((t) => {
  const rs = runs.filter((r) => r.id === t.id);
  return {
    id: t.id,
    passes: rs.filter((r) => r.ok).length,
    runs: rs.length,
    steps: stats(rs.map((r) => r.steps)),
    tokens: stats(rs.map((r) => r.tokens)),
    blockedCalls: rs.reduce((s, r) => s + r.blockedCalls, 0),
    blocked: rs.flatMap((r) => r.blocked) as BlockedCall[],
    runsDetail: rs.map(({ dir: _dir, detail, rep, ...r }) => ({ rep, ...r, blocked: undefined, detail: r.ok ? "" : detail.slice(0, 500) })),
  };
});

const suiteSteps: number[] = [];
const suiteTokens: number[] = [];
for (let rep = 1; rep <= repeat; rep++) {
  const rs = runs.filter((r) => r.rep === rep);
  suiteSteps.push(rs.reduce((s, r) => s + r.steps, 0));
  suiteTokens.push(rs.reduce((s, r) => s + r.tokens, 0));
}
const passedRuns = runs.filter((r) => r.ok).length;
const totals = {
  passedRuns,
  totalRuns: runs.length,
  blockedCalls: runs.reduce((s, r) => s + r.blockedCalls, 0),
  suiteSteps: stats(suiteSteps),
  suiteTokens: stats(suiteTokens),
};

console.log(`\n${passedRuns}/${runs.length} runs passed`);
console.log(`suite steps:  ${fmt(totals.suiteSteps)}`);
console.log(`suite tokens: ${fmt(totals.suiteTokens)}`);
if (guarded) console.log(`blocked calls: ${totals.blockedCalls}`);
if (repeat > 1) {
  console.log("\nper task (pass rate, mean steps, mean tokens):");
  for (const t of perTask) console.log(`  ${t.id.padEnd(15)} ${t.passes}/${t.runs}  steps ${t.steps.mean}  tokens ${t.tokens.mean.toLocaleString()} (${t.tokens.min.toLocaleString()}-${t.tokens.max.toLocaleString()})`);
}

if (values.label) {
  const outDir = path.join(evalsDir, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${values.label}.json`);
  const out = {
    label: values.label,
    model: DEFAULT_MODEL,
    guardrails: guarded,
    repeat,
    date: new Date().toISOString(),
    totals,
    tasks: perTask,
  };
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
process.exit(passedRuns === runs.length ? 0 : 1);
