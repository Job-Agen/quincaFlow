// Pure local commerce ledger. Money is stored in integer cents, never floats.
export const VERSION = 1;
export const CATEGORIES = [
  'Quincaillerie', 'Alimentaire', 'Boissons', 'Hygiène & Entretien', 'Électronique',
  'Textiles & Wax', 'Fournitures', 'Cosmétiques', 'Divers',
];
export const EXPENSES = [
  'Loyer de boutique', 'Énergie & eau', 'Salaires', 'Achat de stock',
  'Transport tricycle / taxi-bagages', 'Divers',
];
export const METHODS = ['Espèces', 'Mobile Money', 'Virement / banque', 'Autre'];
export const COLLECTIONS = [
  'products', 'customers', 'suppliers', 'sales', 'purchases',
  'customerPayments', 'supplierPayments', 'expenses',
];

export function today() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
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
const signedCents = (n) => Number.isSafeInteger(n) && Math.abs(n) <= 1e12;
const qty = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e9 && Math.abs(n * 1000 - Math.round(n * 1000)) < 0.001;
const roundQty = (n) => Math.round(n * 1000) / 1000;
const sum = (rows, fn) => rows.reduce((total, row) => total + fn(row), 0);
const requireValue = (ok, message) => { if (!ok) throw Error(message); };
const text = (v, label, required = true) => {
  const s = String(v ?? '').trim();
  requireValue((!required || s.length > 0) && s.length <= 300, label + ' invalide.');
  return s;
};
const dateOK = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const find = (data, collection, id) => {
  const row = data[collection].find((item) => item.id === id && !item.archived);
  requireValue(row, 'Fiche introuvable ou supprimée.');
  return row;
};
const receiptOK = (v) => typeof v === 'string' && (v === '' || (v.length < 600000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v)));
const baseUnit = (p) => p.baseUnit || String(p.unit || 'pièce').split(' · ')[0];
const packFactor = (p) => Number(p.packageFactor || 1);
const packUnit = (p) => p.packageUnit || 'carton';
const plural = (name, count) => count > 1 && !name.endsWith('s') ? name + 's' : name;
export function stockDisplay(product) {
  const unit = baseUnit(product), factor = packFactor(product), stock = Number(product.stock || 0);
  if (!(factor > 1)) return `${stock} ${unit}`;
  const packs = Math.floor(stock / factor), rest = roundQty(stock - packs * factor);
  if (!packs) return `${stock} ${unit}`;
  return `${stock} ${unit} · ${packs} ${plural(packUnit(product), packs)}${rest ? ` + ${rest} ${unit}` : ''}`;
}
function displayUnit(product) {
  const label = stockDisplay(product), prefix = String(product.stock) + ' ';
  return label.startsWith(prefix) ? label.slice(prefix.length) : baseUnit(product);
}
function normalized(data) {
  const copy = structuredClone(data);
  for (const p of copy.products || []) p.unit = baseUnit(p);
  return copy;
}
function decorate(data) {
  for (const p of data.products || []) p.unit = displayUnit(p);
  return data;
}

export function customerBalance(data, id) {
  const c = data.customers.find((row) => row.id === id);
  return (c?.openingDebt || 0) + sum(data.sales.filter((r) => r.customerId === id), (r) => r.total - r.paid) - sum(data.customerPayments.filter((r) => r.contactId === id), (r) => r.amount);
}
export function supplierBalance(data, id) {
  const c = data.suppliers.find((row) => row.id === id);
  return (c?.openingDebt || 0) + sum(data.purchases.filter((r) => r.supplierId === id), (r) => r.total - r.paid) - sum(data.supplierPayments.filter((r) => r.contactId === id), (r) => r.amount);
}

