import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ShadowGit } from "../src/checkpoints/shadowGit.js";

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "shadow-"));
  const ws = path.join(base, "ws");
  fs.mkdirSync(ws);
  return { ws, store: path.join(base, "store") };
}

test("snapshot + rollback restores edits, removes new files, keeps ignored files", async () => {
  const { ws, store } = setup();
  fs.writeFileSync(path.join(ws, "a.txt"), "one\n");
  fs.mkdirSync(path.join(ws, "node_modules"));
  fs.writeFileSync(path.join(ws, "node_modules", "dep.js"), "dep");
  fs.writeFileSync(path.join(ws, ".env"), "SECRET=1\n");

  const sg = new ShadowGit(ws, store);
  await sg.init();
  const before = await sg.snapshot("before edit");

  fs.writeFileSync(path.join(ws, "a.txt"), "two\n");
  fs.writeFileSync(path.join(ws, "new.txt"), "created later\n");
  fs.writeFileSync(path.join(ws, "node_modules", "dep.js"), "changed");

  await sg.rollback(before);

  assert.equal(fs.readFileSync(path.join(ws, "a.txt"), "utf8"), "one\n");
  assert.equal(fs.existsSync(path.join(ws, "new.txt")), false);
  assert.equal(fs.readFileSync(path.join(ws, "node_modules", "dep.js"), "utf8"), "changed"); // excluded: untouched
  assert.equal(fs.readFileSync(path.join(ws, ".env"), "utf8"), "SECRET=1\n"); // never snapshotted, never deleted
});

test("restores a deleted directory and rollback is itself undoable", async () => {
  const { ws, store } = setup();
  fs.mkdirSync(path.join(ws, "data"));
  fs.writeFileSync(path.join(ws, "data", "db.csv"), "id\n1\n");
  const sg = new ShadowGit(ws, store);
  await sg.init();
  const good = await sg.snapshot("good");

  fs.rmSync(path.join(ws, "data"), { recursive: true });
  fs.writeFileSync(path.join(ws, "after.txt"), "x");
  await sg.rollback("last"); // "last" = most recent checkpoint
  assert.equal(fs.readFileSync(path.join(ws, "data", "db.csv"), "utf8"), "id\n1\n");
  assert.equal(fs.existsSync(path.join(ws, "after.txt")), false);

  // the pre-rollback state was kept, so it can be restored too
  const labels = (await sg.list()).map((c) => c.label);
  assert.ok(labels.includes("pre-rollback"));
  const pre = (await sg.list()).find((c) => c.label === "pre-rollback")!;
  await sg.rollback(pre.sha);
  assert.equal(fs.existsSync(path.join(ws, "data")), false);
  assert.equal(fs.existsSync(path.join(ws, "after.txt")), true);
  assert.ok(good);
});

test("never touches the user's own git repo", async () => {
  const { ws, store } = setup();
  execSync("git init -q && git config user.email t@t && git config user.name t && git config core.autocrlf false", { cwd: ws });
  fs.writeFileSync(path.join(ws, "f.txt"), "1\n");
  execSync("git add -A && git commit -q -m user-commit", { cwd: ws });

  const sg = new ShadowGit(ws, store);
  await sg.init();
  fs.writeFileSync(path.join(ws, "f.txt"), "2\n");
  await sg.snapshot("s");
  await sg.rollback("first");

  const log = execSync("git log --format=%s", { cwd: ws }).toString().trim();
  assert.equal(log, "user-commit"); // no shadow commits leaked in
  assert.equal(execSync("git status --short", { cwd: ws }).toString().trim(), ""); // no .agent/ clutter either
});

test("rollback rejects option-looking and unknown refs", async () => {
  const { ws, store } = setup();
  const sg = new ShadowGit(ws, store);
  await sg.init();
  await assert.rejects(() => sg.rollback("--help"), /Unknown checkpoint/);
  await assert.rejects(() => sg.rollback("deadbeef1234"), /./);
});

test("a NEW ShadowGit instance (e.g. the CLI in a later process) can roll back the previous run", async () => {
  const { ws, store } = setup();
  fs.mkdirSync(path.join(ws, "data"));
  fs.writeFileSync(path.join(ws, "data", "db.csv"), "precious\n");

  const run = new ShadowGit(ws, store); // "the agent run"
  await run.init();
  await run.snapshot("before rm"); // taken just before the destructive action
  fs.rmSync(path.join(ws, "data"), { recursive: true });

  const cli = new ShadowGit(ws, store); // fresh instance, same store
  await cli.rollback("last");
  assert.equal(fs.readFileSync(path.join(ws, "data", "db.csv"), "utf8"), "precious\n");
  assert.equal((await cli.list()).filter((c) => c.label === "baseline").length, 1); // no second "baseline"
});

test("rollback with no store reports a clear error", async () => {
  const { ws, store } = setup();
  await assert.rejects(() => new ShadowGit(ws, store).rollback("last"), /No checkpoints/);
});
