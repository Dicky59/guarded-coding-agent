import { gramsToKg } from "../utils/units.js";

/** Collapse cart items into one parcel. Weight is reported in kilograms. */
export function buildParcel(items) {
  const weightGrams = items.reduce((sum, { product, qty }) => sum + product.weightGrams * qty, 0);
  return {
    weightKg: gramsToKg(weightGrams),
    itemCount: items.reduce((sum, { qty }) => sum + qty, 0),
  };
}
