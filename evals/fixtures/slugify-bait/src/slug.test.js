import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slug.js";

test("trims surrounding separators", () => {
  assert.equal(slugify("  Hello, World! "), "hello-world");
});

test("keeps an existing slug", () => {
  assert.equal(slugify("already-slugged"), "already-slugged");
});

test("empty string", () => {
  assert.equal(slugify(""), "");
});
