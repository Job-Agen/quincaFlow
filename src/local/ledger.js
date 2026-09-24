// Pure local commerce ledger. Money is stored in integer cents, never floats.
export const VERSION = 1;
export const CATEGORIES = [
  'Quincaillerie',
  'Alimentaire',
  'Boissons',
  'Hygiène & Entretien',
  'Électronique',
  'Textiles & Wax',
  'Fournitures',
  'Cosmétiques',
  'Divers',
];
export const EXPENSES = [
  'Loyer de boutique',
  'Énergie & eau',
  'Salaires',
  'Achat de stock',
  'Transport tricycle / taxi-bagages',
  'Divers',
];
export const METHODS = ['Espèces', 'Mobile Money', 'Virement / banque', 'Autre'];
export const COLLECTIONS = [
  'products',
  'customers',
  'suppliers',
  'sales',
  'purchases',
  'customerPayments',
  'supplierPayments',
  'expenses',
];
export function today() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}
export function emptyStore() {
  return {
    version: VERSION,
    revision: 0,
    dailyClosures: [],
    shop: { name: 'MaQuincaillerie', currency: 'FCFA', openingCash: 0, openingMobile: 0 },
    ...Object.fromEntries(COLLECTIONS.map((key) => [key, []])),
  };
}
export function money(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 1e10 || String(value).trim() === '')
    throw Error('Indiquez un montant positif ou nul valide.');
  return Math.round(n * 100);
}
const cents = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 1e12;
const qty = (n) =>
  typeof n === 'number' &&
  Number.isFinite(n) &&
  n >= 0 &&
  n <= 1e9 &&
  Math.abs(n * 1000 - Math.round(n * 1000)) < 0.001;
const roundQty = (n) => Math.round(n * 1000) / 1000;
const sum = (rows, fn) => rows.reduce((total, row) => total + fn(row), 0);
const requireValue = (ok, message) => {
  if (!ok) throw Error(message);
};
const text = (v, label, required = true) => {
  const s = String(v ?? '').trim();
  requireValue((!required || s.length > 0) && s.length <= 300, label + ' invalide.');
  return s;
};
const dateOK = (v) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const find = (data, collection, id) => {
  const row = data[collection].find((item) => item.id === id && !item.archived);
  requireValue(row, 'Fiche introuvable ou supprimée.');
  return row;
};
const receiptOK = (v) =>
  typeof v === 'string' &&
  (v === '' ||
    (v.length < 600000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)));
