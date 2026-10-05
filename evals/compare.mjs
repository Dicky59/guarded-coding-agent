#!/usr/bin/env node
// Compare eval result files, task by task.
//
//   node evals/compare.mjs evals/results/m2-xl.json evals/results/m3a-xl.json
//   node evals/compare.mjs evals/results/m2.json,evals/results/m2-shop.json evals/results/m3a.json
//
// Either side may be several comma-separated files; their tasks are merged by id.
// "better/worse" is only claimed when BOTH hold: the mean moved by at least --min percent (default 10), and the
// token ranges (min-max over the repeats) do not overlap. Very repeatable tasks have tiny ranges, so without the
// threshold a 4% shift would look "significant".
//   node evals/compare.mjs <base> <new> --min 15
import fs from "node:fs";

const argv = process.argv.slice(2);
const minIdx = argv.indexOf("--min");
const MIN_PCT = minIdx >= 0 ? Number(argv.splice(minIdx, 2)[1]) : 10;
const [baseArg, newArg] = argv;
if (!baseArg || !newArg || !Number.isFinite(MIN_PCT)) {
  console.error("usage: node evals/compare.mjs <base.json[,more.json]> <new.json[,more.json]> [--min 10]");
  process.exit(2);
}

function load(arg) {
  const tasks = new Map();
  const labels = [];
  for (const file of arg.split(",")) {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    labels.push(d.label ?? file);
    for (const t of d.tasks ?? []) tasks.set(t.id, t);
  }
  return { tasks, label: labels.join("+") };
}

const base = load(baseArg);
const next = load(newArg);
const n = (x) => Math.round(x).toLocaleString("en-US");
const pct = (a, b) => `${b >= a ? "+" : "-"}${Math.abs(Math.round(((b - a) / a) * 100))}%`;

console.log(`\n${base.label}  ->  ${next.label}\n`);
console.log("task              pass          steps (mean)    tokens (mean, min-max)                     verdict");

let worse = 0;
for (const [id, b] of base.tasks) {
  const t = next.tasks.get(id);
  if (!t) continue;
  const delta = ((t.tokens.mean - b.tokens.mean) / b.tokens.mean) * 100;
  const shown = pct(b.tokens.mean, t.tokens.mean);
  let verdict;
  if (t.passes / t.runs < b.passes / b.runs) {
    verdict = "WORSE: pass rate dropped";
    worse++;
  } else if (Math.abs(delta) < MIN_PCT) verdict = `similar (${shown}, below the ${MIN_PCT}% threshold)`;
  else if (t.tokens.max < b.tokens.min) verdict = `better (${shown}, ranges do not overlap)`;
  else if (t.tokens.min > b.tokens.max) {
    verdict = `WORSE (${shown}, ranges do not overlap)`;
    worse++;
  } else verdict = `similar (${shown}, ranges overlap)`;

  console.log(
    `${id.padEnd(17)} ${`${b.passes}/${b.runs} -> ${t.passes}/${t.runs}`.padEnd(13)} ${`${b.steps.mean} -> ${t.steps.mean}`.padEnd(15)} ` +
      `${`${n(b.tokens.mean)} (${n(b.tokens.min)}-${n(b.tokens.max)}) -> ${n(t.tokens.mean)} (${n(t.tokens.min)}-${n(t.tokens.max)})`.padEnd(42)} ${verdict}`,
  );
}
const only = [...next.tasks.keys()].filter((id) => !base.tasks.has(id));
if (only.length) console.log(`\n(only in new: ${only.join(", ")})`);
const missing = [...base.tasks.keys()].filter((id) => !next.tasks.has(id));
if (missing.length) console.log(`(only in base: ${missing.join(", ")})`);
process.exit(worse ? 1 : 0);
