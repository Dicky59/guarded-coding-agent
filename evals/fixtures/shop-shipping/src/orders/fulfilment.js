import { quoteShipping, zoneFor } from "../shipping/index.js";

/** Shipping cost for a cart, based on where the customer lives. */
export function shippingFor(cart, user) {
  const zone = zoneFor(user.address.country);
  return quoteShipping(cart.items, zone);
}