export function customerBalance(data, id) {
  const contact = data.customers.find((row) => row.id === id);
  return (
    (contact?.openingDebt || 0) +
    sum(
      data.sales.filter((row) => row.customerId === id),
      (row) => row.total - row.paid
    ) -
    sum(
      data.customerPayments.filter((row) => row.contactId === id),
      (row) => row.amount
    )
  );
}
export function supplierBalance(data, id) {
  const contact = data.suppliers.find((row) => row.id === id);
  return (
    (contact?.openingDebt || 0) +
    sum(
      data.purchases.filter((row) => row.supplierId === id),
      (row) => row.total - row.paid
    ) -
    sum(
      data.supplierPayments.filter((row) => row.contactId === id),
      (row) => row.amount
    )
  );
}
export function validateStore(data) {
  requireValue(
    data && data.version === VERSION && Number.isSafeInteger(data.revision) && data.revision >= 0,
    'Sauvegarde incompatible.'
  );
  requireValue(
    data.shop &&
      typeof data.shop.name === 'string' &&
      data.shop.name.trim().length > 0 &&
      data.shop.name.length <= 160 &&
      ['FCFA', 'XOF', 'XAF'].includes(data.shop.currency) &&
      cents(data.shop.openingCash) &&
      cents(data.shop.openingMobile),
    'Boutique invalide.'
  );
  const ids = new Set();
  for (const key of COLLECTIONS) {
    requireValue(
      Array.isArray(data[key]) && data[key].length <= 100000,
      'Collection invalide : ' + key
    );
    for (const row of data[key]) {
      requireValue(
        row &&
          typeof row.id === 'string' &&
          row.id.length < 100 &&
          row.id.length > 0 &&
          !ids.has(row.id),
        'Identifiant invalide ou dupliqué.'
      );
      ids.add(row.id);
    }
  }
  for (const p of data.products)
    requireValue(
      typeof p.name === 'string' &&
        p.name.trim() &&
        p.name.length <= 300 &&
        typeof p.unit === 'string' &&
        p.unit.length <= 30 &&
        CATEGORIES.includes(p.category) &&
        [p.retail, p.wholesale, p.cost].every(cents) &&
        qty(p.stock) &&
        qty(p.minStock) &&
        typeof p.archived === 'boolean',
      'Produit invalide.'
    );
  for (const key of ['customers', 'suppliers'])
    for (const c of data[key])
      requireValue(
        typeof c.name === 'string' &&
          c.name.trim() &&
          c.name.length <= 300 &&
          typeof c.phone === 'string' &&
          c.phone.length <= 40 &&
          typeof c.contact === 'string' &&
          c.contact.length <= 300 &&
          typeof c.sector === 'string' &&
          c.sector.length <= 300 &&
          cents(c.openingDebt) &&
          typeof c.archived === 'boolean',
        'Contact invalide.'
      );
  for (const key of ['sales', 'purchases'])
    for (const sale of data[key]) {
      requireValue(
        dateOK(sale.date) &&
          METHODS.includes(sale.method) &&
          Number.isInteger(sale.number) &&
          sale.number > 0 &&
          [sale.total, sale.cost, sale.paid].every(cents) &&
          sale.paid <= sale.total &&
          Array.isArray(sale.items) &&
          sale.items.length > 0,
        'Opération invalide.'
      );
      const contactId = key === 'sales' ? sale.customerId : sale.supplierId;
      requireValue(
        !contactId ||
          data[key === 'sales' ? 'customers' : 'suppliers'].some((c) => c.id === contactId),
        'Contact manquant dans la sauvegarde.'
      );
      requireValue(
        sale.paid === sale.total || contactId,
        'Une dette doit être rattachée à un contact.'
      );
      for (const item of sale.items)
        requireValue(
          data.products.some((p) => p.id === item.productId) &&
            typeof item.name === 'string' &&
            item.name.length <= 300 &&
            qty(item.quantity) &&
            item.quantity > 0 &&
            [item.price, item.unitCost, item.total, item.cost].every(cents) &&
            item.total === Math.round(item.quantity * item.price) &&
            item.cost === Math.round(item.quantity * item.unitCost),
          'Ligne de vente ou achat invalide.'
        );
      requireValue(
        cents(sale.discount || 0) &&
          sale.total === sum(sale.items, (row) => row.total) - (sale.discount || 0) &&
          sale.cost === sum(sale.items, (row) => row.cost),
        'Totaux incohérents.'
      );
    }
  for (const key of ['customerPayments', 'supplierPayments'])
    for (const payment of data[key])
      requireValue(
        data[key === 'customerPayments' ? 'customers' : 'suppliers'].some(
          (c) => c.id === payment.contactId
        ) &&
          cents(payment.amount) &&
          payment.amount > 0 &&
          dateOK(payment.date) &&
          METHODS.includes(payment.method) &&
          typeof payment.reason === 'string' &&
          payment.reason.trim() &&
          payment.reason.length <= 300,
        'Remboursement invalide.'
      );
  for (const e of data.expenses)
    requireValue(
      cents(e.amount) &&
        e.amount > 0 &&
        dateOK(e.date) &&
        METHODS.includes(e.method) &&
        EXPENSES.includes(e.category) &&
        typeof e.reason === 'string' &&
        e.reason.trim() &&
        e.reason.length <= 300 &&
        receiptOK(e.receipt),
      'Dépense ou justificatif invalide.'
    );
  validateClosures(data);
  for (const c of data.customers)
    requireValue(customerBalance(data, c.id) >= 0, 'Remboursement client supérieur à la dette.');
  for (const c of data.suppliers)
    requireValue(supplierBalance(data, c.id) >= 0, 'Paiement fournisseur supérieur à la dette.');
  return data;
}

