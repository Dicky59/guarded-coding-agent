#!/usr/bin/env node
// Summarise saved eval transcripts: where did the tokens go?
//
//   node evals/transcripts.mjs evals/results/m2-xl                 every run in a folder
//   node evals/transcripts.mjs evals/results/m2-xl/shop-shipping-xl-r2.jsonl
//
// A run's token cost is roughly the SUM of the context size at every step, because each step re-sends
// everything so far. So a tool result costs (its size) x (the number of later steps that carry it).
// Token sizes are calibrated from the real context growth between steps, not guessed from characters.
import fs from "node:fs";
import path from "node:path";

const TRUNCATED = /…\[\+(\d+) chars\]$/;
const TRANSCRIPT_LIMIT = 1500; // must match writeTranscript in evals/lib.ts
const input = process.argv[2];
if (!input) {
  console.error("usage: node evals/transcripts.mjs <folder | file.jsonl>");
  process.exit(2);
}
const files = fs.statSync(input).isDirectory()
  ? fs.readdirSync(input).filter((f) => f.endsWith(".jsonl")).sort().map((f) => path.join(input, f))
  : [input];

const num = (n) => Math.round(Number(n)).toLocaleString("en-US");
const target = (inp) => String(inp.command ?? inp.path ?? inp.pattern ?? JSON.stringify(inp)).replace(/\s+/g, " ").slice(0, 56);

const allResults = [];

for (const file of files) {
  const events = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const header = events[0];
  const ctxAt = new Map(); // step -> input tokens of that model call
  const rows = [];
  const calls = new Map();
  let step = 0;

  for (const e of events.slice(1)) {
    if (e.type === "model_call") {
      step = e.n;
      ctxAt.set(e.n, e.inputTokens);
    } else if (e.type === "tool_call") {
      const row = { step, tool: e.name, target: target(e.input), chars: null, note: "" };
      calls.set(e.id, row);
      rows.push(row);
    } else if (e.type === "guardrail") {
      const row = calls.get(e.id);
      if (row) row.note = e.outcome.toUpperCase();
    } else if (e.type === "tool_result") {
      const row = calls.get(e.id);
      if (!row) continue;
      const m = e.content.match(TRUNCATED);
      row.chars = m ? TRANSCRIPT_LIMIT + Number(m[1]) : e.content.length;
      if (e.isError && !row.note) row.note = "error";
    }
  }

  const calls_n = Math.max(...ctxAt.keys());
  // calibrate tokens-per-char from how much the context grew after each step's results arrived
  let grown = 0;
  let chars = 0;
  for (let s = 1; s < calls_n; s++) {
    const stepChars = rows.filter((r) => r.step === s).reduce((a, r) => a + (r.chars ?? 0), 0);
    if (ctxAt.has(s + 1) && stepChars > 0) {
      grown += ctxAt.get(s + 1) - ctxAt.get(s);
      chars += stepChars;
    }
  }
  const tokPerChar = chars > 0 ? grown / chars : 0.25;

  console.log(`\n${path.basename(file)}  ok=${header.ok} status=${header.status} steps=${header.steps} tokens=${num(header.tokens)}`);
  console.log("step  context   +grew   tool          target                                                   result");
  let prev = null;
  for (const r of rows) {
    const first = r.step !== prev;
    prev = r.step;
    const grew = first && ctxAt.has(r.step + 1) ? `+${num(ctxAt.get(r.step + 1) - ctxAt.get(r.step))}` : "";
    const res = r.chars === null ? "-" : `${num(r.chars)} chars (~${num(r.chars * tokPerChar)} tok)`;
    console.log(
      `${(first ? String(r.step) : "").padEnd(5)} ${(first ? num(ctxAt.get(r.step) ?? 0) : "").padStart(7)} ${grew.padStart(7)}   ${r.tool.padEnd(13)} ${r.target.padEnd(56)} ${res}${r.note ? "  [" + r.note + "]" : ""}`,
    );
    if (r.chars) {
      const tok = r.chars * tokPerChar;
      allResults.push({ file: path.basename(file), step: r.step, tool: r.tool, target: r.target, tok, carried: tok * (calls_n - r.step), runTokens: header.tokens });
    }
  }
  const mine = allResults.filter((x) => x.file === path.basename(file)).sort((a, b) => b.carried - a.carried).slice(0, 3);
  console.log(`  final context ${num(Math.max(...ctxAt.values()))} tokens, ${rows.length} tool calls, ~${(1 / (tokPerChar || 0.25)).toFixed(1)} chars/token (calibrated)`);
  console.log("  costliest results (tokens carried across later steps, % of this run):");
  for (const x of mine) console.log(`    ${num(x.carried).padStart(7)}  ${((100 * x.carried) / x.runTokens).toFixed(0).padStart(3)}%  step ${x.step} ${x.tool} ${x.target}`);
}

if (files.length > 1) {
  allResults.sort((a, b) => b.carried - a.carried);
  console.log(`\n=== across ${files.length} runs: the 5 costliest single results (size x later steps carrying it) ===`);
  for (const x of allResults.slice(0, 5)) {
    console.log(`  ${num(x.carried).padStart(7)} tok (${((100 * x.carried) / x.runTokens).toFixed(0)}% of run)  ${x.file} step ${x.step}  ${x.tool}  ${x.target}`);
  }
}
