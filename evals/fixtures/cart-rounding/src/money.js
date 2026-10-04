// Money helpers. All amounts inside the cart are integer cents.
export function toCents(amount) {
  return Math.floor(amount * 100);
}

export function fromCents(cents) {
  return cents / 100;
}
