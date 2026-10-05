import { assertPositiveInt } from "../utils/validate.js";

export function createCart() {
  return { items: [] };
}

export function addItem(cart, product, qty) {
  assertPositiveInt(qty, "qty");
  const existing = cart.items.find((i) => i.product.id === product.id);
  const items = existing
    ? cart.items.map((i) => (i === existing ? { ...i, qty: i.qty + qty } : i))
    : [...cart.items, { product, qty }];
  return { items };
}

export function removeItem(cart, productId) {
  return { items: cart.items.filter((i) => i.product.id !== productId) };
}

export function itemCount(cart) {
  return cart.items.reduce((sum, i) => sum + i.qty, 0);
}
