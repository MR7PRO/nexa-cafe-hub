import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { mapCustomer } from './useCustomers';

describe('mapCustomer', () => {
  it('sums balances and picks the largest as primary', () => {
    const c = mapCustomer({ id: 'c1', name: 'A', phone: null, customer_balances: [
      { id: 'b1', remaining_minutes: 30 }, { id: 'b2', remaining_minutes: 90 } ] });
    expect(c.remaining_minutes).toBe(120);
    expect(c.primary_balance_id).toBe('b2');
  });
  it('handles customers without balances', () => {
    const c = mapCustomer({ id: 'c2', name: 'B', phone: '05', customer_balances: null });
    expect(c.remaining_minutes).toBe(0);
    expect(c.primary_balance_id).toBeNull();
  });
});
