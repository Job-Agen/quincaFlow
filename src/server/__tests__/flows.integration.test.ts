import { readFileSync } from 'fs';
import { resolve } from 'path';
import pg from 'pg';
import type { Session } from '@/types';
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
  return { neon: (url: string) => create(url) };
});

describe.skipIf(!CONNECTION)('flux métier', () => {
  // Les modules métier sont importés dans `beforeAll`, une fois DATABASE_URL
  // posée : les typer par `await import` garde leurs signatures réelles.
  let pool: pg.Pool;
  let products: typeof import('../products');
  let sales: typeof import('../sales');
  let purchases: typeof import('../purchases');
  let accounts: typeof import('../accounts');
  let reports: typeof import('../reports');
  let expenses: typeof import('../expenses');
  let history: typeof import('../history');
  let cash: typeof import('../cash');

  const OWNER: Session = {
    userId: 'usr_owner',
    businessId: 'biz_a',
    role: 'OWNER',
    name: 'Propriétaire',
  };
  const RIVAL: Session = {
    userId: 'usr_rival',
    businessId: 'biz_b',
    role: 'OWNER',
    name: 'Concurrent',
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = CONNECTION;
    pool = new pg.Pool({ connectionString: CONNECTION });
    await pool.query(readFileSync(resolve(process.cwd(), 'schema.sql'), 'utf8'));

    products = await import('../products');
    sales = await import('../sales');
    purchases = await import('../purchases');
    accounts = await import('../accounts');
    reports = await import('../reports');
    expenses = await import('../expenses');
    history = await import('../history');
    cash = await import('../cash');
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    // TRUNCATE … CASCADE remet les tables à zéro d'un coup : chaque test part
    // d'une boutique vierge, sans dépendre de l'ordre d'exécution.
    await pool.query(`
      TRUNCATE users, businesses, business_members, refresh_tokens, counters, login_attempts,
        products, product_units, customers, suppliers, sales, sale_items, payments,
        out_of_stock_sales, purchase_orders, purchase_order_items,
        purchase_receipts, purchase_receipt_items, stock_movements, documents, expenses
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

  const stockOf = async (id: string): Promise<number> => {
    const { rows } = await pool.query<{ q: number }>(
      'SELECT stock_quantity::float8 AS q FROM products WHERE id = $1',
      [id]
    );
    return rows[0]!.q;
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
    const carton = vitre.units.find((unit) => unit.factor === 40)!;

    const sale = await sales.createSale(OWNER, {
      lines: [
        { productId: vitre.id, unitId: carton.id, quantity: 1 },
        { productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 5 },
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
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 10 }],
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
        lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 31 }],
      })
    ).rejects.toThrow(/stock insuffisant/i);

    // Le point important : la transaction entière a été annulée.
    expect(await stockOf(vitre.id)).toBe(30);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM sales');
    expect(rows[0]!.n).toBe(0);
  });

  it('ne consomme aucun numéro de facture quand la vente est refusée', async () => {
    const vitre = await seedVitre(30);
    const carton = vitre.units.find((unit) => unit.factor === 40)!;

    // Trois tentatives impossibles : un carton de 40 pour 30 pièces en stock.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        sales.createSale(OWNER, {
          lines: [{ productId: vitre.id, unitId: carton.id, quantity: 1 }],
        })
      ).rejects.toThrow(/stock insuffisant/i);
    }

    const first = await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 1 }],
    });

    // Une facture est une pièce comptable : sa séquence ne doit pas commencer
    // au numéro 4 sous prétexte que trois ventes ont échoué avant elle.
    expect(first.reference).toBe('VE-0001');
    expect(first.invoice_reference).toMatch(/^FA-\d{4}-0001$/);

    const { rows } = await pool.query('SELECT kind, value FROM counters ORDER BY kind');
    expect(rows.every((row) => row.value === 1)).toBe(true);
  });

  it('refuse un produit appartenant à une autre quincaillerie', async () => {
    const vitre = await seedVitre();
    await expect(
      sales.createSale(RIVAL, {
        lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 1 }],
      })
    ).rejects.toThrow(/introuvable/i);
  });

  it('annule une vente : le stock revient, la vente reste dans l’historique', async () => {
    const vitre = await seedVitre();
    const carton = vitre.units.find((unit) => unit.factor === 40)!;
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
      items: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 400, unitCost: 320 }],
    });

    expect(order.status).toBe('DRAFT');
    expect(order.total_estimated).toBe(128000);
    expect(await stockOf(vitre.id)).toBe(80);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM stock_movements WHERE type = 'PURCHASE_RECEIPT'"
    );
    expect(rows[0]!.n).toBe(0);
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
      items: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 400, unitCost: 320 }],
    });

    order = await purchases.receivePurchaseOrder(OWNER, order.id, {
      lines: [{ itemId: order.items[0]!.id, quantity: 150 }],
    });
    expect(order.status).toBe('PARTIALLY_RECEIVED');
    expect(await stockOf(vitre.id)).toBe(250);

    order = await purchases.receivePurchaseOrder(OWNER, order.id, {
      lines: [{ itemId: order.items[0]!.id, quantity: 250 }],
    });
    expect(order.status).toBe('RECEIVED');
    expect(await stockOf(vitre.id)).toBe(500);

    // (100×300 + 400×320) / 500 = 316, et non 320.
    const { rows } = await pool.query(
      'SELECT purchase_price::float8 AS cost FROM products WHERE id = $1',
      [vitre.id]
    );
    expect(rows[0]!.cost).toBe(316);

    await expect(
      purchases.receivePurchaseOrder(OWNER, order.id, {
        lines: [{ itemId: order.items[0]!.id, quantity: 1 }],
      })
    ).rejects.toThrow(/plus de .* qu'il n'en reste/i);
  });

  it('cumule les lignes visant la même ligne de commande avant de les vérifier', async () => {
    const vitre = await products.createProduct(OWNER, {
      name: 'Vitre 60 cm',
      baseUnit: 'pièce',
      purchasePrice: 300,
      sellingPrice: 450,
      stockQuantity: 0,
      units: [],
    });
    await pool.query(
      "INSERT INTO suppliers (id, business_id, name) VALUES ('sup_1', $1, 'Bâtir Plus')",
      [OWNER.businessId]
    );
    const order = await purchases.createPurchaseOrder(OWNER, {
      supplierId: 'sup_1',
      items: [{ productId: vitre.id, quantity: 50, unitCost: 320 }],
    });
    const itemId = order.items[0]!.id;

    // 30 et 30 passent chacun isolément : c'est leur somme qui dépasse. Le
    // message doit rester métier, et non la contrainte remontée telle quelle.
    await expect(
      purchases.receivePurchaseOrder(OWNER, order.id, {
        lines: [
          { itemId, quantity: 30 },
          { itemId, quantity: 30 },
        ],
      })
    ).rejects.toThrow(/reste à livrer/i);
    expect(await stockOf(vitre.id)).toBe(0);

    // Cumulées jusqu'au reliquat exact, les deux mêmes lignes sont acceptées.
    const received = await purchases.receivePurchaseOrder(OWNER, order.id, {
      lines: [
        { itemId, quantity: 30 },
        { itemId, quantity: 20 },
      ],
    });
    expect(received.status).toBe('RECEIVED');
    expect(await stockOf(vitre.id)).toBe(50);
  });

  // ───────────────────────────── Hors stock ────────────────────────────

  it('reprend le nom du client désigné et refuse celui d’une autre boutique', async () => {
    const outOfStock = await import('../outOfStock');
    await pool.query(
      `INSERT INTO customers (id, business_id, name) VALUES
         ('cus_a', $1, 'Entreprise Sodji BTP'), ('cus_b', $2, 'Client de la rivale')`,
      [OWNER.businessId, RIVAL.businessId]
    );

    // Le nom vient du carnet, jamais du navigateur : sans cela l'opération
    // portait « Client comptoir » et la recherche par client ne la trouvait pas.
    const designe = await outOfStock.createOutOfStockSale(OWNER, {
      productName: 'Groupe 3 kVA',
      customerId: 'cus_a',
      customerName: 'nom que le navigateur aurait pu inventer',
      quantity: 1,
      costPrice: 185000,
      sellingPrice: 225000,
    });
    expect(designe.customer_name).toBe('Entreprise Sodji BTP');
    await expect(
      outOfStock.listOutOfStockSales(OWNER.businessId, { search: 'Sodji' })
    ).resolves.toHaveLength(1);

    // Sans client désigné, le nom libre — puis « Client comptoir ».
    const libre = await outOfStock.createOutOfStockSale(OWNER, {
      productName: 'Groupe 3 kVA',
      customerName: 'Kodjo menuisier',
      quantity: 1,
      costPrice: 100,
      sellingPrice: 200,
    });
    expect(libre.customer_name).toBe('Kodjo menuisier');

    // Le client d'une autre quincaillerie est rejeté, comme sur une vente (§29).
    await expect(
      outOfStock.createOutOfStockSale(OWNER, {
        productName: 'Groupe 3 kVA',
        customerId: 'cus_b',
        quantity: 1,
        costPrice: 100,
        sellingPrice: 200,
      })
    ).rejects.toThrow(/client introuvable/i);
    await expect(
      sales.createSale(OWNER, {
        customerId: 'cus_b',
        lines: [{ productId: (await seedVitre()).id, quantity: 1 }],
      })
    ).rejects.toThrow(/client introuvable/i);
  });

  it('ne touche pas au stock et ne franchit qu’une étape à la fois', async () => {
    const outOfStock = await import('../outOfStock');
    const vitre = await seedVitre(0);

    const operation = await outOfStock.createOutOfStockSale(OWNER, {
      productId: vitre.id,
      quantity: 3,
      costPrice: 6800,
      sellingPrice: 9500,
      otherSeller: 'Quincaillerie Adjogbé',
    });

    // 3 × (9 500 − 6 800) = 8 100, et le produit n'entre jamais en stock.
    expect(operation.gross_margin).toBe(8100);
    expect(await stockOf(vitre.id)).toBe(0);
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM stock_movements WHERE type <> 'ADJUSTMENT'"
    );
    expect(rows[0]!.n).toBe(0);

    await expect(
      outOfStock.advanceOutOfStockSale(OWNER, operation.id, { status: 'COMPLETED' })
    ).rejects.toThrow(/ne peut pas suivre/i);

    let current = operation;
    for (const status of ['SOURCED', 'CUSTOMER_PAID', 'SELLER_PAID', 'COMPLETED']) {
      current = await outOfStock.advanceOutOfStockSale(OWNER, operation.id, { status });
      expect(current.status).toBe(status);
    }
    await expect(
      outOfStock.advanceOutOfStockSale(OWNER, operation.id, { status: 'CANCELLED' })
    ).rejects.toThrow(/ne peut pas suivre/i);
  });

  // ────────────────────────────── Comptes ──────────────────────────────

  it('crée un vendeur, borne ses droits, et garde ses ventes après son départ', async () => {
    const members = await import('../members');
    const vendeur = await members.addSeller(OWNER, {
      name: 'Ama Doe',
      email: 'ama@test.tg',
      password: 'comptoir2026',
    });
    expect(vendeur.role).toBe('SELLER');

    // Un compte n'appartient qu'à une boutique : réutiliser une adresse déjà
    // connue rattacherait quelqu'un à deux quincailleries à son insu.
    await expect(
      members.addSeller(OWNER, { name: 'Autre', email: 'ama@test.tg', password: 'comptoir2026' })
    ).rejects.toThrow(/existe déjà/i);

    const SELLER: Session = {
      userId: vendeur.id,
      businessId: OWNER.businessId,
      role: 'SELLER',
      name: vendeur.name,
    };
    const vitre = await seedVitre();
    const vente = await sales.createSale(SELLER, {
      lines: [{ productId: vitre.id, quantity: 2 }],
    });
    expect(vente.reference).toBe('VE-0001');

    // Le propriétaire ne peut pas se retirer : la boutique resterait sans chef.
    const liste = await members.listMembers(OWNER.businessId);
    const patron = liste.find((row) => row.role === 'OWNER')!;
    await expect(members.removeMember(OWNER, patron.id)).rejects.toThrow(
      /ne peut pas être retiré/i
    );

    // Partir ferme l'accès, mais l'historique doit continuer de dire qui a
    // encaissé : seul le lien d'appartenance est rompu.
    await members.removeMember(OWNER, vendeur.id);
    await expect(
      accounts.authenticate({ identifier: 'ama@test.tg', password: 'comptoir2026' })
    ).rejects.toThrow(/incorrect/i);
    const { rows } = await pool.query('SELECT user_id FROM sales');
    expect(rows).toEqual([{ user_id: vendeur.id }]);
  });

  it('laisse le propriétaire réattribuer le mot de passe d’un vendeur, pas le sien', async () => {
    const members = await import('../members');
    const vendeur = await members.addSeller(OWNER, {
      name: 'Ama Doe',
      email: 'ama@test.tg',
      password: 'comptoir2026',
    });

    expect(vendeur.role).toBe('SELLER');

    const liste = await members.listMembers(OWNER.businessId);
    expect(liste.map((row) => row.role)).toEqual(['OWNER', 'SELLER']);

    // Un vendeur n'est pas le gardien de son propre mot de passe côté équipe :
    // seul le propriétaire le réattribue, et jamais le sien par ce chemin.
    const patron = liste.find((row) => row.role === 'OWNER')!;
    await expect(
      members.resetMemberPassword(OWNER, patron.id, { password: 'contourne2026' })
    ).rejects.toThrow(/depuis ses paramètres/i);

    await members.resetMemberPassword(OWNER, vendeur.id, { password: 'nouveau-comptoir' });
    await expect(
      accounts.authenticate({ identifier: 'ama@test.tg', password: 'comptoir2026' })
    ).rejects.toThrow(/incorrect/i);
    await expect(
      accounts.authenticate({ identifier: 'ama@test.tg', password: 'nouveau-comptoir' })
    ).resolves.toMatchObject({ role: 'SELLER' });
  });

  it('change le mot de passe et ferme les autres sessions', async () => {
    const auth = await import('../../lib/auth');
    const created = await accounts.register({
      ownerName: 'Kossi',
      businessName: 'Le Bâtisseur',
      email: 'change@test.tg',
      password: 'batisseur2026',
    });
    const session: Session = {
      userId: created.userId,
      businessId: created.businessId,
      role: 'OWNER',
      name: 'Test',
    };

    // Deux sessions ouvertes : le téléphone du comptoir et celui de la maison.
    const comptoir = await auth.issueRefreshToken(created.userId, created.businessId);
    const maison = await auth.issueRefreshToken(created.userId, created.businessId);

    await expect(
      accounts.changePassword(session, { currentPassword: 'faux', newPassword: 'nouveau2026' })
    ).rejects.toThrow(/actuel incorrect/i);
    await expect(
      accounts.changePassword(session, {
        currentPassword: 'batisseur2026',
        newPassword: 'court',
      })
    ).rejects.toThrow(/8 caractères/i);

    await accounts.changePassword(session, {
      currentPassword: 'batisseur2026',
      newPassword: 'nouveau-secret-2026',
    });

    // Changer son mot de passe, c'est souvent le soupçonner connu : les jetons
    // déjà distribués ne doivent pas survivre au geste.
    await expect(auth.rotateRefreshToken(comptoir)).resolves.toBeNull();
    await expect(auth.rotateRefreshToken(maison)).resolves.toBeNull();

    await expect(
      accounts.authenticate({ identifier: 'change@test.tg', password: 'batisseur2026' })
    ).rejects.toThrow(/incorrect/i);
    await expect(
      accounts.authenticate({ identifier: 'change@test.tg', password: 'nouveau-secret-2026' })
    ).resolves.toMatchObject({ businessId: created.businessId });
  });

  it('freine les essais de mot de passe sans enfermer dehors le commerçant', async () => {
    const { guardLogin, recordFailedLogin } = await import('../../lib/throttle');
    const headers = (ip: string) => ({ headers: { get: () => ip } });
    const attaquant = headers('203.0.113.7');
    const boutique = headers('198.51.100.2');

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await guardLogin('kossi@test.tg', attaquant);
      await recordFailedLogin('kossi@test.tg', attaquant);
    }

    await expect(guardLogin('kossi@test.tg', attaquant)).rejects.toThrow(/trop de tentatives/i);

    // Le commerçant, depuis sa propre adresse, n'est pas concerné : verrouiller
    // un compte à distance reviendrait à pouvoir fermer la boutique.
    await expect(guardLogin('kossi@test.tg', boutique)).resolves.toBeUndefined();

    // Un autre compte visé depuis l'adresse de l'attaquant reste possible tant
    // que le quota par adresse n'est pas atteint : c'est une portée distincte.
    await expect(guardLogin('autre@test.tg', attaquant)).resolves.toBeUndefined();
  });

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
  // ───────────────────── Rapports financiers (§39) ─────────────────────

  /** Le rapport « tout » : aucune borne, donc rien ne peut tomber hors période. */
  const fullReport = () => reports.financialReport(OWNER.businessId, {});

  it('mène du chiffre d’affaires au bénéfice net, dépenses déduites', async () => {
    const vitre = await seedVitre();
    const carton = vitre.units.find((unit) => unit.factor === 40)!;

    // La vente du §11 : un carton + 5 pièces = 19 250, coût 14 343,75.
    await sales.createSale(OWNER, {
      lines: [
        { productId: vitre.id, unitId: carton.id, quantity: 1 },
        { productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 5 },
      ],
    });

    const before = await fullReport();
    expect(before.totals.revenue).toBe(19250);
    expect(before.totals.costOfGoods).toBeCloseTo(14343.75, 2);
    expect(before.totals.grossMargin).toBeCloseTo(4906.25, 2);
    // Sans dépense saisie, le bénéfice net *est* la marge brute — et l'écran doit
    // le dire plutôt que laisser croire (§39).
    expect(before.expenseCount).toBe(0);
    expect(before.totals.netProfit).toBe(before.totals.grossMargin);

    await expenses.createExpense(OWNER, {
      category: 'TRANSPORT',
      label: 'Taxi-bagages livraison',
      amount: 1500,
    });
    await expenses.createExpense(OWNER, {
      category: 'RENT',
      label: 'Loyer du mois',
      amount: 2000,
    });

    const after = await fullReport();
    // Une dépense fait baisser le bénéfice net du même montant, et lui seul : le
    // chiffre d'affaires et la marge brute ne bougent pas d'un franc.
    expect(after.totals.revenue).toBe(before.totals.revenue);
    expect(after.totals.grossMargin).toBeCloseTo(before.totals.grossMargin, 2);
    expect(after.totals.expenses).toBe(3500);
    expect(after.expenseCount).toBe(2);
    expect(after.totals.netProfit).toBeCloseTo(before.totals.grossMargin - 3500, 2);
    expect(after.expensesByCategory.map((bucket) => bucket.category).sort()).toEqual([
      'RENT',
      'TRANSPORT',
    ]);
  });

  it('exclut une vente annulée de tous les totaux', async () => {
    const vitre = await seedVitre();
    const gardee = await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 4 }],
    });
    const annulee = await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 10 }],
    });
    await sales.cancelSale(OWNER, annulee.id, 'Erreur de saisie');

    const report = await fullReport();
    // 4 × 450 : la vente annulée reste dans l'historique (§25) mais un chiffre
    // d'affaires qui l'inclurait ne se retrouverait pas en caisse.
    expect(report.totals.revenue).toBe(gardee.total);
    expect(report.salesCount).toBe(1);
    expect(report.products).toHaveLength(1);
    expect(report.products[0]!.quantity).toBe(4);
  });

  it('répartit la remise : la somme des produits égale le chiffre d’affaires', async () => {
    const vitre = await seedVitre();
    const carton = vitre.units.find((unit) => unit.factor === 40)!;
    const serrure = await products.createProduct(OWNER, {
      name: 'Serrure porte',
      baseUnit: 'pièce',
      purchasePrice: 3400,
      sellingPrice: 5000,
      stockQuantity: 10,
    });

    // Sous-total 17 000 + 15 000 = 32 000, remise 3 200 → encaissé 28 800.
    const sale = await sales.createSale(OWNER, {
      lines: [
        { productId: vitre.id, unitId: carton.id, quantity: 1 },
        { productId: serrure.id, unitId: serrure.units[0]!.id, quantity: 3 },
      ],
      discount: 3200,
    });
    expect(sale.total).toBe(28800);

    const report = await fullReport();
    const sum = report.products.reduce((acc, product) => acc + product.revenue, 0);
    // L'invariant du §39 : imputer la remise à une seule ligne fausserait sa
    // rentabilité, l'ignorer ferait dépasser le chiffre d'affaires encaissé.
    expect(sum).toBeCloseTo(report.totals.revenue, 2);
    expect(sum).toBeCloseTo(28800, 2);

    const vitreLine = report.products.find((product) => product.productId === vitre.id)!;
    // 17 000 × 0,9 = 15 300, et le coût reste celui figé à la vente : 12 750.
    expect(vitreLine.revenue).toBeCloseTo(15300, 2);
    expect(vitreLine.cost).toBeCloseTo(12750, 2);
    expect(vitreLine.quantity).toBe(40);
  });

  it('garde le coût figé à la vente quand le prix d’achat monte ensuite', async () => {
    const vitre = await seedVitre();
    await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 10 }],
    });

    const avant = await fullReport();
    expect(avant.products[0]!.cost).toBeCloseTo(3187.5, 2);

    // Le fournisseur double son prix : la marge d'hier ne doit pas être réécrite.
    await pool.query('UPDATE products SET purchase_price = 700 WHERE id = $1', [vitre.id]);

    const apres = await fullReport();
    expect(apres.products[0]!.cost).toBeCloseTo(3187.5, 2);
    expect(apres.totals.grossMargin).toBeCloseTo(avant.totals.grossMargin, 2);
  });

  it('rattache une vente hors stock à son produit sans la compter en stock', async () => {
    const outOfStock = await import('../outOfStock');
    const vitre = await seedVitre(0);
    await outOfStock.createOutOfStockSale(OWNER, {
      productId: vitre.id,
      quantity: 3,
      costPrice: 6800,
      sellingPrice: 9500,
    });

    const report = await fullReport();
    expect(report.totals.salesRevenue).toBe(0);
    expect(report.totals.outOfStockRevenue).toBe(28500);
    expect(report.totals.grossMargin).toBe(8100);

    const line = report.products[0]!;
    // La quantité hors stock est comptée à part : l'article n'est jamais entré en
    // stock, sa quantité n'est donc pas exprimée en unité de base (§39).
    expect(line.quantity).toBe(0);
    expect(line.outOfStockQuantity).toBe(3);
    expect(line.margin).toBe(8100);
  });

  it('reconstitue le total : la somme des tranches égale le chiffre d’affaires', async () => {
    const vitre = await seedVitre();
    await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 4 }],
    });
    await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 6 }],
    });

    const { from, to, fromDate, toDate } = history.periodBounds('30d');
    const report = await reports.financialReport(OWNER.businessId, { from, to, fromDate, toDate });

    expect(report.granularity).toBe('day');
    const sum = report.buckets.reduce((acc, bucket) => acc + bucket.revenue, 0);
    expect(sum).toBeCloseTo(report.totals.revenue, 2);
    expect(report.buckets.reduce((acc, bucket) => acc + bucket.salesCount, 0)).toBe(2);
  });

  it('ne laisse passer aucune ligne d’une autre quincaillerie', async () => {
    const vitre = await seedVitre();
    await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 4 }],
    });
    await expenses.createExpense(OWNER, { category: 'RENT', label: 'Loyer', amount: 50000 });

    const chezLeVoisin = await reports.financialReport(RIVAL.businessId, {});
    expect(chezLeVoisin.totals.revenue).toBe(0);
    expect(chezLeVoisin.totals.expenses).toBe(0);
    expect(chezLeVoisin.products).toHaveLength(0);
    expect(chezLeVoisin.buckets).toHaveLength(0);
    await expect(expenses.listExpenses(RIVAL.businessId)).resolves.toHaveLength(0);
  });

  it('borne les dépenses sur le jour de la sortie d’argent, pas celui de la saisie', async () => {
    // Le gérant note ce matin le transport de l'avant-veille : la dépense doit
    // peser sur l'avant-veille (§39).
    const avantHier = new Date();
    avantHier.setDate(avantHier.getDate() - 2);
    const cle = avantHier.toISOString().slice(0, 10);

    await expenses.createExpense(OWNER, {
      category: 'TRANSPORT',
      label: 'Taxi-bagages de mardi',
      amount: 1200,
      spentOn: cle,
    });
    await expenses.createExpense(OWNER, {
      category: 'TRANSPORT',
      label: 'Taxi-bagages du jour',
      amount: 800,
    });

    const aujourdhui = history.periodBounds('today');
    const surLaSemaine = history.periodBounds('7d');

    const dujour = await reports.financialReport(OWNER.businessId, aujourdhui);
    expect(dujour.totals.expenses).toBe(800);

    const semaine = await reports.financialReport(OWNER.businessId, surLaSemaine);
    expect(semaine.totals.expenses).toBe(2000);
  });

  it('corrige et supprime une dépense, sans toucher à celle du voisin', async () => {
    const depense = await expenses.createExpense(OWNER, {
      category: 'OTHER',
      label: 'Saisie approximative',
      amount: 9999,
    });

    const corrigee = await expenses.updateExpense(OWNER, depense.id, {
      category: 'SALARY',
      label: 'Salaire Kossi',
      amount: 25000,
    });
    expect(corrigee.category).toBe('SALARY');
    expect(corrigee.amount).toBe(25000);

    await expect(
      expenses.updateExpense(RIVAL, depense.id, {
        category: 'SALARY',
        label: 'Détournement',
        amount: 1,
      })
    ).rejects.toThrow(/introuvable/i);
    await expect(expenses.deleteExpense(RIVAL, depense.id)).rejects.toThrow(/introuvable/i);

    await expenses.deleteExpense(OWNER, depense.id);
    await expect(expenses.listExpenses(OWNER.businessId)).resolves.toHaveLength(0);
    expect((await fullReport()).totals.expenses).toBe(0);
  });

  it('refuse un poste de dépense inventé', async () => {
    await expect(
      expenses.createExpense(OWNER, { category: 'CRYPTO', label: 'Bitcoin', amount: 1 })
    ).rejects.toThrow(/poste de dépense/i);
  });
  // ────────────────────── Journal de caisse (§40) ──────────────────────

  it('mêle encaissements et dépenses, et boucle son solde', async () => {
    const vitre = await seedVitre();
    // Une vente payée pour moitié : le tiroir n'a vu que la moitié.
    await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 10 }],
      amountPaid: 2000,
    });
    await expenses.createExpense(OWNER, {
      category: 'RENT',
      label: 'Loyer de septembre',
      amount: 1200,
    });

    const journal = await cash.cashJournal(OWNER.businessId, {});

    // L'entrée est l'encaissement, non le montant de la vente : 2 000, pas 4 500.
    expect(journal.cashIn).toBe(2000);
    expect(journal.cashOut).toBe(1200);
    expect(journal.balance).toBe(800);
    // Le critère 2 du §40 : entrées − sorties = solde, à la ligne près.
    expect(journal.cashIn - journal.cashOut).toBe(journal.balance);
    expect(journal.entries).toHaveLength(2);
    // La ligne la plus récente porte le solde de la période entière.
    expect(journal.entries[0]!.balance).toBe(journal.balance);
  });

  it('ne compte pas l’encaissement d’une vente annulée', async () => {
    const vitre = await seedVitre();
    const gardee = await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 4 }],
    });
    const annulee = await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 10 }],
    });
    await sales.cancelSale(OWNER, annulee.id, 'Le client a changé d’avis');

    const journal = await cash.cashJournal(OWNER.businessId, {});
    // L'argent est revenu au client : le compter gonflerait une caisse
    // introuvable (§25, §40).
    expect(journal.cashIn).toBe(gardee.total);
    expect(journal.entries).toHaveLength(1);
    expect(journal.entries[0]!.reference).toBe(gardee.reference);
  });

  it('traduit le moyen de paiement et le poste, jamais un code brut', async () => {
    const vitre = await seedVitre();
    await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 2 }],
      paymentMethod: 'MOBILE_MONEY',
    });
    await expenses.createExpense(OWNER, {
      category: 'UTILITIES',
      label: 'Facture CEET',
      amount: 9000,
    });

    const journal = await cash.cashJournal(OWNER.businessId, {});
    const details = journal.entries
      .map((entry) => entry.detail)
      .sort((a, b) => a.localeCompare(b, 'fr'));
    expect(details).toEqual(['Énergie et eau', 'Mobile Money']);
  });

  it('filtre un sens sans changer les totaux de la période', async () => {
    const vitre = await seedVitre();
    await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 4 }],
    });
    await expenses.createExpense(OWNER, { category: 'SALARY', label: 'Paie', amount: 500 });

    const sorties = await cash.cashJournal(OWNER.businessId, { direction: 'OUT' });
    expect(sorties.entries.every((entry) => entry.direction === 'OUT')).toBe(true);
    // Le solde de la période ne doit pas dépendre de ce que l'écran affiche.
    expect(sorties.cashIn).toBe(1800);
    expect(sorties.balance).toBe(1300);
  });

  it('ne laisse voir à personne la caisse d’une autre quincaillerie', async () => {
    const vitre = await seedVitre();
    await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 4 }],
    });
    await expenses.createExpense(OWNER, { category: 'RENT', label: 'Loyer', amount: 50000 });

    const voisin = await cash.cashJournal(RIVAL.businessId, {});
    expect(voisin.cashIn).toBe(0);
    expect(voisin.cashOut).toBe(0);
    expect(voisin.entries).toHaveLength(0);
  });

  it('fait sortir l’achat de stock de la caisse sans toucher au bénéfice', async () => {
    const vitre = await seedVitre();
    await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 10 }],
    });
    const avant = await fullReport();

    await expenses.createExpense(OWNER, {
      category: 'STOCK_PURCHASE',
      label: 'Ciment payé comptant au grossiste',
      amount: 200000,
    });

    const apres = await fullReport();
    // Le critère 4 du §40 : la marchandise est déjà comptée à son coût le jour
    // où elle est vendue ; la retirer ici ferait apparaître une perte inventée.
    expect(apres.totals.netProfit).toBe(avant.totals.netProfit);
    expect(apres.totals.operatingExpenses).toBe(0);
    expect(apres.totals.stockPurchases).toBe(200000);
    expect(apres.totals.expenses).toBe(200000);

    // La caisse, elle, l'a bien vu partir.
    const journal = await cash.cashJournal(OWNER.businessId, {});
    expect(journal.cashOut).toBe(200000);
  });

  // ──────────────────── Justificatifs de dépense (§40) ─────────────────

  /** Le plus petit JPEG qui soit une vraie image, pour ne pas peser sur le test. */
  const PHOTO = `data:image/jpeg;base64,${'A'.repeat(64)}`;

  it('joint, remplace et supprime le reçu d’une dépense', async () => {
    const depense = await expenses.createExpense(OWNER, {
      category: 'TRANSPORT',
      label: 'Tricycle de livraison',
      amount: 3000,
    });
    expect(depense.has_receipt).toBe(false);

    await expenses.attachReceipt(OWNER, depense.id, { image: PHOTO, name: 'recu.jpg' });
    const [avecRecu] = await expenses.listExpenses(OWNER.businessId);
    expect(avecRecu!.has_receipt).toBe(true);
    expect((await expenses.getReceipt(OWNER.businessId, depense.id)).url).toBe(PHOTO);

    // Un second envoi remplace le premier : trois photos du même reçu
    // s'accumuleraient sans qu'aucun écran ne sache laquelle montrer.
    const autre = `data:image/png;base64,${'B'.repeat(64)}`;
    await expenses.attachReceipt(OWNER, depense.id, { image: autre, name: 'mieux.png' });
    const { rows: pieces } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM documents WHERE reference_type = 'EXPENSE'"
    );
    expect(pieces[0]!.n).toBe(1);
    expect((await expenses.getReceipt(OWNER.businessId, depense.id)).name).toBe('mieux.png');

    await expenses.deleteReceipt(OWNER, depense.id);
    await expect(expenses.getReceipt(OWNER.businessId, depense.id)).rejects.toThrow(
      /aucun justificatif/i
    );
    const [sansRecu] = await expenses.listExpenses(OWNER.businessId);
    expect(sansRecu!.has_receipt).toBe(false);
  });

  it('refuse ce qui n’est pas une photo, et ce qui est trop lourd', async () => {
    const depense = await expenses.createExpense(OWNER, {
      category: 'OTHER',
      label: 'Divers',
      amount: 500,
    });

    await expect(
      expenses.attachReceipt(OWNER, depense.id, { image: 'data:text/html,<script>' })
    ).rejects.toThrow(/photo/i);
    await expect(expenses.attachReceipt(OWNER, depense.id, { image: '' })).rejects.toThrow(
      /aucune image/i
    );
    await expect(
      expenses.attachReceipt(OWNER, depense.id, {
        image: `data:image/jpeg;base64,${'A'.repeat(700_000)}`,
      })
    ).rejects.toThrow(/trop lourde/i);
  });

  it('ne laisse pas le voisin lire ni joindre un justificatif', async () => {
    const depense = await expenses.createExpense(OWNER, {
      category: 'RENT',
      label: 'Loyer',
      amount: 40000,
    });
    await expenses.attachReceipt(OWNER, depense.id, { image: PHOTO });

    await expect(expenses.getReceipt(RIVAL.businessId, depense.id)).rejects.toThrow(/introuvable/i);
    await expect(expenses.attachReceipt(RIVAL, depense.id, { image: PHOTO })).rejects.toThrow(
      /introuvable/i
    );
    await expect(expenses.deleteReceipt(RIVAL, depense.id)).rejects.toThrow(/introuvable/i);
  });

  it('emporte le justificatif quand la dépense est supprimée', async () => {
    const depense = await expenses.createExpense(OWNER, {
      category: 'OTHER',
      label: 'Erreur de saisie',
      amount: 100,
    });
    await expenses.attachReceipt(OWNER, depense.id, { image: PHOTO });
    await expenses.deleteExpense(OWNER, depense.id);

    // La pièce jointe ne référence pas la dépense en base : sans ce nettoyage
    // elle resterait orpheline, et repeuplerait `has_receipt` d'une dépense
    // portant par hasard le même identifiant.
    const { rows } = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM documents WHERE reference_type = 'EXPENSE'"
    );
    expect(rows[0]!.n).toBe(0);
  });
});