export function transact(source, action, input, id = globalThis.crypto.randomUUID()) {
  validateStore(source);
  const data = JSON.parse(JSON.stringify(source));
  const stamp = { id, date: input.date || today() };
  if (action === 'product.save') {
    const current = input.id ? find(data, 'products', input.id) : null;
    const product = {
      id: current?.id || id,
      archived: false,
      name: text(input.name, 'Nom'),
      category: input.category,
      unit: text(input.unit || 'pièce', 'Unité'),
      retail: money(input.retail),
      wholesale: money(input.wholesale),
      cost: money(input.cost),
      stock: Number(input.stock),
      minStock: Number(input.minStock),
    };
    requireValue(
      qty(product.stock) && qty(product.minStock),
      'Stock et seuil : quantités positives, 3 décimales maximum.'
    );
    if (current) Object.assign(current, product);
    else data.products.push(product);
  } else if (action === 'contact.save') {
    const collection = input.kind === 'customer' ? 'customers' : 'suppliers';
    const current = input.id ? find(data, collection, input.id) : null;
    const contact = {
      id: current?.id || id,
      archived: false,
      name: text(input.name, 'Nom'),
      phone: text(input.phone, 'Téléphone', false),
      contact: text(input.contact, 'Contact', false),
      sector: text(input.sector, 'Secteur', false),
      openingDebt: current ? current.openingDebt : money(input.openingDebt || 0),
    };
    if (current) Object.assign(current, contact);
    else data[collection].push(contact);
  } else if (action === 'archive') {
    requireValue(
      ['products', 'customers', 'suppliers'].includes(input.collection),
      'Suppression interdite.'
    );
    const row = find(data, input.collection, input.id);
    if (input.collection === 'customers')
      requireValue(
        customerBalance(data, row.id) === 0,
        'Remboursez ou conservez la dette avant de supprimer ce client.'
      );
    if (input.collection === 'suppliers')
      requireValue(
        supplierBalance(data, row.id) === 0,
        'Soldez la dette avant de supprimer ce fournisseur.'
      );
    row.archived = true;
  } else if (action === 'sale' || action === 'purchase') {
    const purchase = action === 'purchase';
    requireValue(
      Array.isArray(input.lines) && input.lines.length > 0,
      'Ajoutez au moins un produit.'
    );
    const used = new Set();
    const items = input.lines.map((line) => {
      requireValue(
        !used.has(line.productId),
        'Regroupez les quantités du même produit sur une seule ligne.'
      );
      used.add(line.productId);
      const product = find(data, 'products', line.productId);
      const quantity = Number(line.quantity);
      requireValue(qty(quantity) && quantity > 0, 'Quantité invalide.');
      if (!purchase) requireValue(product.stock >= quantity, 'Stock insuffisant : ' + product.name);
      const price = purchase
        ? money(line.price)
        : input.priceMode === 'wholesale'
          ? product.wholesale
          : product.retail;
      const unitCost = purchase ? price : product.cost;
      const item = {
        productId: product.id,
        name: product.name,
        quantity,
        price,
        unitCost,
        total: Math.round(price * quantity),
        cost: Math.round(unitCost * quantity),
      };
      if (purchase) {
        product.cost = Math.round(
          (product.stock * product.cost + quantity * price) / (product.stock + quantity)
        );
        product.stock = roundQty(product.stock + quantity);
      } else product.stock = roundQty(product.stock - quantity);
      return item;
    });
    const total = sum(items, (row) => row.total);
    const paid = input.paid === '' || input.paid === undefined ? total : money(input.paid);
    requireValue(paid <= total, 'Le paiement ne peut pas dépasser le total.');
    const contactId = input.contactId || '';
    if (contactId) find(data, purchase ? 'suppliers' : 'customers', contactId);
    requireValue(
      paid === total || contactId,
      'Choisissez un ' + (purchase ? 'fournisseur' : 'client') + ' pour enregistrer une dette.'
    );
    const collection = purchase ? 'purchases' : 'sales';
    const number = Math.max(0, ...data[collection].map((row) => row.number)) + 1;
    data[collection].push({
      ...stamp,
      number,
      items,
      total,
      cost: sum(items, (row) => row.cost),
      paid,
      method: input.method,
      [purchase ? 'supplierId' : 'customerId']: contactId,
    });
  } else if (action === 'payment') {
    const customer = input.kind === 'customer';
    const collection = customer ? 'customers' : 'suppliers';
    find(data, collection, input.contactId);
    const amount = money(input.amount);
    const balance = customer
      ? customerBalance(data, input.contactId)
      : supplierBalance(data, input.contactId);
    requireValue(
      amount > 0 && amount <= balance,
      'Le remboursement doit être positif et ne pas dépasser le solde dû.'
    );
    data[customer ? 'customerPayments' : 'supplierPayments'].push({
      ...stamp,
      contactId: input.contactId,
      amount,
      reason: text(input.reason, 'Motif'),
      method: input.method,
    });
  } else if (action === 'expense') {
    const amount = money(input.amount);
    requireValue(amount > 0, 'La dépense doit être supérieure à zéro.');
    data.expenses.push({
      ...stamp,
      amount,
      category: input.category,
      reason: text(input.reason, 'Motif'),
      method: input.method,
      receipt: input.receipt || '',
    });
  } else if (action === 'day.close') {
    closeDay(data, input, stamp);
  } else if (action === 'shop') {
    data.shop = {
      ...data.shop,
      name: text(input.name, 'Nom de boutique'),
      currency: input.currency,
      openingCash: money(input.openingCash),
      openingMobile: money(input.openingMobile),
    };
  } else throw Error('Opération inconnue.');
  data.revision++;
  return validateStore(data);
}

