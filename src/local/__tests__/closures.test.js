import { describe, it, expect } from 'vitest';
import { emptyStore, transact, daySummary, cashLedger, report, validateStore } from '../ledger';
import { expectedFor, assertAllowed } from '../syncProtocol';
const date = '2026-09-20';
function fixture() {
  let d = transact(
    emptyStore(),
    'product.save',
    {
      name: 'Ciment',
      category: 'Quincaillerie',
      retail: 6500,
      wholesale: 6000,
      cost: 4000,
      stock: 20,
      minStock: 3,
      unit: 'sac',
    },
    'p1'
  );
  d = transact(
    d,
    'contact.save',
    { kind: 'customer', name: 'Afi', phone: '', openingDebt: 0 },
    'c1'
  );
  d = transact(
    d,
    'sale',
    {
      date,
      lines: [{ productId: 'p1', quantity: 2 }],
      paid: 10000,
      contactId: 'c1',
      method: 'Espèces',
    },
    's1'
  );
  d = transact(
    d,
    'sale',
    { date: '2026-09-19', lines: [{ productId: 'p1', quantity: 1 }], paid: '', method: 'Espèces' },
    's2'
  );
  return transact(
    d,
    'expense',
    {
      date,
      amount: 1000,
      category: 'Transport tricycle / taxi-bagages',
      reason: 'Livraison',
      method: 'Espèces',
    },
    'e1'
  );
}
const close = {
  date,
  time: '17:00',
  withdrawal: 2000,
  withdrawalReason: 'Versement personnel',
  remaining: 7000,
  method: 'Espèces',
};
describe('Daily receipts and immutable closures', () => {
  it('separates revenue, credit, expenses and withdrawals without double counting', () => {
    const initial = fixture(),
      before = report(initial);
    const result = transact(initial, 'day.close', close, 'close1');
    const c = result.dailyClosures[0];
    expect(c.snapshot.sales.map((s) => s.id)).toEqual(['s1']);
    expect(c.snapshot.totalSales).toBe(1300000);
    expect(c.snapshot.collectedSales).toBe(1000000);
    expect(c.snapshot.outgoing).toBe(100000);
    expect(c.remaining).toBe(700000);
    expect(c.adjustment).toBe(0);
    expect(report(result).net).toBe(before.net);
    expect(cashLedger(result).filter((e) => e.closureId)).toHaveLength(1);
    expect(daySummary(result, date)).toEqual(c.snapshot);
    expect(result.expenses).toHaveLength(1);
  });
  it('requires a reason for adjustments and records the difference in cash only', () => {
    expect(() => transact(fixture(), 'day.close', { ...close, remaining: 6500 })).toThrow(
      /Motif de l’écart/
    );
    const d = transact(
      fixture(),
      'day.close',
      { ...close, remaining: 6500, adjustmentReason: 'Écart de comptage' },
      'close1'
    );
    expect(d.dailyClosures[0].adjustment).toBe(-50000);
    expect(cashLedger(d).find((e) => e.kind === 'Écart de clôture')).toMatchObject({
      direction: -1,
      amount: 50000,
    });
    expect(report(d).net).toBe(report(fixture()).net);
  });
  it('archives product names and prices and detects late movements', () => {
    let d = transact(fixture(), 'day.close', close, 'close1');
    const saved = structuredClone(d.dailyClosures[0]);
    d = transact(d, 'product.save', {
      ...d.products[0],
      retail: 7000,
      wholesale: 6500,
      cost: 4000,
    });
    d = transact(
      d,
      'expense',
      { date, amount: 100, category: 'Divers', method: 'Espèces', reason: 'Tardif' },
      'late'
    );
    expect(d.dailyClosures[0]).toEqual(saved);
    expect(d.dailyClosures[0].snapshot.sales[0].items[0].price).toBe(650000);
    expect(daySummary(d, date)).not.toEqual(saved.snapshot);
    expect(() => transact(d, 'day.close', close)).toThrow(/déjà clôturée/);
  });
  it('accepts old saved ledgers and empty days but rejects invalid time and forged totals', () => {
    const old = emptyStore();
    delete old.dailyClosures;
    expect(validateStore(old)).toBe(old);
    const d = transact(old, 'day.close', { ...close, withdrawal: 0, remaining: 0 }, 'empty');
    expect(d.dailyClosures[0].snapshot.sales).toEqual([]);
    expect(() => transact(old, 'day.close', { ...close, time: '25:00' })).toThrow(/Heure/);
    d.dailyClosures[0].remaining = 1;
    expect(() => validateStore(d)).toThrow(/incohérents/);
  });
  it('detects concurrent amounts but ignores SQL presentation fields and denies sellers', () => {
    const d = fixture(),
      expected = expectedFor(d, 'day.close', close);
    d.sales[0].reference = 'VE-0001';
    d.sales[0].discount = 0;
    d.sales[0].items[0].unit = 'sac';
    expect(expectedFor(d, 'day.close', close)).toEqual(expected);
    d.sales[0].paid -= 1;
    expect(expectedFor(d, 'day.close', close)).not.toEqual(expected);
    expect(() => assertAllowed('SELLER', 'day.close', close)).toThrow(/propriétaire/);
  });
});
