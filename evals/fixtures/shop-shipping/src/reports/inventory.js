export function lowStock(products, threshold = 5) {
  return products.filter((p) => p.stock <= threshold).map((p) => p.id);
}

export function stockValue(products) {
  return Math.round(products.reduce((sum, p) => sum + p.price * p.stock, 0) * 100) / 100;
}
