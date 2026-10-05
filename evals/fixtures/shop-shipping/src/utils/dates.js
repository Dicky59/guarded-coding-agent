export function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