export function validateStore(source) {
  const data = normalized(source);
  requireValue(data && data.version === VERSION && Number.isSafeInteger(data.revision) && data.revision >= 0, 'Sauvegarde incompatible.');
  requireValue(data.shop && typeof data.shop.name === 'string' && data.shop.name.trim() && ['FCFA','XOF','XAF'].includes(data.shop.currency) && cents(data.shop.openingCash) && cents(data.shop.openingMobile), 'Boutique invalide.');
  const ids = new Set();
  for (const key of COLLECTIONS) {
    requireValue(Array.isArray(data[key]) && data[key].length <= 100000, 'Collection invalide : ' + key);
    for (const row of data[key]) {
      requireValue(row && typeof row.id === 'string' && row.id.length > 0 && row.id.length < 100 && !ids.has(row.id), 'Identifiant invalide ou dupliqué.');
      ids.add(row.id);
    }
  }
  for (const p of data.products) {
    requireValue(typeof p.name === 'string' && p.name.trim() && p.name.length <= 300 && typeof p.unit === 'string' && p.unit.length <= 30 && CATEGORIES.includes(p.category) && [p.retail,p.wholesale,p.cost].every(cents) && qty(p.stock) && qty(p.minStock) && typeof p.archived === 'boolean', 'Produit invalide.');
    requireValue(typeof baseUnit(p) === 'string' && baseUnit(p).length <= 30 && packFactor(p) >= 1 && qty(packFactor(p)), 'Conditionnement invalide.');
    if (packFactor(p) > 1) requireValue(typeof p.packageUnit === 'string' && p.packageUnit.trim() && p.packageUnit.length <= 30 && cents(p.packagePrice || p.wholesale), 'Conditionnement invalide.');
  }
  for (const key of ['customers','suppliers']) for (const c of data[key])
    requireValue(typeof c.name === 'string' && c.name.trim() && typeof c.phone === 'string' && typeof c.contact === 'string' && typeof c.sector === 'string' && cents(c.openingDebt) && typeof c.archived === 'boolean', 'Contact invalide.');
  for (const key of ['sales','purchases']) for (const sale of data[key]) {
    requireValue(dateOK(sale.date) && METHODS.includes(sale.method) && Number.isInteger(sale.number) && sale.number > 0 && [sale.total,sale.cost,sale.paid].every(cents) && sale.paid <= sale.total && Array.isArray(sale.items) && sale.items.length > 0, 'Opération invalide.');
    const contactId = key === 'sales' ? sale.customerId : sale.supplierId;
    requireValue(!contactId || data[key === 'sales' ? 'customers' : 'suppliers'].some((c) => c.id === contactId), 'Contact manquant dans la sauvegarde.');
    requireValue(sale.paid === sale.total || contactId, 'Une dette doit être rattachée à un contact.');
    for (const item of sale.items) {
      const factor = Number(item.unitFactor || 1), baseQuantity = Number(item.baseQuantity || item.quantity * factor);
      requireValue(data.products.some((p) => p.id === item.productId) && typeof item.name === 'string' && qty(item.quantity) && item.quantity > 0 && qty(baseQuantity) && baseQuantity > 0 && factor >= 1 && [item.price,item.unitCost,item.total,item.cost].every(cents) && item.total === Math.round(item.quantity * item.price) && item.cost === Math.round(item.quantity * item.unitCost), 'Ligne de vente ou achat invalide.');
    }
    requireValue(cents(sale.discount || 0) && sale.total === sum(sale.items, (r) => r.total) - (sale.discount || 0) && sale.cost === sum(sale.items, (r) => r.cost), 'Totaux incohérents.');
  }
  for (const key of ['customerPayments','supplierPayments']) for (const p of data[key])
    requireValue(cents(p.amount) && p.amount > 0 && dateOK(p.date) && METHODS.includes(p.method) && typeof p.reason === 'string' && p.reason.trim(), 'Remboursement invalide.');
  for (const e of data.expenses) requireValue(cents(e.amount) && e.amount > 0 && dateOK(e.date) && METHODS.includes(e.method) && EXPENSES.includes(e.category) && typeof e.reason === 'string' && e.reason.trim() && receiptOK(e.receipt), 'Dépense ou justificatif invalide.');
  validateClosures(data);
  for (const c of data.customers) requireValue(customerBalance(data,c.id) >= 0, 'Remboursement client supérieur à la dette.');
  for (const c of data.suppliers) requireValue(supplierBalance(data,c.id) >= 0, 'Paiement fournisseur supérieur à la dette.');
  return source;
}

