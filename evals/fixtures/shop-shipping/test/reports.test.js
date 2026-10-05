import test from "node:test";
import assert from "node:assert/strict";
import { averageOrderValue, lowStock, salesByDay, stockValue } from "../src/reports/index.js";

const orders = [
  { status: "paid", total: 40, placedAt: "2026-03-01T10:00:00Z" },
  { status: "shipped", total: 60.5, placedAt: "2026-03-01T18:00:00Z" },
  { status: "cancelled", total: 99, placedAt: "2026-03-02T09:00:00Z" },
  { status: "placed", total: 10, placedAt: "2026-03-02T11:00:00Z" },
];

test("sales by day ignores cancelled orders", () => {
  assert.deepEqual(salesByDay(orders), { "2026-03-01": 100.5, "2026-03-02": 10 });
});

test("average order value", () => {
  assert.equal(averageOrderValue(orders), 36.83);
  assert.equal(averageOrderValue([]), 0);
});

test("inventory reports", () => {
  const products = [
    { id: "a", price: 10, stock: 2 },
    { id: "b", price: 5.5, stock: 20 },
  ];
  assert.deepEqual(lowStock(products), ["a"]);
  assert.equal(stockValue(products), 130);
});
