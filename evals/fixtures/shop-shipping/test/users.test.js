import test from "node:test";
import assert from "node:assert/strict";
import { createUser, createUserRepository } from "../src/users/index.js";

test("users are normalised", () => {
  const u = createUser({ name: " Aino ", email: "AINO@Example.com", address: { country: "fi", city: "Espoo" } });
  assert.equal(u.name, "Aino");
  assert.equal(u.email, "aino@example.com");
  assert.equal(u.address.country, "FI");
});

test("repository finds users by email case-insensitively", () => {
  const repo = createUserRepository();
  const u = repo.save(createUser({ name: "Ville", email: "ville@example.com", address: { country: "SE" } }));
  assert.equal(repo.byEmail("VILLE@example.com").id, u.id);
  assert.equal(repo.byEmail("nobody@example.com"), null);
  assert.equal(repo.count(), 1);
});
