export function createCatalog(products = []) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    get: (id) => byId.get(id) ?? null,
    all: () => [...byId.values()],
    add(product) {
      byId.set(product.id, product);
      return product;
    },
    adjustStock(id, delta) {
      const p = byId.get(id);
      if (!p) throw new Error(`Unknown product ${id}`);
      if (p.stock + delta < 0) throw new RangeError("insufficient stock");
      p.stock += delta;
      return p.stock;
    },
  };
}
