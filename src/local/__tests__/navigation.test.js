import { describe, expect, it } from 'vitest';
import { ROUTES, pageFor, activeSection } from '../navigation';
describe('Unified commerce navigation', () => {
  it('keeps every main module addressable and groups closing under cash', () => {
    for (const [page, path] of Object.entries(ROUTES)) expect(pageFor(path)).toBe(page);
    expect(activeSection('receipts', '/cash/closing')).toBe('cash');
    expect(activeSection('customers', '/customers')).toBe('more');
  });
  it('preserves old bookmarks without offering a second application', () => {
    expect(pageFor('/local', '#stock')).toBe('stock');
    expect(pageFor('/local/', '#receipts')).toBe('receipts');
    expect(pageFor('/local', '#settings')).toBe('more');
    expect(pageFor('/local', '#unknown')).toBe('home');
  });
  it('keeps specialized workflows reachable in the same navigation', () => {
    expect(pageFor('/purchases/order-1')).toBe('detail');
    expect(activeSection('detail', '/sales/sale-1')).toBe('sales');
    expect(activeSection('detail', '/products/product-1')).toBe('stock');
    expect(activeSection('detail', '/team')).toBe('more');
  });
});
