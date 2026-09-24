import { emptyStore, validateStore } from '../local/ledger';
const cents = (v) => Math.round(Number(v || 0) * 100);
const date = (v) => new Date(v).toISOString().slice(0, 10);
const methods = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  BANK: 'Virement / banque',
  OTHER: 'Autre',
};
// Existing relational rows stay authoritative; JSON stores only the new fields and journals.
export function projectDatabase(source) {
  const saved = source.state || emptyStore(),
    data = structuredClone(saved);
  data.shop = { ...data.shop, name: source.business.name, currency: source.business.currency };
  data.products = source.products.map((p) => ({
    ...saved.products.find((x) => x.id === p.id),
    id: p.id,
    name: p.name,
    category: saved.products.find((x) => x.id === p.id)?.category || 'Quincaillerie',
    unit: p.base_unit,
    retail: cents(p.selling_price),
    wholesale: saved.products.find((x) => x.id === p.id)?.wholesale ?? cents(p.selling_price),
    cost: cents(p.purchase_price),
    stock: Number(p.stock_quantity),
    minStock: Number(p.low_stock_threshold),
    archived: p.archived,
  }));
  for (const key of ['customers', 'suppliers']) {
    data[key] = source[key].map((c) => ({
      ...saved[key].find((x) => x.id === c.id),
      id: c.id,
      name: c.name,
      phone: c.phone || '',
      contact: saved[key].find((x) => x.id === c.id)?.contact || '',
      sector: saved[key].find((x) => x.id === c.id)?.sector || '',
      openingDebt: saved[key].find((x) => x.id === c.id)?.openingDebt || 0,
      archived: saved[key].find((x) => x.id === c.id)?.archived || false,
    }));
    // Deleted legacy contacts with a local journal remain addressable in history.
    for (const old of saved[key])
      if (!data[key].some((c) => c.id === old.id)) data[key].push({ ...old, archived: true });
  }
  const productId = (i) => {
    const id = i.product_id || 'legacy-product-' + i.id;
    if (!data.products.some((p) => p.id === id))
      data.products.push({
        id,
        name: i.product_name || 'Ancien produit',
        category: 'Quincaillerie',
        unit: i.unit_label || 'pièce',
        retail: cents(i.unit_price),
        wholesale: cents(i.unit_price),
        cost: cents(i.unit_cost),
        stock: 0,
        minStock: 0,
        archived: true,
      });
    return id;
  };
  data.sales = source.sales
    .filter((s) => s.status !== 'CANCELLED')
    .map((s, index) => {
      const old = saved.sales.find((x) => x.id === s.id);
      let customerId = s.customer_id || '';
      if (!customerId && Number(s.amount_paid) < Number(s.total))
        customerId = 'legacy-customer-' + s.id;
      if (customerId && !data.customers.some((c) => c.id === customerId))
        data.customers.push({
          id: customerId,
          name: s.customer_name || 'Client ancien crédit',
          phone: '',
          contact: '',
          sector: '',
          openingDebt: 0,
          archived: false,
        });
      return {
        id: s.id,
        number: old?.number || Number(s.reference.match(/(\d+)$/)?.[1]) || index + 1,
        reference: s.reference,
        date: date(s.created_at),
        customerId,
        method: methods[s.payment_method] || 'Autre',
        total: cents(s.total),
        paid: Math.min(cents(s.amount_paid), cents(s.total)),
        cost: cents(s.cost_of_goods),
        discount: cents(s.discount),
        items: source.items
          .filter((i) => i.sale_id === s.id)
          .map((i) => ({
            productId: productId(i),
            name: i.product_name,
            quantity: Number(i.quantity),
            unitFactor: Number(i.unit_factor),
            unit: i.unit_label,
            price: cents(i.unit_price),
            unitCost: cents(i.unit_cost),
            total: cents(i.line_total),
            cost: Math.round(Number(i.quantity) * cents(i.unit_cost)),
          })),
      };
    });
  // Past purchase orders do not record payments: expose them without inventing cash or debts.
  data.legacyOrders = source.orders
    .filter((o) => !data.purchases.some((p) => p.id === o.id))
    .map((o) => ({
      id: o.id,
      reference: o.reference,
      date: date(o.created_at),
      supplier: o.supplier_name || 'Fournisseur',
      status: o.status,
      total: cents(o.total_estimated),
    }));
  for (const old of saved.products)
    if (!data.products.some((p) => p.id === old.id)) data.products.push({ ...old, archived: true });
  return validateStore(data);
}
