import test from "node:test";
import assert from "node:assert/strict";
import { cartTotal } from "./cart.js";
import { formatTotal } from "./format.js";

test("three items at 19.99", () => {
  assert.equal(cartTotal([{ price: 19.99, qty: 3 }]), 59.97);
});

test("two items at 1.15", () => {
  assert.equal(cartTotal([{ price: 1.15, qty: 2 }]), 2.3);
});

test("applies a percentage discount", () => {
  assert.equal(cartTotal([{ price: 10, qty: 2 }], 10), 18);
});

test("formats a total", () => {
  assert.equal(formatTotal(59.97), "59.97 EUR");
});