export function transact(source, action, input, id = globalThis.crypto.randomUUID()) {
  validateStore(source);
  const data = normalized(source), stamp = { id, date: input.date || today() };
  if (action === 'product.save') {
    const current = input.id ? find(data,'products',input.id) : null;
    const factor = Number(input.packageFactor || 1);
    const product = {
      id: current?.id || id, archived: false, name: text(input.name,'Nom'), category: input.category,
      baseUnit: text(input.baseUnit || input.unit || current?.baseUnit || 'pièce','Unité'),
      unit: text(input.baseUnit || input.unit || current?.baseUnit || 'pièce','Unité'),
      retail: money(input.retail), wholesale: money(input.wholesale), cost: money(input.cost),
      stock: Number(input.stock), minStock: Number(input.minStock),
      packageUnit: factor > 1 ? text(input.packageUnit || current?.packageUnit || 'carton','Conditionnement') : '',
      packageFactor: factor,
      packagePrice: factor > 1 ? money(input.packagePrice ?? input.wholesale) : 0,
    };
    requireValue(qty(product.stock) && qty(product.minStock) && qty(factor) && factor >= 1, 'Stock, seuil ou conditionnement invalide.');
    if (current) Object.assign(current,product); else data.products.push(product);
  } else if (action === 'contact.save') {
    const collection = input.kind === 'customer' ? 'customers' : 'suppliers', current = input.id ? find(data,collection,input.id) : null;
    const contact = { id: current?.id || id, archived:false, name:text(input.name,'Nom'), phone:text(input.phone,'Téléphone',false), contact:text(input.contact,'Contact',false), sector:text(input.sector,'Secteur',false), openingDebt: current ? current.openingDebt : money(input.openingDebt || 0) };
    if (current) Object.assign(current,contact); else data[collection].push(contact);
  } else if (action === 'archive') {
    requireValue(['products','customers','suppliers'].includes(input.collection),'Suppression interdite.');
    const row = find(data,input.collection,input.id);
    if (input.collection === 'customers') requireValue(customerBalance(data,row.id) === 0,'Remboursez ou conservez la dette avant de supprimer ce client.');
    if (input.collection === 'suppliers') requireValue(supplierBalance(data,row.id) === 0,'Soldez la dette avant de supprimer ce fournisseur.');
    row.archived = true;
  } else if (action === 'sale' || action === 'purchase') {
    const purchase = action === 'purchase';
    requireValue(Array.isArray(input.lines) && input.lines.length > 0,'Ajoutez au moins un produit.');
    const used = new Set();
    const items = input.lines.map((line) => {
      const product = find(data,'products',line.productId), quantity = Number(line.quantity);
      const factor = purchase ? 1 : Number(line.unitFactor || 1), baseQuantity = roundQty(quantity * factor);
      const unitKey = `${line.productId}:${factor}`;
      requireValue(!used.has(unitKey),'Regroupez les quantités du même produit et conditionnement sur une seule ligne.'); used.add(unitKey);
      requireValue(qty(quantity) && quantity > 0 && qty(baseQuantity),'Quantité invalide.');
      if (!purchase) requireValue(product.stock >= baseQuantity,'Stock insuffisant : ' + product.name);
      let price;
      if (purchase) price = money(line.price);
      else if (line.price !== '' && line.price !== undefined) price = money(line.price);
      else if (factor > 1) price = product.packagePrice || product.wholesale * factor;
      else price = input.priceMode === 'wholesale' ? product.wholesale : product.retail;
      const unitCost = purchase ? price : Math.round(product.cost * factor);
      const item = { productId:product.id, name:product.name, quantity, unitName: factor > 1 ? packUnit(product) : baseUnit(product), unitFactor:factor, baseQuantity, price, unitCost, total:Math.round(price * quantity), cost:Math.round(unitCost * quantity) };
      if (purchase) {
        product.cost = Math.round((product.stock * product.cost + quantity * price) / (product.stock + quantity));
        product.stock = roundQty(product.stock + quantity);
      } else product.stock = roundQty(product.stock - baseQuantity);
      return item;
    });
    const total = sum(items,(r)=>r.total), paid = input.paid === '' || input.paid === undefined ? total : money(input.paid);
    requireValue(paid <= total,'Le paiement ne peut pas dépasser le total.');
    const contactId = input.contactId || '';
    if (contactId) find(data,purchase ? 'suppliers' : 'customers',contactId);
    requireValue(paid === total || contactId,'Choisissez un ' + (purchase ? 'fournisseur' : 'client') + ' pour enregistrer une dette.');
    const collection = purchase ? 'purchases' : 'sales', number = Math.max(0,...data[collection].map((r)=>r.number)) + 1;
    data[collection].push({ ...stamp, number, items, total, cost:sum(items,(r)=>r.cost), paid, method:input.method, [purchase ? 'supplierId' : 'customerId']:contactId });
  } else if (action === 'payment') {
    const customer = input.kind === 'customer', collection = customer ? 'customers' : 'suppliers'; find(data,collection,input.contactId);
    const amount = money(input.amount), balance = customer ? customerBalance(data,input.contactId) : supplierBalance(data,input.contactId);
    requireValue(amount > 0 && amount <= balance,'Le remboursement doit être positif et ne pas dépasser le solde dû.');
    data[customer ? 'customerPayments' : 'supplierPayments'].push({ ...stamp, contactId:input.contactId, amount, reason:text(input.reason,'Motif'), method:input.method });
  } else if (action === 'expense') {
    const amount = money(input.amount); requireValue(amount > 0,'La dépense doit être supérieure à zéro.');
    data.expenses.push({ ...stamp, amount, category:input.category, reason:text(input.reason,'Motif'), method:input.method, receipt:input.receipt || '' });
  } else if (action === 'day.close') closeDay(data,input,stamp);
  else if (action === 'shop') data.shop = { ...data.shop, name:text(input.name,'Nom de boutique'), currency:input.currency, openingCash:money(input.openingCash), openingMobile:money(input.openingMobile) };
  else throw Error('Opération inconnue.');
  data.revision++;
  decorate(data);
  validateStore(data);
  return data;
}