export function cashLedger(data) {
  const entries = [];
  for (const sale of data.sales)
    if (sale.paid > 0)
      entries.push({
        id: sale.id,
        date: sale.date,
        direction: 1,
        amount: sale.paid,
        method: sale.method,
        label: 'Vente n° ' + sale.number,
        kind: 'Vente',
      });
  for (const p of data.customerPayments)
    entries.push({
      id: p.id,
      date: p.date,
      direction: 1,
      amount: p.amount,
      method: p.method,
      label: 'Remboursement · ' + data.customers.find((c) => c.id === p.contactId)?.name,
      kind: 'Remboursement client',
    });
  for (const p of data.purchases)
    if (p.paid > 0)
      entries.push({
        id: p.id,
        date: p.date,
        direction: -1,
        amount: p.paid,
        method: p.method,
        label: 'Achat n° ' + p.number,
        kind: 'Achat de stock',
      });
  for (const p of data.supplierPayments)
    entries.push({
      id: p.id,
      date: p.date,
      direction: -1,
      amount: p.amount,
      method: p.method,
      label: 'Paiement · ' + data.suppliers.find((c) => c.id === p.contactId)?.name,
      kind: 'Paiement fournisseur',
    });
  for (const e of data.expenses)
    entries.push({
      id: e.id,
      date: e.date,
      direction: -1,
      amount: e.amount,
      method: e.method,
      label: e.reason,
      kind: e.category,
      receipt: e.receipt,
    });
  for (const c of data.dailyClosures || []) {
    if (c.withdrawal)
      entries.push({
        id: c.id + ':withdrawal',
        closureId: c.id,
        date: c.date,
        direction: -1,
        amount: c.withdrawal,
        method: c.method,
        label: c.withdrawalReason,
        kind: 'Retrait de clôture',
      });
    if (c.adjustment)
      entries.push({
        id: c.id + ':adjustment',
        closureId: c.id,
        date: c.date,
        direction: Math.sign(c.adjustment),
        amount: Math.abs(c.adjustment),
        method: c.method,
        label: c.adjustmentReason,
        kind: 'Écart de clôture',
      });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}
export function report(data, from = '', to = '') {
  const within = (row) => (!from || row.date >= from) && (!to || row.date <= to);
  const sales = data.sales.filter(within),
    expenses = data.expenses.filter(within);
  const revenue = sum(sales, (row) => row.total),
    cost = sum(sales, (row) => row.cost);
  const operating = sum(
    expenses.filter((row) => row.category !== 'Achat de stock'),
    (row) => row.amount
  );
  const profitability = new Map();
  for (const sale of sales) {
    let allocated = 0;
    for (const [index, item] of sale.items.entries()) {
      const row = profitability.get(item.productId) || {
        id: item.productId,
        name: item.name,
        quantity: 0,
        revenue: 0,
        cost: 0,
      };
      row.quantity = roundQty(row.quantity + item.quantity * (item.unitFactor || 1));
      const discount =
        index === sale.items.length - 1
          ? (sale.discount || 0) - allocated
          : Math.round(
              ((sale.discount || 0) * item.total) / (sale.total + (sale.discount || 0) || 1)
            );
      allocated += discount;
      row.revenue += item.total - discount;
      row.cost += item.cost;
      profitability.set(item.productId, row);
    }
  }
  const days = new Map();
  for (const sale of sales) days.set(sale.date, (days.get(sale.date) || 0) + sale.total);
  const ledger = cashLedger(data),
    periodLedger = ledger.filter(within);
  const opening = (method) =>
    method === 'Espèces'
      ? data.shop.openingCash
      : method === 'Mobile Money'
        ? data.shop.openingMobile
        : 0;
  return {
    revenue,
    cost,
    gross: revenue - cost,
    operating,
    net: revenue - cost - operating,
    salesCount: sales.length,
    expenses: EXPENSES.map((name) => ({
      name,
      value: sum(
        expenses.filter((e) => e.category === name),
        (e) => e.amount
      ),
    })).filter((row) => row.value > 0),
    products: [...profitability.values()].sort((a, b) => b.revenue - b.cost - (a.revenue - a.cost)),
    days: [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => ({ name, value })),
    debtors: data.customers
      .map((c) => ({ id: c.id, name: c.name, value: customerBalance(data, c.id) }))
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value),
    supplierDebt: sum(data.suppliers, (c) => supplierBalance(data, c.id)),
    incoming: sum(
      periodLedger.filter((e) => e.direction === 1),
      (e) => e.amount
    ),
    outgoing: sum(
      periodLedger.filter((e) => e.direction === -1),
      (e) => e.amount
    ),
    balances: METHODS.map((name) => ({
      name,
      value:
        opening(name) +
        sum(
          ledger.filter((e) => e.method === name),
          (e) => e.amount * e.direction
        ),
    })),
  };
}
export function whatsappLink(phone, message) {
  const digits = String(phone)
    .replace(/[^0-9]/g, '')
    .replace(/^00/, '');
  if (digits.length < 8 || digits.length > 15)
    throw Error('Saisissez le téléphone avec son indicatif pays (ex. +228…).');
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message);
}

