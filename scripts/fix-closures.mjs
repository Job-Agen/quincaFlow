import fs from 'node:fs';

// Temporary repair script for PR #7.
const path = 'src/local/ledger.js';
let source = fs.readFileSync(path, 'utf8');
const start = source.indexOf('function validateClosures(data) {');
const end = source.indexOf('\nexport function closureFingerprint', start);
if (start < 0 || end < 0) throw new Error('validateClosures block not found');

const replacement = `function validateClosures(data) {
  requireValue(
    data.dailyClosures === undefined || Array.isArray(data.dailyClosures),
    'Historique des clôtures invalide.'
  );
  const dates = new Set(),
    ids = new Set();
  for (const c of data.dailyClosures || []) {
    requireValue(
      c && typeof c.id === 'string' && c.id.length > 0 && c.id.length < 100 &&
        !ids.has(c.id) && dateOK(c.date) && !dates.has(c.date),
      'Clôture dupliquée ou invalide.'
    );
    dates.add(c.date);
    ids.add(c.id);
    requireValue(
      /^([01]\\d|2[0-3]):[0-5]\\d$/.test(c.time) && METHODS.includes(c.method) &&
        cents(c.withdrawal) && signedCents(c.remaining) && signedCents(c.adjustment),
      'Montants de clôture invalides.'
    );
    for (const k of ['withdrawalReason', 'adjustmentReason', 'note'])
      requireValue(typeof c[k] === 'string' && c[k].length <= 300, 'Note de clôture invalide.');
    requireValue(!c.withdrawal || c.withdrawalReason.trim(), 'Motif du retrait requis.');
    requireValue(!c.adjustment || c.adjustmentReason.trim(), 'Motif de l’écart requis.');
    const v = c.snapshot;
    requireValue(
      v && Array.isArray(v.sales) && Array.isArray(v.entries) &&
        [v.totalSales, v.collectedSales, v.incoming, v.outgoing].every(cents),
      'Récapitulatif invalide.'
    );
    for (const sale of v.sales) {
      requireValue(
        sale.date === c.date && [sale.total, sale.paid].every(cents) && sale.paid <= sale.total &&
          cents(sale.discount || 0) && Array.isArray(sale.items) && sale.items.length > 0,
        'Vente archivée invalide.'
      );
      for (const i of sale.items)
        requireValue(
          typeof i.name === 'string' && qty(i.quantity) && i.quantity > 0 && cents(i.price) &&
            cents(i.total) && i.total === Math.round(i.quantity * i.price),
          'Article archivé invalide.'
        );
      requireValue(
        sale.total === sum(sale.items, (i) => i.total) - (sale.discount || 0),
        'Total archivé invalide.'
      );
    }
    for (const e of v.entries)
      requireValue(
        e.date === c.date && cents(e.amount) && [1, -1].includes(e.direction) && METHODS.includes(e.method),
        'Mouvement archivé invalide.'
      );
    requireValue(
      v.totalSales === sum(v.sales, (s) => s.total) &&
        v.collectedSales === sum(v.sales, (s) => s.paid) &&
        v.incoming === sum(v.entries.filter((e) => e.direction === 1), (e) => e.amount) &&
        v.outgoing === sum(v.entries.filter((e) => e.direction === -1), (e) => e.amount) &&
        c.remaining === v.incoming - v.outgoing - c.withdrawal + c.adjustment,
      'Totaux de clôture incohérents.'
    );
  }
}
`;

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(path, source);
