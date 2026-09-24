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
    const sync = await import('../sync');
    await sync.closeSyncPool();
    await pool?.end();
  });

  beforeEach(async () => {
    // TRUNCATE … CASCADE remet les 19 tables à zéro d'un coup : chaque test part
    // d'une boutique vierge, sans dépendre de l'ordre d'exécution.
    await pool.query(`
      TRUNCATE users, businesses, business_members, refresh_tokens, counters, login_attempts,
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

  it('ne consomme aucun numéro de facture quand la vente est refusée', async () => {
    const vitre = await seedVitre(30);
    const carton = vitre.units.find((unit) => unit.factor === 40);

    // Trois tentatives impossibles : un carton de 40 pour 30 pièces en stock.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        sales.createSale(OWNER, {
          lines: [{ productId: vitre.id, unitId: carton.id, quantity: 1 }],
        })
      ).rejects.toThrow(/stock insuffisant/i);
    }

    const first = await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0].id, quantity: 1 }],
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
    const itemId = order.items[0].id;

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
    expect(rows[0].n).toBe(0);

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

    const SELLER = { userId: vendeur.id, businessId: OWNER.businessId, role: 'SELLER' };
    const vitre = await seedVitre();
    const vente = await sales.createSale(SELLER, {
      lines: [{ productId: vitre.id, quantity: 2 }],
    });
    expect(vente.reference).toBe('VE-0001');

    // Le propriétaire ne peut pas se retirer : la boutique resterait sans chef.
    const liste = await members.listMembers(OWNER.businessId);
    const patron = liste.find((row) => row.role === 'OWNER');
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
    const patron = liste.find((row) => row.role === 'OWNER');
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
    const session = { userId: created.userId, businessId: created.businessId, role: 'OWNER' };

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
    const headers = (ip) => ({ headers: { get: () => ip } });
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
  async function syncCommand(session, action, input) {
    const { syncSnapshot } = await import('../sync');
    const { expectedFor } = await import('../../local/syncProtocol');
    const snapshot = await syncSnapshot(session);
    return {
      id: crypto.randomUUID(),
      businessId: session.businessId,
      userId: session.userId,
      action,
      input,
      expected: expectedFor(snapshot.data, action, input),
    };
  }
  it('sync: charge le catalogue complet et les ventes existantes avec remise', async () => {
    const { syncSnapshot } = await import('../sync');
    const product = await seedVitre(80);
    await sales.createSale(OWNER, {
      lines: [{ productId: product.id, quantity: 2 }],
      discount: 50,
      paymentMethod: 'CASH',
    });
    const result = await syncSnapshot(OWNER);
    expect(result.data.products[0].stock).toBe(78);
    expect(result.data.sales[0].total).toBe(85000);
    expect(result.data.sales[0].discount).toBe(5000);
    expect(result.data.legacyOrders).toEqual([]);
    expect((await syncSnapshot(RIVAL)).data.products).toHaveLength(0);
  });
  it('sync: une vente répétée décrémente une seule fois le stock et apparaît dans les anciennes API', async () => {
    const { syncSnapshot, syncOperation } = await import('../sync');
    const product = await seedVitre(10);
    const op = await syncCommand(OWNER, 'sale', {
      lines: [{ productId: product.id, quantity: 2 }],
      method: 'Espèces',
      paid: '',
      date: '2026-09-23',
    });
    const first = await syncOperation(OWNER, op),
      second = await syncOperation(OWNER, op);
    expect(first.ack).toBe(op.id);
    expect(second.ack).toBe(op.id);
    expect(await stockOf(product.id)).toBe(8);
    expect(await sales.listSales(OWNER.businessId, {})).toHaveLength(1);
    expect((await syncSnapshot(OWNER)).data.sales).toHaveLength(1);
    await expect(syncOperation(OWNER, { ...op, input: { ...op.input, paid: 0 } })).rejects.toThrow(
      /identifiant/
    );
  });
  it('sync: deux appareils ne peuvent pas vendre le dernier article deux fois', async () => {
    const { syncOperation } = await import('../sync');
    const product = await seedVitre(1);
    const input = {
      lines: [{ productId: product.id, quantity: 1 }],
      method: 'Espèces',
      paid: '',
      date: '2026-09-23',
    };
    const a = await syncCommand(OWNER, 'sale', input),
      b = await syncCommand(OWNER, 'sale', input);
    const results = await Promise.allSettled([syncOperation(OWNER, a), syncOperation(OWNER, b)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stockOf(product.id)).toBe(0);
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM commerce_sync_operations')).rows[0].n
    ).toBe(1);
  });
  it('sync: refuse un prix périmé sans aucune écriture et revalide le rôle en base', async () => {
    const { syncOperation } = await import('../sync');
    const product = await seedVitre(10);
    const op = await syncCommand(OWNER, 'sale', {
      lines: [{ productId: product.id, quantity: 1 }],
      method: 'Espèces',
      paid: '',
    });
    await pool.query('UPDATE products SET selling_price=999 WHERE id=$1', [product.id]);
    await expect(syncOperation(OWNER, op)).rejects.toThrow(/changé/);
    expect(await stockOf(product.id)).toBe(10);
    const expense = await syncCommand(OWNER, 'expense', {
      amount: 1000,
      category: 'Divers',
      reason: 'Transport',
      method: 'Espèces',
    });
    await pool.query("UPDATE business_members SET role='SELLER' WHERE user_id=$1", [OWNER.userId]);
    await expect(syncOperation(OWNER, expense)).rejects.toThrow(/propriétaire/);
    expect(
      (await pool.query('SELECT count(*)::int AS n FROM commerce_sync_operations')).rows[0].n
    ).toBe(0);
  });
  it('sync: conserve crédits, remboursements, dépenses et champs supplémentaires en base', async () => {
    const { syncSnapshot, syncOperation } = await import('../sync');
    const product = await seedVitre(10);
    const contact = await syncCommand(OWNER, 'contact.save', {
      kind: 'customer',
      name: 'Client crédit',
      phone: '+22890123456',
      openingDebt: 0,
    });
    await syncOperation(OWNER, contact);
    await syncOperation(
      OWNER,
      await syncCommand(OWNER, 'sale', {
        lines: [{ productId: product.id, quantity: 2 }],
        contactId: contact.id,
        paid: 100,
        method: 'Espèces',
      })
    );
    await syncOperation(
      OWNER,
      await syncCommand(OWNER, 'payment', {
        kind: 'customer',
        contactId: contact.id,
        amount: 200,
        method: 'Mobile Money',
        reason: 'Versement',
      })
    );
    await syncOperation(
      OWNER,
      await syncCommand(OWNER, 'expense', {
        amount: 50,
        category: 'Divers',
        method: 'Espèces',
        reason: 'Transport',
        receipt: 'data:image/jpeg;base64,YWJj',
      })
    );
    const data = (await syncSnapshot(OWNER)).data;
    const { customerBalance, report } = await import('../../local/ledger');
    expect(customerBalance(data, contact.id)).toBe(60000);
    expect(data.customerPayments).toHaveLength(1);
    expect(data.expenses[0].receipt).toContain('YWJj');
    expect(report(data).incoming).toBe(30000);
  });
  it('sync: un achat reçu actualise coût et stock sans créer deux commandes', async () => {
    const { syncSnapshot, syncOperation } = await import('../sync');
    const product = await seedVitre(10);
    const contact = await syncCommand(OWNER, 'contact.save', {
      kind: 'supplier',
      name: 'Grossiste',
      phone: '',
      openingDebt: 0,
      contact: 'Kossi',
      sector: 'Matériaux',
    });
    await syncOperation(OWNER, contact);
    const purchase = await syncCommand(OWNER, 'purchase', {
      lines: [{ productId: product.id, quantity: 10, price: 500 }],
      contactId: contact.id,
      paid: 1000,
      method: 'Espèces',
    });
    await syncOperation(OWNER, purchase);
    await syncOperation(OWNER, purchase);
    const result = (await syncSnapshot(OWNER)).data;
    expect(result.products[0].stock).toBe(20);
    expect(result.products[0].cost).toBe(40938);
    expect(result.purchases).toHaveLength(1);
    expect(result.legacyOrders).toHaveLength(0);
    expect(result.suppliers[0].contact).toBe('Kossi');
    expect((await purchases.getPurchaseOrder(OWNER.businessId, purchase.id)).status).toBe(
      'RECEIVED'
    );
  });
  it('sync: rejette les identifiants d’une autre boutique et les membres révoqués', async () => {
    const { syncSnapshot, syncOperation } = await import('../sync');
    const product = await seedVitre(10);
    const op = await syncCommand(OWNER, 'sale', {
      lines: [{ productId: product.id, quantity: 1 }],
      method: 'Espèces',
      paid: '',
    });
    await expect(syncOperation(RIVAL, op)).rejects.toThrow();
    expect(await stockOf(product.id)).toBe(10);
    await pool.query('DELETE FROM business_members WHERE user_id=$1', [OWNER.userId]);
    await expect(syncSnapshot(OWNER)).rejects.toThrow(/accès/);
  });
});
