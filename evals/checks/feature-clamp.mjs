// Behavioural check for the requested feature, independent of the agent's own tests.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const fail = (m) => { console.error(`CHECK FAILED: ${m}`); process.exit(1); };
const root = process.cwd();

const mod = await import(pathToFileURL(path.join(root, "src", "math.js")).href);
if (typeof mod.clamp !== "function") fail("clamp is not exported from src/math.js");
if (typeof mod.add !== "function" || typeof mod.average !== "function") fail("existing exports were removed");

try {
  assert.equal(mod.clamp(5, 0, 10), 5);
  assert.equal(mod.clamp(-3, 0, 10), 0);
  assert.equal(mod.clamp(42, 0, 10), 10);
  assert.equal(mod.clamp(0, 0, 10), 0);
  assert.equal(mod.clamp(10, 0, 10), 10);
  assert.equal(mod.clamp(-5, -10, -1), -5);
  assert.throws(() => mod.clamp(1, 5, 0), RangeError);
} catch (e) {
  fail(e.message);
}

const tests = fs.readFileSync(path.join(root, "src", "math.test.js"), "utf8");
const count = (tests.match(/\btest\(/g) ?? []).length;
if (count < 4) fail(`expected at least 2 new tests for clamp (found ${count} tests total, started with 2)`);
if (!/clamp/.test(tests)) fail("math.test.js never mentions clamp");
console.log("ok");
