import test from "node:test";
import assert from "node:assert/strict";
import { applyPercentDiscount, priceLine, vatRateFor, volumeDiscountPercent } from "../src/pricing/index.js";

test("VAT rates per country with a default", () => {
  assert.equal(vatRateFor("FI"), 0.255);
  assert.equal(vatRateFor("SE"), 0.25);
  assert.equal(vatRateFor("US"), 0.24);
});

test("percent discounts", () => {
  assert.equal(applyPercentDiscount(100, 15), 85);
  assert.throws(() => applyPercentDiscount(100, 120), RangeError);
});

test("volume discount tiers", () => {
  assert.equal(volumeDiscountPercent(9), 0);
  assert.equal(volumeDiscountPercent(10), 5);
  assert.equal(volumeDiscountPercent(50), 10);
});

test("line price applies the volume discount", () => {
  assert.equal(priceLine({ price: 10 }, 2), 20);
  assert.equal(priceLine({ price: 10 }, 10), 95);
});
