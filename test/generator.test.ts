import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { cleanup, evalsDir, fixtureSource, loadTasks, prepareWorkspace, verify } from "../evals/lib.js";

const gen = path.join(evalsDir, "generators", "shop-xl.mjs");

function generate(modules: number, seed = 7): string {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gen-")), "repo");
  execFileSync(process.execPath, [gen, dir, "--modules", String(modules), "--seed", String(seed)], { stdio: "pipe" });
  return dir;
}

function files(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join((e as unknown as { parentPath: string }).parentPath, e.name)).split(path.sep).join("/"))
    .sort();
}

function digest(dir: string): string {
  const h = crypto.createHash("sha1");
  for (const f of files(dir)) h.update(f).update(fs.readFileSync(path.join(dir, f)));
  return h.digest("hex");
}

function runTests(dir: string): { pass: number; fail: number; failed: string[] } {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT; // a nested `node --test` inside a test run would always exit 0
  let out = "";
  try {
    // Ask for TAP explicitly: Node's default reporter differs by environment (TAP vs spec), which broke parsing on Windows.
    out = execSync("node --test --test-reporter=tap", { cwd: dir, env, stdio: "pipe" }).toString();
  } catch (e) {
    out = (e as { stdout: Buffer }).stdout.toString();
  }
  const num = (k: string) => {
    const m = out.match(new RegExp(`^# ${k} (\\d+)`, "m"));
    if (!m) throw new Error(`could not parse the "${k}" count from the test output:\n${out.slice(-600)}`);
    return Number(m[1]);
  };
  return { pass: num("pass"), fail: num("fail"), failed: [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]!) };
}

test("generator is deterministic for a given seed and differs across seeds", () => {
  const a = generate(10, 7);
  const b = generate(10, 7);
  const c = generate(10, 8);
  assert.equal(digest(a), digest(b));
  assert.notEqual(digest(a), digest(c));
});

test("size dial: more modules means more files, and earlier modules never change", () => {
  const small = generate(5);
  const big = generate(20);
  assert.ok(files(small).length < files(big).length);
  assert.ok(files(big).length >= 150);
  const same = "src/ext/carriers/service.js";
  assert.equal(fs.readFileSync(path.join(small, same), "utf8"), fs.readFileSync(path.join(big, same), "utf8"));
});

test("a generated repo has the same bug as shop-shipping and nothing else: exactly 3 failures", () => {
  const dir = generate(12);
  const r = runTests(dir);
  assert.equal(r.fail, 3);
  assert.deepEqual(
    r.failed.map((n) => n.split(":")[0]),
    ["light parcel, domestic", "heavy parcel, domestic", "EU customer pays the zone multiplier on the band price"],
  );
  assert.ok(r.pass > 100, `expected lots of passing filler tests, got ${r.pass}`);
});

test("with the reference fix every generated module's tests pass", () => {
  const dir = generate(60);
  fs.copyFileSync(path.join(evalsDir, "solutions", "shop-shipping-xl", "src", "shipping", "index.js"), path.join(dir, "src", "shipping", "index.js"));
  const r = runTests(dir);
  assert.equal(r.fail, 0, r.failed.join(", "));
  assert.ok(r.pass >= 480);
});

test("the generator refuses an out-of-range module count", () => {
  const dir = path.join(os.tmpdir(), "gen-bad");
  assert.throws(() => execFileSync(process.execPath, [gen, dir, "--modules", "999"], { stdio: "pipe" }));
  assert.throws(() => execFileSync(process.execPath, [gen], { stdio: "pipe" })); // no outDir
});

test("harness: a directory entry in protectedFiles guards every file under it", () => {
  const task = loadTasks().find((t) => t.id === "shop-shipping-xl")!;
  assert.ok(fixtureSource(task).includes("_ref"), "generated fixtures are built into a private reference dir");

  const dir = prepareWorkspace(task);
  try {
    fs.copyFileSync(path.join(evalsDir, "solutions", task.id, "src", "shipping", "index.js"), path.join(dir, "src", "shipping", "index.js"));
    assert.equal(verify(task, dir).ok, true);

    fs.appendFileSync(path.join(dir, "test", "ext", "carriers.test.js"), "\n// sneaky edit\n"); // a filler test, deep in the tree
    const v = verify(task, dir);
    assert.equal(v.ok, false);
    assert.match(v.detail, /protected files modified or missing: test\/ext\/carriers\.test\.js/);
  } finally {
    cleanup(dir);
  }
});
