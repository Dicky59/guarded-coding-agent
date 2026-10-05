import test from "node:test";
import assert from "node:assert/strict";
import { gramsToKg, kgToGrams, roundMoney } from "../src/utils/units.js";
import { assertNonEmpty, assertPositiveInt } from "../src/utils/validate.js";
import { newId } from "../src/utils/ids.js";
import { isoDay, startOfDay } from "../src/utils/dates.js";

test("unit conversions round-trip", () => {
  assert.equal(gramsToKg(2500), 2.5);
  assert.equal(kgToGrams(2.5), 2500);
  assert.equal(kgToGrams(gramsToKg(750)), 750);
});

test("roundMoney rounds to cents", () => {
  assert.equal(roundMoney(1.005 + 0.1), 1.11);
  assert.equal(roundMoney(2), 2);
});

test("validators", () => {
  assert.equal(assertPositiveInt(3, "qty"), 3);
  assert.throws(() => assertPositiveInt(0, "qty"), RangeError);
  assert.throws(() => assertPositiveInt(1.5, "qty"), RangeError);
  assert.equal(assertNonEmpty("  hi ", "name"), "hi");
  assert.throws(() => assertNonEmpty("  ", "name"), TypeError);
});

test("ids are sequential per prefix", () => {
  const a = newId("zzz");
  const b = newId("zzz");
  assert.equal(a, "zzz-1");
  assert.equal(b, "zzz-2");
  assert.equal(newId("yyy"), "yyy-1");
});

test("date helpers", () => {
  assert.equal(isoDay(new Date("2026-03-04T23:59:00Z")), "2026-03-04");
  assert.equal(startOfDay(new Date("2026-03-04T15:30:00Z")).toISOString(), "2026-03-04T00:00:00.000Z");
});
