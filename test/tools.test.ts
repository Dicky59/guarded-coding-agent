import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanup, loadTasks, prepareWorkspace } from "../evals/lib.js";
import { budget, defaultTools, RUN_COMMAND_BUDGET } from "../src/tools/index.js";
import { search } from "../src/tools/search.js";

const ctx = (workspace: string) => ({ workspace, commandTimeoutMs: 20_000 });
const tool = (name: string) => defaultTools.find((t) => t.definition.name === name)!;

function tree(spec: Record<string, number>, rootFiles: string[] = []): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "tree-"));
  for (const [dir, n] of Object.entries(spec)) {
    fs.mkdirSync(path.join(ws, dir), { recursive: true });
    for (let i = 0; i < n; i++) fs.writeFileSync(path.join(ws, dir, `f${i}.js`), "x");
  }
  for (const f of rootFiles) fs.writeFileSync(path.join(ws, f), "x");
  return ws;
}

test("list_files: a small tree is listed in full, one path per line", async () => {
  const ws = tree({ src: 5 }, ["package.json"]);
  const out = (await search.run({ pattern: "", list_files: true }, ctx(ws))).content.split("\n");
  assert.equal(out.length, 6);
  assert.ok(out.includes("package.json"));
  assert.ok(out.includes("src/f0.js")); // posix separators on every OS
});

test("list_files: a big tree collapses into directories with counts, and is far smaller", async () => {
  const ws = tree({ alpha: 40, beta: 40, gamma: 40 }, ["README.md", "package.json"]);
  const out = (await search.run({ pattern: "", list_files: true }, ctx(ws))).content;
  assert.match(out, /alpha\/ \(40 files\)/);
  assert.match(out, /gamma\/ \(40 files\)/);
  assert.match(out, /README\.md/);
  assert.match(out, /122 files total/);
  assert.ok(out.length < 600, `expected a compact summary, got ${out.length} chars`);
  assert.doesNotMatch(out, /f17\.js/); // individual files inside a collapsed directory are not listed
});

test("list_files: drilling into a collapsed directory lists its files", async () => {
  const ws = tree({ alpha: 40, beta: 40, gamma: 40 });
  const out = (await search.run({ pattern: "", list_files: true, path: "alpha" }, ctx(ws))).content.split("\n");
  assert.equal(out.length, 40);
  assert.ok(out.includes("alpha/f17.js"));
});

test("list_files: depth controls how far directories are expanded", async () => {
  const ws = tree({ "a/x": 25, "a/y": 25, "b/z": 25 });
  const shallow = (await search.run({ pattern: "", list_files: true, depth: 1 }, ctx(ws))).content;
  const deeper = (await search.run({ pattern: "", list_files: true, depth: 2 }, ctx(ws))).content;
  assert.match(shallow, /^a\/ \(50 files\)/m);
  assert.match(deeper, /a\/x\/ \(25 files\)/);
  assert.match(deeper, /a\/y\/ \(25 files\)/);
});

test("list_files never lists secret files, flat or collapsed", async () => {
  const flat = tree({ src: 3 }, [".env"]);
  assert.doesNotMatch((await search.run({ pattern: "", list_files: true }, ctx(flat))).content, /\.env/);
  const big = tree({ a: 70 }, [".env", ".env.local"]);
  assert.doesNotMatch((await search.run({ pattern: "", list_files: true }, ctx(big))).content, /\.env/);
});

test("list_files on the 281-file XL repo returns a short summary instead of ~8k chars", async () => {
  const task = loadTasks().find((t) => t.id === "shop-shipping-xl")!;
  const ws = prepareWorkspace(task);
  try {
    const out = (await search.run({ pattern: "", list_files: true }, ctx(ws))).content;
    assert.ok(out.length < 2500, `listing is ${out.length} chars`);
    assert.match(out, /src\/ext\/ \(\d+ files\)/);
    assert.match(out, /\d+ files total/);
    // the part of the repo that matters is visible with file names, without a second call
  assert.match(out, /src\/shipping\/ \(4 files: index\.js, parcel\.js, rates\.js, zones\.js\)/);
  assert.match(out, /src\/orders\/ \(5 files: cart\.js, checkout\.js, fulfilment\.js, index\.js, status\.js\)/);
  } finally {
    cleanup(ws);
  }
});

test("the shop-shipping core (under the flat limit) is still listed in full", async () => {
  const task = loadTasks().find((t) => t.id === "shop-shipping")!;
  const ws = prepareWorkspace(task);
  try {
    const out = (await search.run({ pattern: "", list_files: true }, ctx(ws))).content;
    assert.doesNotMatch(out, /files total/);
    assert.match(out, /src\/shipping\/index\.js/);
  } finally {
    cleanup(ws);
  }
});

test("budget(): short outputs pass through untouched", () => {
  assert.equal(budget("hello", 100), "hello");
});

test("budget(): long outputs keep the head and (mostly) the tail, within the limit plus a short note", () => {
  const lines = Array.from({ length: 3000 }, (_, i) => `LINE ${i + 1}`).join("\n");
  const out = budget(lines, 6000);
  assert.ok(out.length < 6200, `got ${out.length}`);
  assert.match(out, /^LINE 1\n/);
  assert.match(out, /LINE 3000$/);
  assert.match(out, /chars omitted to save context/);
  assert.doesNotMatch(out, /LINE 1500\n/);
});

test("run_command is budgeted: a 30k-line dump comes back small, with failures at the tail intact", async () => {
  const ws = tree({ src: 1 });
  const out = await tool("run_command").run(
    { command: `node -e "for(let i=1;i<=3000;i++)console.log('LINE '+i); console.log('# fail 3')"` },
    ctx(ws),
  );
  assert.ok(out.content.length < RUN_COMMAND_BUDGET + 200, `got ${out.content.length}`);
  assert.match(out.content, /^exit code: 0/);
  assert.match(out.content, /# fail 3\s*$/);
  assert.match(out.content, /omitted/);
});

test("run_command: small outputs and error flags are unchanged", async () => {
  const ws = tree({ src: 1 });
  const ok = await tool("run_command").run({ command: "node -e \"console.log('hi')\"" }, ctx(ws));
  assert.equal(ok.content.trim(), "exit code: 0\nhi");
  const bad = await tool("run_command").run({ command: 'node -e "process.exit(3)"' }, ctx(ws));
  assert.equal(bad.isError, true);
  assert.match(bad.content, /exit code: 3/);
});

test("the model is told about the output budget in the tool description", () => {
  assert.match(tool("run_command").definition.description, /longer than 6000 characters/);
});