export function cashLedger(data) {
  const entries=[];
  for (const s of data.sales) if (s.paid > 0) entries.push({id:s.id,date:s.date,direction:1,amount:s.paid,method:s.method,label:'Vente n° '+s.number,kind:'Vente'});
  for (const p of data.customerPayments) entries.push({id:p.id,date:p.date,direction:1,amount:p.amount,method:p.method,label:'Remboursement · '+data.customers.find(c=>c.id===p.contactId)?.name,kind:'Remboursement client'});
  for (const p of data.purchases) if (p.paid > 0) entries.push({id:p.id,date:p.date,direction:-1,amount:p.paid,method:p.method,label:'Achat n° '+p.number,kind:'Achat de stock'});
  for (const p of data.supplierPayments) entries.push({id:p.id,date:p.date,direction:-1,amount:p.amount,method:p.method,label:'Paiement · '+data.suppliers.find(c=>c.id===p.contactId)?.name,kind:'Paiement fournisseur'});
  for (const e of data.expenses) entries.push({id:e.id,date:e.date,direction:-1,amount:e.amount,method:e.method,label:e.reason,kind:e.category,receipt:e.receipt});
  for (const c of data.dailyClosures || []) {
    if (c.withdrawal) entries.push({id:c.id+':withdrawal',closureId:c.id,date:c.date,direction:-1,amount:c.withdrawal,method:c.method,label:c.withdrawalReason,kind:'Retrait de clôture'});
    if (c.adjustment) entries.push({id:c.id+':adjustment',closureId:c.id,date:c.date,direction:Math.sign(c.adjustment),amount:Math.abs(c.adjustment),method:c.method,label:c.adjustmentReason,kind:'Écart de clôture'});
  }
  return entries.sort((a,b)=>b.date.localeCompare(a.date));
}
export function report(data, from='', to='') {
  const within=(r)=>(!from||r.date>=from)&&(!to||r.date<=to), sales=data.sales.filter(within), expenses=data.expenses.filter(within);
  const revenue=sum(sales,r=>r.total), cost=sum(sales,r=>r.cost), operating=sum(expenses.filter(r=>r.category!=='Achat de stock'),r=>r.amount), profitability=new Map();
  for (const sale of sales) { let allocated=0; for (const [index,item] of sale.items.entries()) {
    const row=profitability.get(item.productId)||{id:item.productId,name:item.name,quantity:0,revenue:0,cost:0}; row.quantity=roundQty(row.quantity+(item.baseQuantity||item.quantity*(item.unitFactor||1)));
    const discount=index===sale.items.length-1?(sale.discount||0)-allocated:Math.round(((sale.discount||0)*item.total)/(sale.total+(sale.discount||0)||1)); allocated+=discount; row.revenue+=item.total-discount; row.cost+=item.cost; profitability.set(item.productId,row);
  }}
  const days=new Map(); for (const sale of sales) days.set(sale.date,(days.get(sale.date)||0)+sale.total);
  const ledger=cashLedger(data), periodLedger=ledger.filter(within), opening=(m)=>m==='Espèces'?data.shop.openingCash:m==='Mobile Money'?data.shop.openingMobile:0;
  return { revenue,cost,gross:revenue-cost,operating,net:revenue-cost-operating,salesCount:sales.length,
    expenses:EXPENSES.map(name=>({name,value:sum(expenses.filter(e=>e.category===name),e=>e.amount)})).filter(r=>r.value>0),
    products:[...profitability.values()].sort((a,b)=>b.revenue-b.cost-(a.revenue-a.cost)), days:[...days].sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>({name,value})),
    debtors:data.customers.map(c=>({id:c.id,name:c.name,value:customerBalance(data,c.id)})).filter(c=>c.value>0).sort((a,b)=>b.value-a.value), supplierDebt:sum(data.suppliers,c=>supplierBalance(data,c.id)),
    incoming:sum(periodLedger.filter(e=>e.direction===1),e=>e.amount), outgoing:sum(periodLedger.filter(e=>e.direction===-1),e=>e.amount), balances:METHODS.map(name=>({name,value:opening(name)+sum(ledger.filter(e=>e.method===name),e=>e.amount*e.direction)})) };
}
export function whatsappLink(phone,message) {
  const digits=String(phone).replace(/[^0-9]/g,'').replace(/^00/,'');
  if (digits.length<8||digits.length>15) throw Error('Saisissez le téléphone avec son indicatif pays (ex. +228…).');
  return 'https://wa.me/'+digits+'?text='+encodeURIComponent(message);
}
export function daySummary(data,date) {
  const sales=structuredClone(data.sales.filter(s=>s.date===date)).sort((a,b)=>a.id.localeCompare(b.id));
  const entries=cashLedger(data).filter(e=>e.date===date&&!e.closureId).map(({receipt,...e})=>e).sort((a,b)=>a.id.localeCompare(b.id));
  return {sales,entries,totalSales:sum(sales,s=>s.total),collectedSales:sum(sales,s=>s.paid),incoming:sum(entries.filter(e=>e.direction===1),e=>e.amount),outgoing:sum(entries.filter(e=>e.direction===-1),e=>e.amount)};
}
function closeDay(data,input,stamp) {
  requireValue(dateOK(stamp.date)&&stamp.date<=today(),'Choisissez une journée passée ou aujourd’hui.');
  requireValue(!(data.dailyClosures||[]).some(c=>c.date===stamp.date),'Cette journée est déjà clôturée.');
  requireValue(/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time),'Heure de clôture invalide.');
  const snapshot=daySummary(data,stamp.date), withdrawal=money(input.withdrawal||0), raw=String(input.remaining??'').replace(',','.'), remaining=Math.round(Number(raw)*100);
  requireValue(raw.trim()&&signedCents(remaining),'Montant validé invalide.'); const adjustment=remaining-(snapshot.incoming-snapshot.outgoing-withdrawal); requireValue(signedCents(adjustment),'Écart invalide.'); requireValue(METHODS.includes(input.method),'Moyen de paiement invalide.');
  data.dailyClosures=[...(data.dailyClosures||[]),{...stamp,time:input.time,snapshot,withdrawal,remaining,adjustment,method:input.method,withdrawalReason:text(input.withdrawalReason,'Motif du retrait',withdrawal>0),adjustmentReason:text(input.adjustmentReason,'Motif de l’écart',adjustment!==0),note:text(input.note,'Note',false)}];
}
function validateClosures(data) {
  requireValue(data.dailyClosures===undefined||Array.isArray(data.dailyClosures),'Historique des clôtures invalide.'); const dates=new Set(),ids=new Set();
  for (const c of data.dailyClosures||[]) {
    requireValue(c&&typeof c.id==='string'&&!ids.has(c.id)&&dateOK(c.date)&&!dates.has(c.date),'Clôture dupliquée ou invalide.'); dates.add(c.date);ids.add(c.id);
    requireValue(/^([01]\d|2[0-3]):[0-5]\d$/.test(c.time)&&METHODS.includes(c.method)&&cents(c.withdrawal)&&signedCents(c.remaining)&&signedCents(c.adjustment),'Montants de clôture invalides.');
    const v=c.snapshot; requireValue(v&&Array.isArray(v.sales)&&Array.isArray(v.entries)&&[v.totalSales,v.collectedSales,v.incoming,v.outgoing].every(cents),'Récapitulatif invalide.');
  }
}
export function closureFingerprint(snapshot) {
  return {sales:snapshot.sales.map(s=>({id:s.id,date:s.date,total:s.total,paid:s.paid,method:s.method,discount:s.discount||0,items:s.items.map(i=>({productId:i.productId,name:i.name,quantity:i.quantity,unitName:i.unitName,unitFactor:i.unitFactor||1,baseQuantity:i.baseQuantity||i.quantity,price:i.price,total:i.total}))})),entries:snapshot.entries.map(e=>({id:e.id,amount:e.amount,direction:e.direction,method:e.method}))};
}