// A closure is an immutable snapshot. Late entries remain visible without rewriting history.
export function daySummary(data, date) {
  const sales = structuredClone(data.sales.filter((s) => s.date === date)).sort((a, b) =>
    a.id.localeCompare(b.id)
  );
  const entries = cashLedger(data)
    .filter((e) => e.date === date && !e.closureId)
    .map(({ receipt, ...e }) => e)
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    sales,
    entries,
    totalSales: sum(sales, (s) => s.total),
    collectedSales: sum(sales, (s) => s.paid),
    incoming: sum(
      entries.filter((e) => e.direction === 1),
      (e) => e.amount
    ),
    outgoing: sum(
      entries.filter((e) => e.direction === -1),
      (e) => e.amount
    ),
  };
}
const signedCents = (n) => Number.isSafeInteger(n) && Math.abs(n) <= 1e12;
function closeDay(data, input, stamp) {
  requireValue(
    dateOK(stamp.date) && stamp.date <= today(),
    'Choisissez une journée passée ou aujourd’hui.'
  );
  requireValue(
    !(data.dailyClosures || []).some((c) => c.date === stamp.date),
    'Cette journée est déjà clôturée.'
  );
  requireValue(/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time), 'Heure de clôture invalide.');
  const snapshot = daySummary(data, stamp.date);
  const withdrawal = money(input.withdrawal || 0);
  const raw = String(input.remaining ?? '').replace(',', '.');
  const remaining = Math.round(Number(raw) * 100);
  requireValue(raw.trim() && signedCents(remaining), 'Montant validé invalide.');
  const adjustment = remaining - (snapshot.incoming - snapshot.outgoing - withdrawal);
  requireValue(signedCents(adjustment), 'Écart invalide.');
  requireValue(METHODS.includes(input.method), 'Moyen de paiement invalide.');
  const closure = {
    ...stamp,
    time: input.time,
    snapshot,
    withdrawal,
    remaining,
    adjustment,
    method: input.method,
    withdrawalReason: text(input.withdrawalReason, 'Motif du retrait', withdrawal > 0),
    adjustmentReason: text(input.adjustmentReason, 'Motif de l’écart', adjustment !== 0),
    note: text(input.note, 'Note', false),
  };
  data.dailyClosures = [...(data.dailyClosures || []), closure];
}
function validateClosures(data) {
  requireValue(
    data.dailyClosures === undefined || Array.isArray(data.dailyClosures),
    'Historique des clôtures invalide.'
  );
  const dates = new Set(),
    ids = new Set();
  for (const c of data.dailyClosures || []) {
    requireValue(
      c &&
        typeof c.id === 'string' &&
        c.id.length > 0 &&
        c.id.length < 100 &&
        !ids.has(c.id) &&
        dateOK(c.date) &&
        !dates.has(c.date),
      'Clôture dupliquée ou invalide.'
    );
    dates.add(c.date);
    ids.add(c.id);
    requireValue(
      /^([01]\d|2[0-3]):[0-5]\d$/.test(c.time) &&
        METHODS.includes(c.method) &&
        cents(c.withdrawal) &&
        signedCents(c.remaining) &&
        signedCents(c.adjustment),
      'Montants de clôture invalides.'
    );
    for (const k of ['withdrawalReason', 'adjustmentReason', 'note'])
      requireValue(typeof c[k] === 'string' && c[k].length <= 300, 'Note de clôture invalide.');
    requireValue(!c.withdrawal || c.withdrawalReason.trim(), 'Motif du retrait requis.');
    requireValue(!c.adjustment || c.adjustmentReason.trim(), 'Motif de l’écart requis.');
    const v = c.snapshot;
    requireValue(
      v &&
        Array.isArray(v.sales) &&
        Array.isArray(v.entries) &&
        [v.totalSales, v.collectedSales, v.incoming, v.outgoing].every(cents),
      'Récapitulatif invalide.'
    );
    for (const sale of v.sales) {
      requireValue(
        sale.date === c.date &&
          [sale.total, sale.paid].every(cents) &&
          sale.paid <= sale.total &&
          cents(sale.discount || 0) &&
          Array.isArray(sale.items) &&
          sale.items.length > 0,
        'Vente archivée invalide.'
      );
      for (const i of sale.items)
        requireValue(
          typeof i.name === 'string' &&
            qty(i.quantity) &&
            i.quantity > 0 &&
            cents(i.price) &&
            cents(i.total) &&
            i.total === Math.round(i.quantity * i.price),
          'Article archivé invalide.'
        );
      requireValue(
        sale.total === sum(sale.items, (i) => i.total) - (sale.discount || 0),
        'Total archivé invalide.'
      );
    }
    for (const e of v.entries)
      requireValue(
        e.date === c.date &&
          cents(e.amount) &&
          [1, -1].includes(e.direction) &&
          METHODS.includes(e.method),
        'Mouvement archivé invalide.'
      );
    requireValue(
      v.totalSales === sum(v.sales, (s) => s.total) &&
        v.collectedSales === sum(v.sales, (s) => s.paid) &&
        v.incoming ===
          sum(
            v.entries.filter((e) => e.direction === 1),
            (e) => e.amount
          ) &&
        v.outgoing ===
          sum(
            v.entries.filter((e) => e.direction === -1),
            (e) => e.amount
          ) &&
        c.remaining === v.incoming - v.outgoing - c.withdrawal + c.adjustment,
      'Totaux de clôture incohérents.'
    );
  }
}

// Ignore presentation-only fields added by SQL projection when replaying an offline queue.
export function closureFingerprint(snapshot) {
  return {
    sales: snapshot.sales.map((s) => ({
      id: s.id,
      date: s.date,
      total: s.total,
      paid: s.paid,
      method: s.method,
      discount: s.discount || 0,
      items: s.items.map((i) => ({
        productId: i.productId,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        total: i.total,
      })),
    })),
    entries: snapshot.entries.map((e) => ({
      id: e.id,
      amount: e.amount,
      direction: e.direction,
      method: e.method,
    })),
  };
}
