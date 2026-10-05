export function searchProducts(products, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return products.filter((p) => p.name.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase() === q));
}
