import { describe, expect, it } from 'vitest';
import { projectDatabase } from '../../server/syncProjection';
import { report, customerBalance } from '../ledger';
const source = () => ({
  business: { name: 'Boutique existante', currency: 'FCFA' },
  products: [
    {
      id: 'p1',
      name: 'Vitre',
      base_unit: 'pièce',
      purchase_price: '318.75',
      selling_price: '450',
      stock_quantity: '40',
      low_stock_threshold: '5',
      archived: false,
    },
  ],
  customers: [{ id: 'c1', name: 'Ama', phone: '+22890123456' }],
  suppliers: [],
  sales: [
    {
      id: 's1',
      reference: 'VE-0001',
      created_at: '2026-09-23T12:00:00Z',
      customer_id: 'c1',
      payment_method: 'BANK',
      status: 'COMPLETED',
      total: '16000',
      amount_paid: '6000',
      cost_of_goods: '12750',
      discount: '1000',
    },
  ],
  items: [
    {
      id: 'i1',
      sale_id: 's1',
      product_id: 'p1',
      product_name: 'Vitre',
      quantity: '1',
      unit_factor: '40',
      unit_label: 'carton',
      unit_price: '17000',
      line_total: '17000',
      unit_cost: '12750',
    },
  ],
  orders: [
    {
      id: 'po1',
      reference: 'PO-0001',
      created_at: '2026-09-22T12:00:00Z',
      supplier_name: 'Bâtir',
      status: 'SENT',
      total_estimated: '8000',
    },
  ],
});
describe('Existing database projection', () => {
  it('preserves discounts, package quantities, cost, credit and bank payments', () => {
    const data = projectDatabase(source()),
      r = report(data);
    expect(r.revenue).toBe(1600000);
    expect(r.gross).toBe(325000);
    expect(r.products[0].revenue).toBe(1600000);
    expect(r.products[0].quantity).toBe(40);
    expect(customerBalance(data, 'c1')).toBe(1000000);
    expect(r.balances.find((b) => b.name === 'Virement / banque').value).toBe(600000);
    expect(data.legacyOrders).toHaveLength(1);
    expect(r.supplierDebt).toBe(0);
  });
  it('keeps new fields while refreshing old catalog changes', () => {
    const original = source(),
      saved = projectDatabase(original);
    saved.products[0].category = 'Fournitures';
    saved.products[0].wholesale = 40000;
    original.state = saved;
    original.products[0].stock_quantity = '30';
    original.products[0].name = 'Vitre renommée';
    const data = projectDatabase(original);
    expect(data.products[0]).toMatchObject({
      stock: 30,
      name: 'Vitre renommée',
      category: 'Fournitures',
      wholesale: 40000,
    });
    expect(data.sales[0].items[0].name).toBe('Vitre');
  });
  it('retains receipt lines when a historical product no longer exists', () => {
    const raw = source();
    raw.products = [];
    raw.items[0].product_id = null;
    const data = projectDatabase(raw);
    expect(data.products[0].archived).toBe(true);
    expect(report(data).revenue).toBe(1600000);
  });
  it('excludes cancelled sales and creates an explicit client for unnamed legacy credit', () => {
    const raw = source();
    raw.sales[0].customer_id = null;
    raw.sales[0].customer_name = 'Ancien client';
    let data = projectDatabase(raw);
    expect(data.customers.some((c) => c.name === 'Ancien client')).toBe(true);
    raw.sales[0].status = 'CANCELLED';
    data = projectDatabase(raw);
    expect(report(data).revenue).toBe(0);
  });
});
