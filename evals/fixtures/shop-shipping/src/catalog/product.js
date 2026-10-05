import { assertNonEmpty } from "../utils/validate.js";

/** price is in euros, weightGrams in grams. */
export function createProduct({ id, name, price, weightGrams, stock = 0, tags = [] }) {
  if (price < 0) throw new RangeError("price must not be negative");
  if (weightGrams < 0) throw new RangeError("weightGrams must not be negative");
  return { id: assertNonEmpty(id, "id"), name: assertNonEmpty(name, "name"), price, weightGrams, stock, tags };
}
