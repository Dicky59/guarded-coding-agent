import { fromCents } from "./money.js";
import { applyDiscount, lineTotal } from "./pricing.js";

export function cartTotal(items, discountPercent = 0) {
  const subtotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  return fromCents(applyDiscount(subtotal, discountPercent));
}
