import { roundMoney } from "../utils/units.js";
import { isoDay } from "../utils/dates.js";

export function salesByDay(orders) {
  const days = {};
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const day = isoDay(new Date(o.placedAt));
    days[day] = roundMoney((days[day] ?? 0) + o.total);
  }
  return days;
}

export function averageOrderValue(orders) {
  const live = orders.filter((o) => o.status !== "cancelled");
  if (live.length === 0) return 0;
  return roundMoney(live.reduce((sum, o) => sum + o.total, 0) / live.length);
}
