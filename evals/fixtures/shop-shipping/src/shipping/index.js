import { kgToGrams } from "../utils/units.js";
import { buildParcel } from "./parcel.js";
import { rateFor } from "./rates.js";

export { zoneFor } from "./zones.js";

/** Quote shipping for cart items to a zone. */
export function quoteShipping(items, zone) {
  const parcel = buildParcel(items);
  return rateFor(kgToGrams(parcel.weightKg), zone);
}
