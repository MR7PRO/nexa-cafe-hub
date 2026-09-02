import { describe, it, expect } from 'vitest';
import {
  addLine,
  availableStock,
  cartSubtotal,
  cartTotal,
  changeQuantity,
  isOutOfStock,
  isValidMixedPayment,
  promotionDiscount,
  type CartLine,
} from './pos';

const product = (over: Partial<{ id: string; name: string; sell_price_ils: number; stock_qty: number | null }> = {}) => ({
  id: 'p1',
  name: 'كولا',
  sell_price_ils: 5,
  stock_qty: 3,
  ...over,
});

describe('stock guards', () => {
  it('treats null stock as unlimited', () => {
    expect(isOutOfStock(null)).toBe(false);
    expect(availableStock(null, [], 'p1')).toBeNull();
  });

  it('flags zero and negative stock as out of stock', () => {
    expect(isOutOfStock(0)).toBe(true);
    expect(isOutOfStock(-2)).toBe(true);
  });

  it('subtracts cart quantity from available stock', () => {
    const cart: CartLine[] = [{ id: 'p1', name: 'كولا', price: 5, qty: 2, stock: 3 }];
    expect(availableStock(3, cart, 'p1')).toBe(1);
    expect(availableStock(3, cart, 'p2')).toBe(3);
  });
});

describe('addLine', () => {
  it('adds a new line with one unit', () => {
    const cart = addLine([], product());
    expect(cart).toEqual([{ id: 'p1', name: 'كولا', price: 5, qty: 1, stock: 3 }]);
  });

  it('increments an existing line', () => {
    const first = addLine([], product())!;
    expect(addLine(first, product())![0].qty).toBe(2);
  });

  it('refuses out-of-stock products', () => {
    expect(addLine([], product({ stock_qty: 0 }))).toBeNull();
  });

  it('refuses to exceed available stock', () => {
    const cart: CartLine[] = [{ id: 'p1', name: 'كولا', price: 5, qty: 3, stock: 3 }];
    expect(addLine(cart, product({ stock_qty: 3 }))).toBeNull();
  });

  it('allows unlimited quantities when stock is untracked', () => {
    const cart: CartLine[] = [{ id: 'p1', name: 'كولا', price: 5, qty: 99, stock: null }];
    expect(addLine(cart, product({ stock_qty: null }))![0].qty).toBe(100);
  });
});

describe('changeQuantity', () => {
  const cart: CartLine[] = [{ id: 'p1', name: 'كولا', price: 5, qty: 2, stock: 3 }];

  it('increments and decrements', () => {
    expect(changeQuantity(cart, 'p1', 1)[0].qty).toBe(3);
    expect(changeQuantity(cart, 'p1', -1)[0].qty).toBe(1);
  });

  it('removes the line when it reaches zero', () => {
    expect(changeQuantity(cart, 'p1', -2)).toHaveLength(0);
  });

  it('ignores a delta that exceeds stock', () => {
    expect(changeQuantity(cart, 'p1', 5)[0].qty).toBe(2);
  });
});

describe('money', () => {
  const cart: CartLine[] = [
    { id: 'p1', name: 'كولا', price: 5.5, qty: 2, stock: null },
    { id: 'p2', name: 'شيبس', price: 3.25, qty: 1, stock: null },
  ];

  it('sums the cart to two decimals', () => {
    expect(cartSubtotal(cart)).toBe(14.25);
  });

  it('computes percentage discounts', () => {
    expect(promotionDiscount({ discount_type: 'percentage', discount_value: 10 }, 100)).toBe(10);
  });

  it('clamps percentage values to 0-100', () => {
    expect(promotionDiscount({ discount_type: 'percentage', discount_value: 500 }, 100)).toBe(100);
    expect(promotionDiscount({ discount_type: 'percentage', discount_value: -20 }, 100)).toBe(0);
  });

  it('never discounts more than the subtotal', () => {
    expect(promotionDiscount({ discount_type: 'fixed', discount_value: 90 }, 40)).toBe(40);
  });

  it('returns zero discount without a promotion', () => {
    expect(promotionDiscount(null, 40)).toBe(0);
  });

  it('never produces a negative total', () => {
    expect(cartTotal(20, 50)).toBe(0);
    expect(cartTotal(20, 5)).toBe(15);
  });
});

describe('mixed payments', () => {
  it('accepts parts summing exactly to the total', () => {
    expect(
      isValidMixedPayment(
        [
          { method: 'cash', amount: 10 },
          { method: 'card', amount: 5.25 },
        ],
        15.25
      )
    ).toBe(true);
  });

  it('rejects under- and over-payment', () => {
    expect(isValidMixedPayment([{ method: 'cash', amount: 10 }], 15)).toBe(false);
    expect(isValidMixedPayment([{ method: 'cash', amount: 20 }], 15)).toBe(false);
  });

  it('rejects empty or zero-amount payments', () => {
    expect(isValidMixedPayment([], 0)).toBe(false);
    expect(isValidMixedPayment([{ method: 'cash', amount: 0 }], 0)).toBe(false);
  });
});
