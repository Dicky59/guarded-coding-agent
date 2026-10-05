const EU = new Set(["SE", "DE", "EE", "DK", "NL", "FR"]);

export function zoneFor(country) {
  if (country === "FI") return "domestic";
  return EU.has(country) ? "eu" : "world";
}

const MULTIPLIERS = { domestic: 1, eu: 1.6, world: 2.4 };

export function zoneMultiplier(zone) {
  const m = MULTIPLIERS[zone];
  if (m === undefined) throw new Error(`Unknown shipping zone ${zone}`);
  return m;
}
