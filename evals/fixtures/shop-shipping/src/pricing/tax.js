const VAT_RATES = { FI: 0.255, SE: 0.25, DE: 0.19, EE: 0.22 };
const DEFAULT_VAT = 0.24;

export function vatRateFor(country) {
  return VAT_RATES[country] ?? DEFAULT_VAT;
}
