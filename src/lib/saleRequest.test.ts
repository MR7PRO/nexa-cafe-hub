import { beforeEach, describe, expect, it } from 'vitest';
import { createSaleRequest } from './saleRequest';

beforeEach(() => sessionStorage.clear());
describe('sale request identity', () => {
  it('reuses the request on a failed retry and after reload', () => {
    const payload = { product_id: 'p1', qty: 2, payments: [{ method: 'cash', amount: 20 }] };
    const request = createSaleRequest('pos');
    const id = request.get(payload);
    expect(request.get(payload)).toBe(id);
    expect(createSaleRequest('pos').get(payload)).toBe(id);
  });
  it('allows a new identical purchase after a confirmed success', () => {
    const request = createSaleRequest('package');
    const id = request.get({ package: 'p1' });
    request.complete();
    expect(request.get({ package: 'p1' })).not.toBe(id);
  });
  it('does not reuse a key for a changed purchase or another account', () => {
    const request = createSaleRequest('pos:user-a');
    const id = request.get({ qty: 1 });
    expect(request.get({ qty: 2 })).not.toBe(id);
    expect(createSaleRequest('pos:user-b').get({ qty: 1 })).not.toBe(id);
  });
});