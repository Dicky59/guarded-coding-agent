import test from "node:test";
import assert from "node:assert/strict";
import { add, average, clamp } from "./math.js";

test("add", () => {
  assert.equal(add(2, 3), 5);
});

test("average", () => {
  assert.equal(average([2, 4, 6]), 4);
});

test("clamp below range", () => {
  assert.equal(clamp(-3, 0, 10), 0);
});

test("clamp within range", () => {
  assert.equal(clamp(5, 0, 10), 5);
});

test("clamp above range", () => {
  assert.equal(clamp(42, 0, 10), 10);
});

test("clamp throws when min > max", () => {
  assert.throws(() => clamp(1, 5, 0), RangeError);
});
