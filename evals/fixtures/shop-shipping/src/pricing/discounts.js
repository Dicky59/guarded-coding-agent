import { roundMoney } from "../utils/units.js";

export function applyPercentDiscount(amount, percent) {
  if (percent < 0 || percent > 100) throw new RangeError("percent must be between 0 and 100");
  return roundMoney(amount * (1 - percent / 100));
}

/** Volume discount in percent: 5% from 10 units, 10% from 50. */
export function volumeDiscountPercent(qty) {
  if (qty >= 50) return 10;
  if (qty >= 10) return 5;
  return 0;
}
