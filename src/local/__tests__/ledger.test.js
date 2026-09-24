import { describe, expect, it } from 'vitest';
import {
  emptyStore,
  transact,
  report,
  customerBalance,
  supplierBalance,
  cashLedger,
  validateStore,
  whatsappLink,
} from '../ledger';
import { createRepository, STORAGE_KEY } from '../storage';
const product = {
  name: 'Ciment',
  category: 'Quincaillerie',
  retail: 6500,
  wholesale: 6000,
  cost: 4000,
  stock: 10,
  minStock: 3,
  unit: 'sac',
};
const contact = (kind, name) => ({ kind, name, phone: '+22890123456', openingDebt: 0 });
const base = () => transact(emptyStore(), 'product.save', product, 'p1');
const sale = (patch = {}) => ({
  lines: [{ productId: 'p1', quantity: 2 }],
  method: 'Espèces',
  date: '2026-09-22',
  paid: '',
  ...patch,
});
function memory() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
}
describe('Autonomous commerce ledger', () => {
  it('applies a cash sale once to stock, cash and historical margin', () => {
    const initial = base();
    const d = transact(initial, 'sale', sale(), 's1');
    expect(initial.products[0].stock).toBe(10);
    expect(d.products[0].stock).toBe(8);
    expect(report(d).revenue).toBe(1300000);
    expect(report(d).gross).toBe(500000);
    expect(report(d).balances[0].value).toBe(1300000);
    const changed = transact(d, 'product.save', { ...product, id: 'p1', cost: 9000, stock: 8 });
    expect(report(changed).gross).toBe(500000);
  });
  it('uses wholesale price and preserves fractional quantities', () => {
    const d = transact(
      base(),
      'sale',
      sale({ lines: [{ productId: 'p1', quantity: 0.125 }], priceMode: 'wholesale' })
    );
    expect(d.products[0].stock).toBe(9.875);
    expect(d.sales[0].total).toBe(75000);
  });
  it('rejects overselling or duplicate product lines without touching any original stock', () => {
    let d = transact(base(), 'product.save', { ...product, name: 'Vis', stock: 1 }, 'p2');
    const original = JSON.stringify(d);
    expect(() =>
      transact(
        d,
        'sale',
        sale({
          lines: [
            { productId: 'p1', quantity: 1 },
            { productId: 'p2', quantity: 2 },
          ],
        })
      )
    ).toThrow(/Stock insuffisant/);
    expect(() =>
      transact(
        d,
        'sale',
        sale({
          lines: [
            { productId: 'p1', quantity: 1 },
            { productId: 'p1', quantity: 1 },
          ],
        })
      )
    ).toThrow(/Regroupez/);
    expect(JSON.stringify(d)).toBe(original);
  });
  it('requires a customer for credit and caps initial payment', () => {
    expect(() => transact(base(), 'sale', sale({ paid: 0 }))).toThrow(/client/);
    expect(() => transact(base(), 'sale', sale({ paid: 15000 }))).toThrow(/dépasser/);
  });
  it('tracks credit, partial and total repayments without counting revenue twice', () => {
    let d = transact(base(), 'contact.save', contact('customer', 'Ama'), 'c1');
    d = transact(d, 'sale', sale({ contactId: 'c1', paid: 3000 }), 's1');
    expect(customerBalance(d, 'c1')).toBe(1000000);
    d = transact(
      d,
      'payment',
      {
        kind: 'customer',
        contactId: 'c1',
        amount: 4000,
        reason: 'Versement partiel',
        method: 'Mobile Money',
        date: '2026-09-23',
      },
      'r1'
    );
    expect(customerBalance(d, 'c1')).toBe(600000);
    expect(report(d).revenue).toBe(1300000);
    expect(report(d).incoming).toBe(700000);
    expect(() =>
      transact(d, 'payment', {
        kind: 'customer',
        contactId: 'c1',
        amount: 6001,
        reason: 'Solde',
        method: 'Espèces',
      })
    ).toThrow(/solde/);
    d = transact(
      d,
      'payment',
      { kind: 'customer', contactId: 'c1', amount: 6000, reason: 'Solde', method: 'Espèces' },
      'r2'
    );
    expect(customerBalance(d, 'c1')).toBe(0);
    expect(cashLedger(d)).toHaveLength(3);
  });
  it('records supplier credit, weighted inventory cost and settlement', () => {
    let d = transact(base(), 'contact.save', contact('supplier', 'Bâtir Plus'), 'f1');
    d = transact(
      d,
      'purchase',
      {
        ...sale(),
        contactId: 'f1',
        lines: [{ productId: 'p1', quantity: 10, price: 6000 }],
        paid: 10000,
      },
      'a1'
    );
    expect(d.products[0].stock).toBe(20);
    expect(d.products[0].cost).toBe(500000);
    expect(supplierBalance(d, 'f1')).toBe(5000000);
    d = transact(
      d,
      'payment',
      {
        kind: 'supplier',
        contactId: 'f1',
        amount: 20000,
        reason: 'Acompte',
        method: 'Mobile Money',
      },
      'r1'
    );
    expect(supplierBalance(d, 'f1')).toBe(3000000);
    expect(report(d).outgoing).toBe(3000000);
    expect(report(d).net).toBe(0);
  });
  it('subtracts operating expenses once and not inventory acquisitions', () => {
    let d = transact(base(), 'sale', sale());
    d = transact(d, 'expense', {
      amount: 1000,
      category: 'Loyer de boutique',
      reason: 'Loyer',
      method: 'Espèces',
      date: '2026-09-22',
    });
    d = transact(d, 'expense', {
      amount: 2000,
      category: 'Achat de stock',
      reason: 'Stock',
      method: 'Espèces',
      date: '2026-09-22',
    });
    expect(report(d).gross).toBe(500000);
    expect(report(d).net).toBe(400000);
    expect(report(d).outgoing).toBe(300000);
    expect(report(d, '2026-09-23', '2026-09-23').revenue).toBe(0);
    expect(report(d, '2026-09-22', '2026-09-22').salesCount).toBe(1);
  });
  it('keeps opening debts and balances out of sales and profit', () => {
    let d = transact(
      base(),
      'contact.save',
      { ...contact('customer', 'Ama'), openingDebt: 5000 },
      'c1'
    );
    d = transact(d, 'shop', {
      name: 'Boutique',
      currency: 'FCFA',
      openingCash: 20000,
      openingMobile: 10000,
    });
    expect(customerBalance(d, 'c1')).toBe(500000);
    expect(report(d).revenue).toBe(0);
    expect(report(d).balances.map((b) => b.value)).toEqual([2000000, 1000000, 0, 0]);
  });
  it('archives products without deleting historical receipts and protects outstanding debts', () => {
    let d = transact(base(), 'sale', sale());
    d = transact(d, 'archive', { collection: 'products', id: 'p1' });
    expect(d.sales[0].items[0].name).toBe('Ciment');
    expect(d.products[0].archived).toBe(true);
    expect(() => transact(d, 'sale', sale())).toThrow(/supprimée/);
    d = transact(d, 'contact.save', { ...contact('supplier', 'Grossiste'), openingDebt: 10 }, 'f1');
    expect(() => transact(d, 'archive', { collection: 'suppliers', id: 'f1' })).toThrow(/Soldez/);
  });
  it('rejects corrupted totals, invalid references, unsafe receipts and negative stock', () => {
    const d = transact(base(), 'sale', sale());
    const bad = structuredClone(d);
    bad.sales[0].total++;
    bad.sales[0].paid++;
    expect(() => validateStore(bad)).toThrow(/Totaux/);
    const ref = structuredClone(d);
    ref.sales[0].items[0].productId = 'missing';
    expect(() => validateStore(ref)).toThrow(/Ligne/);
    expect(() => transact(d, 'product.save', { ...product, stock: -1 })).toThrow();
    expect(() =>
      transact(d, 'expense', {
        amount: 10,
        category: 'Divers',
        reason: 'Test',
        method: 'Espèces',
        receipt: 'data:image/svg+xml;base64,abc',
      })
    ).toThrow(/justificatif/);
  });
  it('builds a WhatsApp draft without sending it', () => {
    const url = whatsappLink('+228 90 12 34 56', 'Bonjour, solde 5 000 FCFA');
    expect(url).toBe('https://wa.me/22890123456?text=Bonjour%2C%20solde%205%20000%20FCFA');
    expect(() => whatsappLink('12', 'Test')).toThrow(/indicatif/);
  });
});
describe('Atomic persistent local storage', () => {
  it('persists a real transaction and reloads it from another repository', () => {
    const storage = memory(),
      repo = createRepository(storage);
    repo.apply('product.save', product, 0);
    expect(createRepository(storage).read().products[0].name).toBe('Ciment');
  });
  it('rejects stale forms from another tab instead of overwriting newer edits', () => {
    const storage = memory(),
      repo = createRepository(storage);
    repo.apply('product.save', product, 0);
    expect(() => repo.apply('product.save', { ...product, name: 'Stale' }, 0)).toThrow(
      /autre onglet/
    );
    expect(repo.read().products).toHaveLength(1);
  });
  it('preserves the old store if the browser quota refuses a write', () => {
    const storage = memory(),
      repo = createRepository(storage);
    const before = repo.apply('product.save', product);
    storage.setItem = () => {
      throw Error('QuotaExceededError');
    };
    expect(() =>
      repo.apply('sale', sale({ lines: [{ productId: before.products[0].id, quantity: 1 }] }))
    ).toThrow(/Aucune opération/);
    expect(repo.read()).toEqual(before);
  });
  it('never silently resets corrupt data and allows explicit validated repair', () => {
    const storage = memory();
    storage.setItem(STORAGE_KEY, 'broken-json');
    const repo = createRepository(storage);
    expect(() => repo.read()).toThrow(/conservée/);
    expect(repo.raw()).toBe('broken-json');
    repo.restore(JSON.stringify(base()));
    expect(repo.read().products).toHaveLength(1);
  });
  it('rejects invalid imports without replacing existing data and increments revision on restore', () => {
    const storage = memory(),
      repo = createRepository(storage);
    repo.restore(JSON.stringify(base()));
    const before = repo.raw();
    expect(() => repo.restore('{"version":9}')).toThrow();
    expect(repo.raw()).toBe(before);
    const restored = repo.restore(JSON.stringify(emptyStore()), repo.read().revision);
    expect(restored.revision).toBe(3);
  });
});
