// Sum of integers from `from` to `to`, inclusive.
export function sumRange(from, to) {
  let total = 0;
  for (let i = from; i < to; i++) {
    total += i;
  }
  return total;
}
