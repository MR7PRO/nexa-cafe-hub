/**
 * Pure POS cart / money helpers.
 *
 * Display-only maths: the server (`process_sale`, `settle_session`) always
 * recomputes the authoritative amounts. Keeping these pure makes the cart and
 * payment rules testable without React or the network.
 */

export interface CartLine {
  id: string;
  name: string;
  price: number;
  qty: number;
  stock: number | null;
}

export interface PromotionLike {
  discount_type: string;
  discount_value: number;
}

export interface PaymentPartLike {
  method: 'cash' | 'card';
  amount: number;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Units of a product still addable, given what is already in the cart. */
export function availableStock(
  stockQty: number | null,
  cart: CartLine[],
  productId: string
): number | null {
  if (stockQty === null) return null;
  const inCart = cart.find((c) => c.id === productId)?.qty ?? 0;
  return stockQty - inCart;
}

export function isOutOfStock(stockQty: number | null): boolean {
  return stockQty !== null && stockQty <= 0;
}

export function cartSubtotal(cart: CartLine[]): number {
  return round2(cart.reduce((sum, item) => sum + item.price * item.qty, 0));
}

/** Never exceeds the subtotal and never goes negative. */
export function promotionDiscount(
  promotion: PromotionLike | null | undefined,
  subtotal: number
): number {
  if (!promotion) return 0;
  const raw =
    promotion.discount_type === 'percentage'
      ? (subtotal * Math.min(Math.max(promotion.discount_value, 0), 100)) / 100
      : Math.max(promotion.discount_value, 0);
  return Math.min(round2(raw), Math.max(subtotal, 0));
}

export function cartTotal(subtotal: number, discount: number): number {
  return Math.max(round2(subtotal - discount), 0);
}

/** Adds one unit, refusing to exceed stock. Returns null when not allowed. */
export function addLine(
  cart: CartLine[],
  product: { id: string; name: string; sell_price_ils: number; stock_qty: number | null }
): CartLine[] | null {
  if (isOutOfStock(product.stock_qty)) return null;
  const existing = cart.find((i) => i.id === product.id);
  if (!existing) {
    return [
      ...cart,
      {
        id: product.id,
        name: product.name,
        price: product.sell_price_ils,
        qty: 1,
        stock: product.stock_qty,
      },
    ];
  }
  if (product.stock_qty !== null && existing.qty >= product.stock_qty) return null;
  return cart.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
}

/**
 * Applies a quantity delta. Lines dropping to zero are removed; a delta that
 * would exceed stock is ignored (the line is kept untouched).
 */
export function changeQuantity(cart: CartLine[], id: string, delta: number): CartLine[] {
  return cart
    .map((item) => {
      if (item.id !== id) return item;
      const newQty = item.qty + delta;
      if (item.stock !== null && newQty > item.stock) return item;
      return { ...item, qty: newQty };
    })
    .filter((item) => item.qty > 0);
}

/** Mixed payments must sum exactly to the total (to the agora). */
export function isValidMixedPayment(parts: PaymentPartLike[], total: number): boolean {
  const positive = parts.filter((p) => p.amount > 0);
  if (positive.length === 0) return false;
  return round2(positive.reduce((s, p) => s + p.amount, 0)) === round2(total);
}
