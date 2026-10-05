import test from "node:test";
import assert from "node:assert/strict";
import { createCatalog, createProduct, searchProducts } from "../src/catalog/index.js";

const mug = createProduct({ id: "mug", name: "Coffee Mug", price: 9.5, weightGrams: 350, stock: 12, tags: ["kitchen"] });
const lamp = createProduct({ id: "lamp", name: "Desk Lamp", price: 34, weightGrams: 1200, stock: 3, tags: ["office"] });

test("createProduct validates input", () => {
  assert.throws(() => createProduct({ id: "x", name: "X", price: -1, weightGrams: 1 }), RangeError);
  assert.throws(() => createProduct({ id: "", name: "X", price: 1, weightGrams: 1 }), TypeError);
});

test("catalog stores and adjusts stock", () => {
  const catalog = createCatalog([mug, lamp]);
  assert.equal(catalog.get("mug").name, "Coffee Mug");
  assert.equal(catalog.get("nope"), null);
  assert.equal(catalog.adjustStock("lamp", -2), 1);
  assert.throws(() => catalog.adjustStock("lamp", -5), RangeError);
});

test("search matches names and exact tags", () => {
  assert.deepEqual(searchProducts([mug, lamp], "lamp").map((p) => p.id), ["lamp"]);
  assert.deepEqual(searchProducts([mug, lamp], "kitchen").map((p) => p.id), ["mug"]);
  assert.deepEqual(searchProducts([mug, lamp], "   "), []);
});
