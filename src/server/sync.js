import pg from 'pg';
import { createHash } from 'crypto';
import { ApiError, badRequest, conflict, forbidden } from '../lib/http';
import { transact } from '../local/ledger';
import { canonical, expectedFor, assertAllowed } from '../local/syncProtocol';
import { projectDatabase } from './syncProjection';
const DDL = `CREATE TABLE IF NOT EXISTS commerce_sync_state (business_id text PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE, state jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS commerce_sync_operations (business_id text NOT NULL REFERENCES businesses(id) ON DELETE CASCADE, id text NOT NULL, payload_hash text NOT NULL, user_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(business_id,id));`;
let pool, ready;
function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
    if (!connectionString)
      throw new ApiError(503, 'La connexion à la base n’est pas configurée sur ce déploiement.');
    pool = new pg.Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    pool.on('error', () => {});
  }
  return pool;
}
async function ensureSchema() {
  if (!ready)
    ready = (async () => {
      const c = await getPool().connect();
      try {
        await c.query('BEGIN');
        await c.query("SELECT pg_advisory_xact_lock(hashtext('quincaflow.sync.schema'))");
        await c.query(DDL);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    })().catch((e) => {
      ready = null;
      throw e;
    });
  await ready;
}
export async function closeSyncPool() {
  await pool?.end();
  pool = null;
  ready = null;
}
async function readSource(c, session) {
  const member = (
    await c.query('SELECT role FROM business_members WHERE business_id=$1 AND user_id=$2', [
      session.businessId,
      session.userId,
    ])
  ).rows[0];
  if (!member) throw forbidden('Vous n’avez plus accès à cette boutique.');
  const business = (
    await c.query('SELECT name,currency FROM businesses WHERE id=$1', [session.businessId])
  ).rows[0];
  const source = { business };
  for (const [key, table] of [
    ['products', 'products'],
    ['customers', 'customers'],
    ['suppliers', 'suppliers'],
    ['sales', 'sales'],
    ['items', 'sale_items'],
    ['orders', 'purchase_orders'],
  ])
    source[key] = (
      await c.query(`SELECT * FROM ${table} WHERE business_id=$1 ORDER BY id`, [session.businessId])
    ).rows;
  source.state = (
    await c.query('SELECT state FROM commerce_sync_state WHERE business_id=$1', [
      session.businessId,
    ])
  ).rows[0]?.state;
  return { data: projectDatabase(source), role: member.role };
}
async function transaction(session, fn) {
  await ensureSchema();
  for (let attempt = 0; attempt < 3; attempt++) {
    const c = await getPool().connect();
    try {
      await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await c.query("SET LOCAL statement_timeout = '15s'");
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [session.businessId]);
      const result = await fn(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      if (['40001', '40P01'].includes(e.code) && attempt < 2) continue;
      if (e.code === '23505' || e.code === '23514')
        throw conflict(
          'Les données ont changé ou cet identifiant existe déjà. Actualisez puis vérifiez l’opération.'
        );
      throw e;
    } finally {
      c.release();
    }
  }
}
export async function syncSnapshot(session) {
  return transaction(session, async (c) => ({
    ...(await readSource(c, session)),
    businessId: session.businessId,
    userId: session.userId,
  }));
}
const method = (m) =>
  ({
    Espèces: 'CASH',
    'Mobile Money': 'MOBILE_MONEY',
    'Virement / banque': 'BANK',
    Autre: 'OTHER',
  })[m];
async function mirror(c, session, before, data, command) {
  const b = session.businessId,
    u = session.userId,
    { action, input, id } = command;
  const productIds =
    action === 'product.save'
      ? [input.id || id]
      : ['sale', 'purchase'].includes(action)
        ? input.lines.map((l) => l.productId)
        : action === 'archive' && input.collection === 'products'
          ? [input.id]
          : [];
  for (const productId of productIds) {
    const p = data.products.find((p) => p.id === productId),
      old = before.products.find((p) => p.id === productId);
    const result = await c.query(
      `INSERT INTO products(id,business_id,name,base_unit,purchase_price,selling_price,stock_quantity,low_stock_threshold,archived) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,base_unit=EXCLUDED.base_unit,purchase_price=EXCLUDED.purchase_price,selling_price=EXCLUDED.selling_price,stock_quantity=EXCLUDED.stock_quantity,low_stock_threshold=EXCLUDED.low_stock_threshold,archived=EXCLUDED.archived,updated_at=now() WHERE products.business_id=$2 RETURNING id`,
      [p.id, b, p.name, p.unit, p.cost / 100, p.retail / 100, p.stock, p.minStock, p.archived]
    );
    if (!result.rowCount) throw forbidden();
    if (action === 'product.save')
      await c.query(
        'UPDATE product_units SET price=$1,label=$2 WHERE business_id=$3 AND product_id=$4 AND is_base=true',
        [p.retail / 100, p.unit, b, p.id]
      );
    const delta = Math.round((p.stock - (old?.stock || 0)) * 1000) / 1000;
    if (delta)
      await c.query(
        `INSERT INTO stock_movements(id,business_id,product_id,type,quantity,stock_after,reference_type,reference_id,user_id,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          id + ':stock:' + p.id,
          b,
          p.id,
          action === 'sale' ? 'SALE' : action === 'purchase' ? 'PURCHASE_RECEIPT' : 'ADJUSTMENT',
          delta,
          p.stock,
          'SYNC',
          id,
          u,
          'Synchronisation du carnet',
        ]
      );
  }
  if (action === 'contact.save') {
    const table = input.kind === 'customer' ? 'customers' : 'suppliers',
      contact = data[table].find((x) => x.id === (input.id || id));
    const result = await c.query(
      `INSERT INTO ${table}(id,business_id,name,phone) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,phone=EXCLUDED.phone,updated_at=now() WHERE ${table}.business_id=$2 RETURNING id`,
      [contact.id, b, contact.name, contact.phone]
    );
    if (!result.rowCount) throw forbidden();
  }
  if (action === 'shop')
    await c.query('UPDATE businesses SET name=$1,currency=$2,updated_at=now() WHERE id=$3', [
      data.shop.name,
      data.shop.currency,
      b,
    ]);
  if (action === 'sale') {
    const s = data.sales.find((s) => s.id === id),
      customer = data.customers.find((x) => x.id === s.customerId);
    if (customer)
      await c.query(
        'INSERT INTO customers(id,business_id,name,phone) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',
        [customer.id, b, customer.name, customer.phone]
      );
    const ref = 'VE-SYNC-' + id;
    await c.query(
      `INSERT INTO sales(id,business_id,reference,invoice_reference,customer_id,customer_name,user_id,subtotal,discount,total,cost_of_goods,payment_method,amount_paid,payment_status,status,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,$8,$9,$10,$11,$12,'COMPLETED',$13)`,
      [
        id,
        b,
        ref,
        'FA-SYNC-' + id,
        s.customerId || null,
        customer?.name || 'Client comptoir',
        u,
        s.total / 100,
        s.cost / 100,
        method(s.method),
        s.paid / 100,
        s.paid === s.total ? 'PAID' : s.paid ? 'PARTIAL' : 'UNPAID',
        s.date + 'T12:00:00Z',
      ]
    );
    for (const [index, i] of s.items.entries())
      await c.query(
        `INSERT INTO sale_items(id,business_id,sale_id,product_id,product_name,unit_label,unit_factor,quantity,unit_price,line_total,unit_cost,position) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$11)`,
        [
          id + ':item:' + index,
          b,
          id,
          i.productId,
          i.name,
          data.products.find((p) => p.id === i.productId).unit,
          i.quantity,
          i.price / 100,
          i.total / 100,
          i.unitCost / 100,
          index,
        ]
      );
    if (s.paid)
      await c.query(
        'INSERT INTO payments(id,business_id,sale_id,method,amount,created_at) VALUES($1,$2,$3,$4,$5,$6)',
        [id + ':payment', b, id, method(s.method), s.paid / 100, s.date + 'T12:00:00Z']
      );
  }
  if (action === 'purchase') {
    const p = data.purchases.find((p) => p.id === id),
      supplier = data.suppliers.find((s) => s.id === p.supplierId);
    await c.query(
      `INSERT INTO purchase_orders(id,business_id,reference,supplier_id,supplier_name,status,total_estimated,user_id,created_at) VALUES($1,$2,$3,$4,$5,'RECEIVED',$6,$7,$8)`,
      [
        id,
        b,
        'PO-SYNC-' + id,
        p.supplierId || null,
        supplier?.name || 'Fournisseur',
        p.total / 100,
        u,
        p.date + 'T12:00:00Z',
      ]
    );
    await c.query(
      'INSERT INTO purchase_receipts(id,business_id,purchase_order_id,reference,user_id,received_at) VALUES($1,$2,$3,$4,$5,$6)',
      [id + ':receipt', b, id, 'RC-SYNC-' + id, u, p.date + 'T12:00:00Z']
    );
    for (const [index, i] of p.items.entries()) {
      const itemId = id + ':item:' + index;
      await c.query(
        'INSERT INTO purchase_order_items(id,business_id,purchase_order_id,product_id,product_name,unit_label,unit_factor,quantity_ordered,quantity_received,unit_cost,position) VALUES($1,$2,$3,$4,$5,$6,1,$7,$7,$8,$9)',
        [
          itemId,
          b,
          id,
          i.productId,
          i.name,
          data.products.find((p) => p.id === i.productId).unit,
          i.quantity,
          i.price / 100,
          index,
        ]
      );
      await c.query(
        'INSERT INTO purchase_receipt_items(id,business_id,purchase_receipt_id,purchase_order_item_id,product_id,quantity,unit_cost) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          id + ':received:' + index,
          b,
          id + ':receipt',
          itemId,
          i.productId,
          i.quantity,
          i.price / 100,
        ]
      );
    }
  }
}
export async function syncOperation(session, command) {
  if (
    !command ||
    !/^[0-9a-f-]{36}$/i.test(command.id) ||
    typeof command.action !== 'string' ||
    !command.input ||
    typeof command.input !== 'object'
  )
    throw badRequest('Opération de synchronisation invalide.');
  if (command.businessId !== session.businessId || command.userId !== session.userId)
    throw forbidden(
      'Le compte connecté ne correspond plus à cette opération. Reconnectez la boutique d’origine.'
    );
  const hash = createHash('sha256').update(canonical(command)).digest('hex');
  return transaction(session, async (c) => {
    const { data: before, role } = await readSource(c, session);
    try {
      assertAllowed(role, command.action, command.input);
    } catch (e) {
      throw forbidden(e.message);
    }
    const previous = (
      await c.query(
        'SELECT payload_hash FROM commerce_sync_operations WHERE business_id=$1 AND id=$2',
        [session.businessId, command.id]
      )
    ).rows[0];
    if (previous) {
      if (previous.payload_hash !== hash)
        throw conflict('Cet identifiant a déjà servi pour une autre opération.');
      return {
        businessId: session.businessId,
        userId: session.userId,
        role,
        data: before,
        ack: command.id,
      };
    }
    if (
      canonical(command.expected) !== canonical(expectedFor(before, command.action, command.input))
    )
      throw conflict(
        'Le prix, le coût ou la fiche a changé depuis votre saisie. Vérifiez cette opération avant de la ressaisir.'
      );
    let data;
    try {
      data = transact(before, command.action, command.input, command.id);
    } catch (e) {
      throw conflict(e.message);
    }
    await mirror(c, session, before, data, command);
    await c.query(
      'INSERT INTO commerce_sync_state(business_id,state) VALUES($1,$2::jsonb) ON CONFLICT(business_id) DO UPDATE SET state=EXCLUDED.state,updated_at=now()',
      [session.businessId, JSON.stringify(data)]
    );
    await c.query(
      'INSERT INTO commerce_sync_operations(business_id,id,payload_hash,user_id) VALUES($1,$2,$3,$4)',
      [session.businessId, command.id, hash, session.userId]
    );
    return { businessId: session.businessId, userId: session.userId, role, data, ack: command.id };
  });
}
