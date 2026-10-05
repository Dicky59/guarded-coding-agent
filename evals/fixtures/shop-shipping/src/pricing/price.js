import { roundMoney } from "../utils/units.js";
import { applyPercentDiscount, volumeDiscountPercent } from "./discounts.js";

export function priceLine(product, qty) {
  const gross = roundMoney(product.price * qty);
  return applyPercentDiscount(gross, volumeDiscountPercent(qty));
}
