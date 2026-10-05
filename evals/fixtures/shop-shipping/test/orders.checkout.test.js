import test from "node:test";
import assert from "node:assert/strict";
import { addItem, createCart, placeOrder } from "../src/orders/index.js";
import { createUser } from "../src/users/index.js";

const mug = { id: "mug", name: "Mug", price: 12.5, weightGrams: 400 };
const anvil = { id: "anvil", name: "Anvil", price: 40, weightGrams: 6000 };

const finn = createUser({ name: "Aino", email: "aino@example.com", address: { country: "FI" } });
const swede = createUser({ name: "Ville", email: "ville@example.com", address: { country: "SE" } });

test("light parcel, domestic: 2 mugs = 0.8 kg", () => {
  const order = placeOrder({ cart: addItem(createCart(), mug, 2), user: finn });
  assert.equal(order.subtotal, 25);
  assert.equal(order.vat, 6.38);
  assert.equal(order.shipping, 4.9);
  assert.equal(order.total, 36.28);
});

test("heavy parcel, domestic: 2 anvils = 12 kg", () => {
  const order = placeOrder({ cart: addItem(createCart(), anvil, 2), user: finn });
  assert.equal(order.subtotal, 80);
  assert.equal(order.vat, 20.4);
  assert.equal(order.shipping, 14.9);
  assert.equal(order.total, 115.3);
});

test("EU customer pays the zone multiplier on the band price", () => {
  const order = placeOrder({ cart: addItem(createCart(), mug, 2), user: swede });
  assert.equal(order.vat, 6.25);
  assert.equal(order.shipping, 7.84);
  assert.equal(order.total, 39.09);
});

test("an empty cart cannot be checked out", () => {
  assert.throws(() => placeOrder({ cart: createCart(), user: finn }), /empty cart/);
});

test("orders get unique ids and start as placed", () => {
  const cart = addItem(createCart(), mug, 1);
  const a = placeOrder({ cart, user: finn });
  const b = placeOrder({ cart, user: finn });
  assert.notEqual(a.id, b.id);
  assert.equal(a.status, "placed");
});
