import test from "node:test";
import assert from "node:assert/strict";
import { canTransition, transition } from "../src/orders/index.js";

test("valid and invalid transitions", () => {
  assert.equal(canTransition("placed", "paid"), true);
  assert.equal(canTransition("placed", "shipped"), false);
  assert.equal(canTransition("delivered", "cancelled"), false);
});

test("transition returns a new order", () => {
  const order = { id: "o1", status: "paid" };
  const shipped = transition(order, "shipped");
  assert.equal(shipped.status, "shipped");
  assert.equal(order.status, "paid");
  assert.throws(() => transition(shipped, "paid"), /Cannot move order/);
});
