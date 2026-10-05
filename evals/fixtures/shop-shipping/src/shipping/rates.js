import { roundMoney } from "../utils/units.js";
import { zoneMultiplier } from "./zones.js";

const BANDS = [
  { upToKg: 1, base: 4.9 },
  { upToKg: 5, base: 8.9 },
  { upToKg: 20, base: 14.9 },
  { upToKg: Infinity, base: 29.9 },
];

/** Shipping price for a parcel weight in KILOGRAMS to a zone. */
export function rateFor(weightKg, zone) {
  const band = BANDS.find((b) => weightKg <= b.upToKg);
  return roundMoney(band.base * zoneMultiplier(zone));
}
