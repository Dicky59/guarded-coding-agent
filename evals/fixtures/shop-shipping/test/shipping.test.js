import test from "node:test";
import assert from "node:assert/strict";
import { buildParcel } from "../src/shipping/parcel.js";
import { rateFor } from "../src/shipping/rates.js";
import { zoneFor, zoneMultiplier } from "../src/shipping/zones.js";

test("zones", () => {
  assert.equal(zoneFor("FI"), "domestic");
  assert.equal(zoneFor("SE"), "eu");
  assert.equal(zoneFor("US"), "world");
  assert.equal(zoneMultiplier("eu"), 1.6);
  assert.throws(() => zoneMultiplier("moon"), /Unknown shipping zone/);
});

test("a parcel adds up item weights and reports kilograms", () => {
  const parcel = buildParcel([
    { product: { weightGrams: 500 }, qty: 2 },
    { product: { weightGrams: 250 }, qty: 4 },
  ]);
  assert.equal(parcel.weightKg, 2);
  assert.equal(parcel.itemCount, 6);
});

test("rate bands by weight in kg", () => {
  assert.equal(rateFor(0.5, "domestic"), 4.9);
  assert.equal(rateFor(1, "domestic"), 4.9);
  assert.equal(rateFor(3, "domestic"), 8.9);
  assert.equal(rateFor(12, "domestic"), 14.9);
  assert.equal(rateFor(40, "domestic"), 29.9);
});

test("zone multiplier is applied to the band price", () => {
  assert.equal(rateFor(0.5, "eu"), 7.84);
  assert.equal(rateFor(12, "world"), 35.76);
});
