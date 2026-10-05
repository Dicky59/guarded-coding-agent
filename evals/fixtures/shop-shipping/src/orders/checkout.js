import { priceLine, vatRateFor } from "../pricing/index.js";
import { newId } from "../utils/ids.js";
import { roundMoney } from "../utils/units.js";
import { shippingFor } from "./fulfilment.js";

export function placeOrder({ cart, user, now = new Date() }) {
  if (cart.items.length === 0) throw new Error("Cannot check out an empty cart");

  const lines = cart.items.map(({ product, qty }) => ({
    productId: product.id,
    qty,
    total: priceLine(product, qty),
  }));
  const subtotal = roundMoney(lines.reduce((sum, l) => sum + l.total, 0));
  const vat = roundMoney(subtotal * vatRateFor(user.address.country));
  const shipping = shippingFor(cart, user);

  return {
    id: newId("ord"),
    status: "placed",
    userId: user.id,
    lines,
    subtotal,
    vat,
    shipping,
    total: roundMoney(subtotal + vat + shipping),
    placedAt: now.toISOString(),
  };
}
