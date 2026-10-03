import test from "node:test";
import assert from "node:assert/strict";
import { sumRange } from "./sum.js";

test("sums an inclusive range", () => {
  assert.equal(sumRange(1, 4), 10);
});
test("single element range", () => {
  assert.equal(sumRange(5, 5), 5);
});
