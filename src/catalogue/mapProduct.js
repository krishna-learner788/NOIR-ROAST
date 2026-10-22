// Database row (public.products) -> the product shape the UI already uses (see src/data/products.js).
// Presentation hints that are not business data (feature card, aspect ratio) are derived here.
export function fromRow(row, index) {
  const first = index === 0
  return {
    id: row.id,
    name: row.name,
    origin: row.origin ?? '',
    level: row.roast_level ?? null,
    levelLabel: row.roast_label ?? '',
    notes: row.tasting_notes ?? [],
    description: row.description ?? '',
    pricePaise: row.price_paise,
    priceStatus: row.price_status,
    weight: `${row.weight_grams} g`,
    weightGrams: row.weight_grams,
    weightStatus: row.weight_status,
    // null = stock is not tracked (we make no availability claim); 0 = sold out
    stock: row.stock_quantity,
    img: row.image_src
      ? { src: row.image_src, width: row.image_width ?? 1400, height: row.image_height ?? 933, alt: row.image_alt ?? row.name }
      : null,
    ratio: first ? '5 / 4' : '3 / 2',
    feature: first,
    objectPosition: row.image_position ?? undefined,
  }
}

export const isSoldOut = (p) => p.stock !== null && p.stock !== undefined && p.stock <= 0
export const isLowStock = (p) => p.stock !== null && p.stock !== undefined && p.stock > 0 && p.stock <= 5
