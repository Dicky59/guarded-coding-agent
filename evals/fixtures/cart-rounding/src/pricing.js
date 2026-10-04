import { toCents } from "./money.js";

export function lineTotal(item) {
  return toCents(item.price) * item.qty;
}

export function applyDiscount(cents, percent) {
  return Math.round((cents * (100 - percent)) / 100);
}
