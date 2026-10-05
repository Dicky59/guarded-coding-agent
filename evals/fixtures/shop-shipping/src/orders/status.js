const TRANSITIONS = {
  placed: ["paid", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function transition(order, to) {
  if (!canTransition(order.status, to)) {
    throw new Error(`Cannot move order from ${order.status} to ${to}`);
  }
  return { ...order, status: to };
}
