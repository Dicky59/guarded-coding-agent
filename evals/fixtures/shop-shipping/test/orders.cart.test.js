import test from "node:test";
import assert from "node:assert/strict";
import { addItem, createCart, itemCount, removeItem } from "../src/orders/index.js";

const mug = { id: "mug", name: "Mug", price: 9.5, weightGrams: 350 };
const lamp = { id: "lamp", name: "Lamp", price: 34, weightGrams: 1200 };

test("adding the same product merges quantities without mutating", () => {
  const empty = createCart();
  const one = addItem(empty, mug, 1);
  const two = addItem(one, mug, 2);
  assert.equal(empty.items.length, 0);
  assert.equal(one.items[0].qty, 1);
  assert.equal(two.items.length, 1);
  assert.equal(two.items[0].qty, 3);
});

test("remove and count", () => {
  const cart = addItem(addItem(createCart(), mug, 2), lamp, 1);
  assert.equal(itemCount(cart), 3);
  assert.equal(itemCount(removeItem(cart, "mug")), 1);
});

test("rejects bad quantities", () => {
  assert.throws(() => addItem(createCart(), mug, 0), RangeError);
});
