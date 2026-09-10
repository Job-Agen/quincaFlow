import { readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests d'intégration des flux, sur un vrai PostgreSQL.
 *
 * Ce qui est vérifié ici ne peut pas l'être autrement : l'atomicité d'une
 * validation de vente, le rejet d'une survente par la contrainte de stock, la
 * restitution du stock à l'annulation, et le coût moyen pondéré après une
 * livraison partielle. Ce sont les endroits où une erreur ne se voit pas à la
 * lecture du code mais fausse durablement les chiffres du commerçant.
 *
 * Sans base de test, la suite est ignorée plutôt qu'en échec : elle ne doit pas
 * bloquer quelqu'un qui lance `npm test` sans Postgres sous la main.
 *
 *   TEST_DATABASE_URL=postgres://… npm test
 */

const CONNECTION = process.env.TEST_DATABASE_URL;

vi.mock('@neondatabase/serverless', async () => {
  const { createNeonOverPg: create } = await import('../../test/neonOverPg');
  return { neon: (url) => create(url) };
});

describe.skipIf(!CONNECTION)('flux métier', () => {
  let pool;
  let products;
  let sales;
  let purchases;
  let accounts;

  const OWNER = { userId: 'usr_owner', businessId: 'biz_a', role: 'OWNER' };
  const RIVAL = { userId: 'usr_rival', businessId: 'biz_b', role: 'OWNER' };

  beforeAll(async () => {
    process.env.DATABASE_URL = CONNECTION;
    pool = new pg.Pool({ connectionString: CONNECTION });
    await pool.query(readFileSync(resolve(process.cwd(), 'schema.sql'), 'utf8'));

    products = await import('../products');
    sales = await import('../sales');
    purchases = await import('../purchases');
    accounts = await import('../accounts');
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    // TRUNCATE … CASCADE remet les 19 tables à zéro d'un coup : chaque test part
    // d'une boutique vierge, sans dépendre de l'ordre d'exécution.
    await pool.query(`
      TRUNCATE users, businesses, business_members, refresh_tokens, counters,
        products, product_units, customers, suppliers, sales, sale_items, payments,
        out_of_stock_sales, purchase_orders, purchase_order_items,
        purchase_receipts, purchase_receipt_items, stock_movements, documents
      RESTART IDENTITY CASCADE
    `);
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash) VALUES
         ($1, 'Kossi', 'kossi@test.tg', 'x'), ($2, 'Rival', 'rival@test.tg', 'x')`,
      [OWNER.userId, RIVAL.userId]
    );
    await pool.query(
      `INSERT INTO businesses (id, name) VALUES ($1, 'Quincaillerie A'), ($2, 'Quincaillerie B')`,
      [OWNER.businessId, RIVAL.businessId]
    );
    await pool.query(
      `INSERT INTO business_members (business_id, user_id, role) VALUES
         ($1, $2, 'OWNER'), ($3, $4, 'OWNER')`,
      [OWNER.businessId, OWNER.userId, RIVAL.businessId, RIVAL.userId]
    );
  });

  /** Vitre 60 cm : 450 la pièce, 17 000 le carton de 40, 80 pièces en stock. */
  async function seedVitre(stock = 80) {
    return products.createProduct(OWNER, {
      name: 'Vitre 60 cm',
      sku: 'VIT-060',
      baseUnit: 'pièce',
      purchasePrice: 318.75,
      sellingPrice: 450,
      lowStockThreshold: 10,
      stockQuantity: stock,
      units: [{ label: 'carton', factor: 40, price: 17000 }],
    });
  }

  const stockOf = async (id) => {
    const { rows } = await pool.query(
      'SELECT stock_quantity::float8 AS q FROM products WHERE id = $1',
      [id]
    );
    return rows[0].q;
  };

  // ───────────────────────────── Catalogue ─────────────────────────────

  it('crée un produit, ses conditionnements et le mouvement de stock initial', async () => {
    const vitre = await seedVitre();

    expect(vitre.stock_quantity).toBe(80);
    expect(vitre.units.map((unit) => unit.label)).toEqual(['pièce', 'carton']);

    const { rows } = await pool.query(
      'SELECT type, quantity::float8 AS q, note FROM stock_movements WHERE product_id = $1',
      [vitre.id]
    );
    expect(rows).toEqual([{ type: 'ADJUSTMENT', q: 80, note: 'Stock initial' }]);
  });

  it('interdit à une autre quincaillerie de lire le produit', async () => {
    const vitre = await seedVitre();
    await expect(products.getProduct(RIVAL.businessId, vitre.id)).rejects.toThrow(/introuvable/i);
    await expect(products.listProducts(RIVAL.businessId, {})).resolves.toHaveLength(0);
  });

  // ─────────────────────────────── Ventes ──────────────────────────────

  it('valide une vente : totaux, stock, mouvement et encaissement en une transaction', async () => {
    const vitre = await seedVitre();
    const carton = vitre.units.find((unit) => unit.factor === 40);

    const sale = await sales.createSale(OWNER, {
      lines: [
        { productId: vitre.id, unitId: carton.id, quantity: 1 },
        { productId: vitre.id, unitId: vitre.units[0].id, quantity: 5 },
      ],
      paymentMethod: 'CASH',
    });

    // 17 000 (carton) + 5 × 450 = 19 250.
    expect(sale.total).toBe(19250);
    expect(sale.payment_status).toBe('PAID');
    expect(sale.reference).toBe('VE-0001');
    expect(sale.invoice_reference).toMatch(/^FA-\d{4}-0001$/);

    // Coût : 12 750 le carton + 5 × 318,75 = 14 343,75.
    expect(sale.cost_of_goods).toBeCloseTo(14343.75, 2);

    // 40 + 5 = 45 pièces sorties, en un seul mouvement.
    expect(await stockOf(vitre.id)).toBe(35);
    const { rows: movements } = await pool.query(
      "SELECT quantity::float8 AS q, stock_after::float8 AS after FROM stock_movements WHERE type = 'SALE'"
    );
    expect(movements).toEqual([{ q: -45, after: 35 }]);

    const { rows: payments } = await pool.query('SELECT amount::float8 AS amount FROM payments');
    expect(payments).toEqual([{ amount: 19250 }]);
  });

  it('applique la remise et déduit un paiement partiel', async () => {
    const vitre = await seedVitre();
    const sale = await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0].id, quantity: 10 }],
      discount: 500,
      amountPaid: 2000,
    });

    expect(sale.subtotal).toBe(4500);
    expect(sale.total).toBe(4000);
    expect(sale.payment_status).toBe('PARTIAL');
  });

  it("refuse une survente et n'écrit rien du tout", async () => {
    const vitre = await seedVitre(30);

    await expect(
      sales.createSale(OWNER, {
        lines: [{ productId: vitre.id, unitId: vitre.units[0].id, quantity: 31 }],
      })
    ).rejects.toThrow(/stock insuffisant/i);

    // Le point important : la transaction entière a été annulée.
    expect(await stockOf(vitre.id)).toBe(30);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM sales');
    expect(rows[0].n).toBe(0);
  });

  it('refuse un produit appartenant à une autre quincaillerie', async () => {
    const vitre = await seedVitre();
    await expect(
      sales.createSale(RIVAL, {
        lines: [{ productId: vitre.id, unitId: vitre.units[0].id, quantity: 1 }],
      })
    ).rejects.toThrow(/introuvable/i);
  });

  it('annule une vente : le stock revient, la vente reste dans l’historique', async () => {
    const vitre = await seedVitre();
    const carton = vitre.units.find((unit) => unit.factor === 40);
    const sale = await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: carton.id, quantity: 1 }],
    });
    expect(await stockOf(vitre.id)).toBe(40);

    const cancelled = await sales.cancelSale(OWNER, sale.id, 'Erreur de saisie');
    expect(cancelled.status).toBe('CANCELLED');
    expect(await stockOf(vitre.id)).toBe(80);

    const { rows } = await pool.query(
      "SELECT quantity::float8 AS q FROM stock_movements WHERE type = 'SALE_CANCEL'"
    );
    expect(rows).toEqual([{ q: 40 }]);

    await expect(sales.cancelSale(OWNER, sale.id, 'à nouveau')).rejects.toThrow(/déjà annulée/i);
  });

  // ──────────────────────── Achats et réceptions ───────────────────────

  it("ne touche pas au stock à la création d'une commande", async () => {
    const vitre = await seedVitre();
    await pool.query(
      "INSERT INTO suppliers (id, business_id, name) VALUES ('sup_1', $1, 'Bâtir Plus')",
      [OWNER.businessId]
    );

    const order = await purchases.createPurchaseOrder(OWNER, {
      supplierId: 'sup_1',
      items: [{ productId: vitre.id, unitId: vitre.units[0].id, quantity: 400, unitCost: 320 }],
    });

    expect(order.status).toBe('DRAFT');
    expect(order.total_estimated).toBe(128000);
    expect(await stockOf(vitre.id)).toBe(80);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM stock_movements WHERE type = 'PURCHASE_RECEIPT'"
    );
    expect(rows[0].n).toBe(0);
  });

  it('reçoit une livraison partielle puis le solde, en recalculant le coût moyen', async () => {
    // 100 pièces à 300 en stock ; on commande 400 à 320.
    const vitre = await products.createProduct(OWNER, {
      name: 'Vitre 60 cm',
      baseUnit: 'pièce',
      purchasePrice: 300,
      sellingPrice: 450,
      stockQuantity: 100,
      units: [],
    });
    await pool.query(
      "INSERT INTO suppliers (id, business_id, name) VALUES ('sup_1', $1, 'Bâtir Plus')",
      [OWNER.businessId]
    );

    let order = await purchases.createPurchaseOrder(OWNER, {
      supplierId: 'sup_1',
      items: [{ productId: vitre.id, unitId: vitre.units[0].id, quantity: 400, unitCost: 320 }],
    });

    order = await purchases.receivePurchaseOrder(OWNER, order.id, {
      lines: [{ itemId: order.items[0].id, quantity: 150 }],
    });
    expect(order.status).toBe('PARTIALLY_RECEIVED');
    expect(await stockOf(vitre.id)).toBe(250);

    order = await purchases.receivePurchaseOrder(OWNER, order.id, {
      lines: [{ itemId: order.items[0].id, quantity: 250 }],
    });
    expect(order.status).toBe('RECEIVED');
    expect(await stockOf(vitre.id)).toBe(500);

    // (100×300 + 400×320) / 500 = 316, et non 320.
    const { rows } = await pool.query(
      'SELECT purchase_price::float8 AS cost FROM products WHERE id = $1',
      [vitre.id]
    );
    expect(rows[0].cost).toBe(316);

    await expect(
      purchases.receivePurchaseOrder(OWNER, order.id, {
        lines: [{ itemId: order.items[0].id, quantity: 1 }],
      })
    ).rejects.toThrow(/plus de .* qu'il n'en reste/i);
  });

  // ────────────────────────────── Comptes ──────────────────────────────

  it("crée l'utilisateur, sa boutique et le lien OWNER en une transaction", async () => {
    const session = await accounts.register({
      ownerName: 'Ama',
      businessName: 'Quincaillerie Ama',
      email: 'ama@test.tg',
      password: 'motdepasse123',
    });

    const profile = await accounts.profile(session);
    expect(profile.business.name).toBe('Quincaillerie Ama');
    expect(profile.role).toBe('OWNER');

    await expect(
      accounts.register({
        ownerName: 'Ama',
        businessName: 'Doublon',
        email: 'ama@test.tg',
        password: 'motdepasse123',
      })
    ).rejects.toThrow(/existe déjà/i);
  });

  it('rejette un mot de passe faux comme un compte inconnu', async () => {
    await accounts.register({
      ownerName: 'Ama',
      businessName: 'Quincaillerie Ama',
      email: 'ama@test.tg',
      password: 'motdepasse123',
    });

    await expect(
      accounts.authenticate({ identifier: 'ama@test.tg', password: 'mauvais' })
    ).rejects.toThrow(/incorrect/i);
    await expect(
      accounts.authenticate({ identifier: 'inconnu@test.tg', password: 'motdepasse123' })
    ).rejects.toThrow(/incorrect/i);
  });
});
