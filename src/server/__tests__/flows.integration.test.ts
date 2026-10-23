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
  const { createNeonOverPg: create } = await import('../../lib/postgres');
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
  let incomes: typeof import('../incomes');
  let credit: typeof import('../credit');
  let exports_: typeof import('../exports');
  let dashboard: typeof import('../dashboard');
  let history_: typeof import('../history');

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
    // Un secret de test, posé ici et nulle part ailleurs : le code de production
    // continue de refuser de démarrer sans le sien plutôt que d'en inventer un.
    process.env.JWT_SECRET ||= 'secret-de-test-quincaflow-32-caracteres-minimum';
    pool = new pg.Pool({ connectionString: CONNECTION });
    // Table rase avant d'appliquer le schéma. `CREATE TABLE IF NOT EXISTS` saute
    // une table existante sans regarder sa forme : une base de test laissée
    // d'une version précédente gardait l'ancienne table et faisait échouer les
    // tests sur une colonne manquante, loin de la cause. La base désignée par
    // TEST_DATABASE_URL est jetable — ces tests la vident déjà à chaque cas.
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public');
    await pool.query(readFileSync(resolve(process.cwd(), 'schema.sql'), 'utf8'));

    products = await import('../products');
    sales = await import('../sales');
    purchases = await import('../purchases');
    accounts = await import('../accounts');
    reports = await import('../reports');
    expenses = await import('../expenses');
    history = await import('../history');
    cash = await import('../cash');
    incomes = await import('../incomes');
    credit = await import('../credit');
    exports_ = await import('../exports');
    dashboard = await import('../dashboard');
    history_ = await import('../history');
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
        purchase_receipts, purchase_receipt_items, supplier_payments,
        stock_movements, documents, expenses, incomes
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

  /**
   * Un produit créé sans conditionnement ne se vend qu'à l'unité. S'il ne peut
   * plus en recevoir, le gérant qui écoule sa marchandise en gros est coincé —
   * c'est ce qui se passait sur le téléphone, faute d'écran de modification.
   */
  it('accepte un conditionnement ajouté après coup, et le rend à la vente', async () => {
    const brut = await products.createProduct(OWNER, {
      name: 'Tôle bac',
      baseUnit: 'feuille',
      purchasePrice: 5000,
      sellingPrice: 7000,
      stockQuantity: 60,
      lowStockThreshold: 5,
    });
    expect(brut.units.map((u) => u.label)).toEqual(['feuille']);

    const enrichi = await products.updateProduct(OWNER, brut.id, {
      name: 'Tôle bac',
      baseUnit: 'feuille',
      purchasePrice: 5000,
      sellingPrice: 7000,
      stockQuantity: 60,
      lowStockThreshold: 5,
      units: [{ label: 'paquet', factor: 10, price: 66000 }],
    });

    expect(enrichi.units.map((u) => u.label)).toEqual(['feuille', 'paquet']);
    const paquet = enrichi.units.find((u) => u.label === 'paquet')!;
    expect(paquet.factor).toBe(10);
    expect(paquet.price).toBe(66000);
    expect(paquet.isBase).toBe(false);

    // Et il sort bien dix feuilles du stock, pas une.
    await sales.createSale(OWNER, {
      lines: [{ productId: brut.id, unitId: paquet.id, quantity: 1 }],
      paymentMethod: 'CASH',
      amountPaid: 66000,
    });
    const apres = await products.getProduct(OWNER.businessId, brut.id);
    expect(apres.stock_quantity).toBe(50);
  });

  it('retire un conditionnement qu’on ne vend plus', async () => {
    const vitre = await seedVitre();
    const sans = await products.updateProduct(OWNER, vitre.id, {
      name: vitre.name,
      baseUnit: vitre.base_unit,
      purchasePrice: vitre.purchase_price,
      sellingPrice: vitre.selling_price,
      stockQuantity: vitre.stock_quantity,
      lowStockThreshold: vitre.low_stock_threshold,
      units: [],
    });
    expect(sans.units.map((u) => u.label)).toEqual(['pièce']);
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

  // ────────────────────── Exports et sauvegarde (§48) ──────────────────

  describe('exports comptables (§48)', () => {
    /** Une boutique avec un produit, un client, une vente à crédit. */
    async function seedExportable() {
      await pool.query(
        `INSERT INTO customers (id, business_id, name, phone) VALUES ('cus_e', $1, 'Afi; Dossou', '90 00 00 00')`,
        [OWNER.businessId]
      );
      const vitre = await seedVitre(80);
      await sales.createSale(OWNER, {
        customerId: 'cus_e',
        lines: [{ productId: vitre.id, quantity: 2 }],
        amountPaid: 400,
      });
      return vitre;
    }

    it('écrit un inventaire avec les marges et la valeur du stock', async () => {
      await seedExportable();
      const fichier = await exports_.EXPORTS.stocks(OWNER.businessId);
      const lignes = fichier
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n');

      expect(lignes[0]).toContain('Valeur au coût');
      // 78 pièces restantes × 318,75 d'achat, et × 450 de vente.
      expect(lignes[1]).toContain('24862,5');
      expect(lignes[1]).toContain('35100');
      // La marge unitaire : 450 − 318,75.
      expect(lignes[1]).toContain('131,25');
    });

    it('écrit une ligne de vente par article, avec son reste dû', async () => {
      await seedExportable();
      const lignes = (await exports_.EXPORTS.ventes(OWNER.businessId))
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n');

      expect(lignes).toHaveLength(2);
      expect(lignes[1]).toContain('Vitre 60 cm');
      // 2 × 450 = 900, dont 400 encaissés : 500 restent dus.
      expect(lignes[1]).toContain(';900;400;500;');
      expect(lignes[1]).toContain('Partiel');
    });

    it('protège une cellule qui contient le séparateur', async () => {
      await seedExportable();
      const fichier = await exports_.EXPORTS.clients(OWNER.businessId);
      // Le nom porte un point-virgule : sans guillemets, le fichier gagnerait
      // une colonne et le tableur décalerait tout le reste de la ligne.
      expect(fichier).toContain('"Afi; Dossou"');
    });

    it('chiffre la dette du client dans le fichier clients', async () => {
      await seedExportable();
      const lignes = (await exports_.EXPORTS.clients(OWNER.businessId))
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n');
      expect(lignes[1]).toContain(';900;500;1;');
    });

    it('ne laisse passer aucune ligne d’une autre quincaillerie', async () => {
      await seedExportable();
      const vide = await exports_.EXPORTS.ventes(RIVAL.businessId);
      expect(
        vide
          .replace(/^\uFEFF/, '')
          .trimEnd()
          .split('\r\n')
      ).toHaveLength(1);
    });

    it('sauvegarde tout, sans les mots de passe', async () => {
      await seedExportable();
      const sauvegarde = await exports_.backup(OWNER);

      expect(sauvegarde.format).toBe('maquincaillerie.sauvegarde');
      expect(sauvegarde.products).toHaveLength(1);
      expect(sauvegarde.sales).toHaveLength(1);
      expect(sauvegarde.saleItems).toHaveLength(1);
      expect(sauvegarde.payments).toHaveLength(1);
      expect(sauvegarde.customers).toHaveLength(1);
      expect(sauvegarde.stockMovements).toHaveLength(2);
      // Une sauvegarde se range dans un dossier « Téléchargements » : elle ne
      // doit pas transporter de quoi se connecter.
      expect(JSON.stringify(sauvegarde)).not.toContain('password_hash');
    });
  });

  // ────────────────────── Dettes fournisseurs (§53) ────────────────────

  describe('dettes fournisseurs (§53)', () => {
    /** Une commande de 400 vitres à 320, livrée à hauteur de `recu`. */
    async function seedCommande(recu = 0) {
      const vitre = await seedVitre();
      await pool.query(
        "INSERT INTO suppliers (id, business_id, name) VALUES ('sup_1', $1, 'Bâtir Plus')",
        [OWNER.businessId]
      );
      let order = await purchases.createPurchaseOrder(OWNER, {
        supplierId: 'sup_1',
        items: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 400, unitCost: 320 }],
      });
      if (recu > 0) {
        order = await purchases.receivePurchaseOrder(OWNER, order.id, {
          lines: [{ itemId: order.items[0]!.id, quantity: recu }],
        });
      }
      return order;
    }

    it('ne doit rien sur une commande que personne n’a livrée', async () => {
      const order = await seedCommande();
      // 128 000 commandés, zéro arrivé : commander n'est pas devoir.
      expect(order.total_estimated).toBe(128000);
      expect(order.received).toBe(0);
      expect(order.balance).toBe(0);
      expect(await purchases.supplierDebts(OWNER.businessId)).toHaveLength(0);
    });

    it('ne doit que ce qui est arrivé', async () => {
      const order = await seedCommande(150);
      // 150 vitres à 320 : 48 000 dus, pas les 128 000 de la commande.
      expect(order.received).toBe(48000);
      expect(order.balance).toBe(48000);
    });

    it('refuse de régler une commande dont rien n’est livré', async () => {
      const order = await seedCommande();
      await expect(
        purchases.recordSupplierPayment(OWNER, order.id, { amount: 1000 })
      ).rejects.toThrow(/livré/i);
    });

    it('enregistre un acompte et laisse le reste dû', async () => {
      const commande = await seedCommande(150);
      const order = await purchases.recordSupplierPayment(OWNER, commande.id, {
        amount: 20000,
        method: 'MOBILE_MONEY',
        provider: 'FLOOZ',
        note: 'Acompte livraison',
      });

      expect(order.amount_paid).toBe(20000);
      expect(order.balance).toBe(28000);
      expect(order.payments).toHaveLength(1);
      expect(order.payments[0]).toMatchObject({
        amount: 20000,
        method: 'MOBILE_MONEY',
        provider: 'FLOOZ',
        note: 'Acompte livraison',
      });
    });

    it('cumule les règlements successifs', async () => {
      const commande = await seedCommande(150);
      await purchases.recordSupplierPayment(OWNER, commande.id, { amount: 20000 });
      const order = await purchases.recordSupplierPayment(OWNER, commande.id, { amount: 28000 });

      expect(order.amount_paid).toBe(48000);
      expect(order.balance).toBe(0);
      expect(order.payments).toHaveLength(2);
    });

    it('refuse un règlement qui dépasse le livré', async () => {
      const commande = await seedCommande(150);
      await expect(
        purchases.recordSupplierPayment(OWNER, commande.id, { amount: 48001 })
      ).rejects.toThrow(/dépasse/i);
    });

    it('refuse de régler deux fois la même commande soldée', async () => {
      const commande = await seedCommande(150);
      await purchases.recordSupplierPayment(OWNER, commande.id, { amount: 48000 });
      await expect(
        purchases.recordSupplierPayment(OWNER, commande.id, { amount: 1 })
      ).rejects.toThrow(/soldée/i);
    });

    it('refuse de régler une commande annulée', async () => {
      // Une commande déjà livrée ne peut plus être annulée : celle-ci est donc
      // annulée avant toute livraison, et c'est le seul cas qui existe.
      const commande = await seedCommande();
      await purchases.updatePurchaseOrderStatus(OWNER, commande.id, { status: 'CANCELLED' });
      await expect(
        purchases.recordSupplierPayment(OWNER, commande.id, { amount: 1000 })
      ).rejects.toThrow(/annulée/i);
    });

    it('regroupe la dette par fournisseur, pas par commande', async () => {
      const premiere = await seedCommande(150);
      await purchases.recordSupplierPayment(OWNER, premiere.id, { amount: 8000 });
      const vitre = (await products.listProducts(OWNER.businessId, {}))[0]!;
      const seconde = await purchases.createPurchaseOrder(OWNER, {
        supplierId: 'sup_1',
        items: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 100, unitCost: 300 }],
      });
      await purchases.receivePurchaseOrder(OWNER, seconde.id, {
        lines: [{ itemId: seconde.items[0]!.id, quantity: 100 }],
      });

      // 40 000 encore dus sur la première, 30 000 sur la seconde : c'est au
      // fournisseur qu'on paie, et c'est lui qui réclame.
      expect(await purchases.supplierDebts(OWNER.businessId)).toEqual([
        { id: 'sup_1', name: 'Bâtir Plus', owed: 70000, orders: 2 },
      ]);
    });

    it('sort un fournisseur soldé de la liste des dettes', async () => {
      const commande = await seedCommande(150);
      await purchases.recordSupplierPayment(OWNER, commande.id, { amount: 48000 });
      // Un fournisseur à zéro n'a rien à faire dans une liste de dettes.
      expect(await purchases.supplierDebts(OWNER.businessId)).toHaveLength(0);
    });

    it('ne doit rien sur une commande annulée', async () => {
      const commande = await seedCommande();
      await purchases.updatePurchaseOrderStatus(OWNER, commande.id, { status: 'CANCELLED' });
      expect(await purchases.supplierDebts(OWNER.businessId)).toHaveLength(0);
      expect((await dashboard.dashboard(OWNER.businessId, true)).supplierDebt).toBe(0);
    });

    it('fait sortir le règlement de la caisse', async () => {
      const commande = await seedCommande(150);
      await purchases.recordSupplierPayment(OWNER, commande.id, {
        amount: 20000,
        method: 'MOBILE_MONEY',
        provider: 'TMONEY',
      });

      const journal = await cash.cashJournal(OWNER.businessId);
      const sortie = journal.entries.find((ligne) => ligne.kind === 'SUPPLIER_PAYMENT');

      // Ne pas l'y voir ferait croire à une caisse plus pleine qu'elle n'est,
      // le jour précisément où elle vient de se vider.
      expect(sortie).toMatchObject({
        direction: 'OUT',
        amount: 20000,
        detail: 'Mobile Money · T-Money',
      });
      expect(journal.cashOut).toBe(20000);
    });

    it('chiffre la dette fournisseur au tableau de bord, pour le propriétaire', async () => {
      await seedCommande(150);
      expect((await dashboard.dashboard(OWNER.businessId, true)).supplierDebt).toBe(48000);
      // Un vendeur ne reçoit pas ce chiffre : il porte des prix d'achat (§5).
      expect((await dashboard.dashboard(OWNER.businessId, false)).supplierDebt).toBe(0);
    });

    it('ne laisse pas voir la dette du voisin', async () => {
      const commande = await seedCommande(150);
      expect(await purchases.supplierDebts(RIVAL.businessId)).toHaveLength(0);
      expect((await dashboard.dashboard(RIVAL.businessId, true)).supplierDebt).toBe(0);
      await expect(
        purchases.recordSupplierPayment(RIVAL, commande.id, { amount: 1000 })
      ).rejects.toThrow(/introuvable/i);
    });
  });

  // ───────────────────────── Rayons du catalogue (§52) ─────────────────

  describe('rayons (§52)', () => {
    /** Trois produits, deux rayons, un sans rayon. */
    async function seedRayons() {
      await products.createProduct(OWNER, {
        name: 'Tuyau PVC 110',
        sku: 'PVC-110',
        baseUnit: 'barre',
        sellingPrice: 6500,
        category: 'Plomberie',
      });
      await products.createProduct(OWNER, {
        name: 'Coude PVC 110',
        sku: 'PVC-C110',
        baseUnit: 'pièce',
        sellingPrice: 800,
        category: 'Plomberie',
      });
      await products.createProduct(OWNER, {
        name: 'Peinture blanche',
        sku: 'PEI-20',
        baseUnit: 'pot',
        sellingPrice: 18500,
        category: 'Peinture',
      });
      return seedVitre();
    }

    it('range le rayon avec la fiche, et le rend à la lecture', async () => {
      const tuyau = await products.createProduct(OWNER, {
        name: 'Tuyau PVC 110',
        sku: 'PVC-110',
        baseUnit: 'barre',
        sellingPrice: 6500,
        category: 'Plomberie',
      });
      expect(tuyau.category).toBe('Plomberie');
      expect((await products.getProduct(OWNER.businessId, tuyau.id)).category).toBe('Plomberie');
    });

    it('laisse un produit sans rayon', async () => {
      const vitre = await seedVitre();
      expect(vitre.category).toBeNull();
    });

    it('traite un rayon tapé en blancs comme une absence de rayon', async () => {
      // Sans quoi le filtre proposerait un rayon sans nom, impossible à
      // désigner et impossible à vider.
      const vitre = await products.createProduct(OWNER, {
        name: 'Vitre 40 cm',
        sku: 'VIT-040',
        baseUnit: 'pièce',
        sellingPrice: 300,
        category: '   ',
      });
      expect(vitre.category).toBeNull();
      expect(await products.categories(OWNER.businessId)).toHaveLength(0);
    });

    it('classe les rayons du plus fourni au moins fourni', async () => {
      await seedRayons();
      const rayons = await products.categories(OWNER.businessId);
      // La vitre n'a pas de rayon : elle ne crée pas une entrée vide.
      expect(rayons).toEqual([
        { name: 'Plomberie', products: 2 },
        { name: 'Peinture', products: 1 },
      ]);
    });

    it('oublie un rayon dont le dernier produit est archivé', async () => {
      await seedRayons();
      const peinture = (await products.listProducts(OWNER.businessId, { category: 'Peinture' }))[0];
      await products.archiveProduct(OWNER, peinture!.id);

      // Un rayon vide proposé au filtre ne mènerait qu'à une liste vide.
      expect((await products.categories(OWNER.businessId)).map((r) => r.name)).toEqual([
        'Plomberie',
      ]);
    });

    it('filtre le catalogue sur un rayon', async () => {
      await seedRayons();
      const plomberie = await products.listProducts(OWNER.businessId, { category: 'Plomberie' });
      expect(plomberie.map((p) => p.name).sort()).toEqual(['Coude PVC 110', 'Tuyau PVC 110']);
      // Sans rayon demandé, tout le catalogue répond.
      expect(await products.listProducts(OWNER.businessId, {})).toHaveLength(4);
    });

    it('croise le rayon et la recherche', async () => {
      await seedRayons();
      const trouve = await products.listProducts(OWNER.businessId, {
        category: 'Plomberie',
        search: 'coude',
      });
      expect(trouve.map((p) => p.name)).toEqual(['Coude PVC 110']);
    });

    it('change le rayon d’une fiche existante', async () => {
      const tuyau = await products.createProduct(OWNER, {
        name: 'Tuyau PVC 110',
        sku: 'PVC-110',
        baseUnit: 'barre',
        sellingPrice: 6500,
        category: 'Plomberie',
      });
      const modifie = await products.updateProduct(OWNER, tuyau.id, {
        name: 'Tuyau PVC 110',
        sku: 'PVC-110',
        baseUnit: 'barre',
        sellingPrice: 6500,
        category: 'Assainissement',
      });
      expect(modifie.category).toBe('Assainissement');
    });

    it('ne montre pas les rayons du voisin', async () => {
      await seedRayons();
      expect(await products.categories(RIVAL.businessId)).toHaveLength(0);
      expect(
        await products.listProducts(RIVAL.businessId, { category: 'Plomberie' })
      ).toHaveLength(0);
    });

    it('porte le rayon dans l’inventaire exporté', async () => {
      await seedRayons();
      const lignes = (await exports_.EXPORTS.stocks(OWNER.businessId))
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n');
      expect(lignes[0]).toContain('Rayon');
      expect(lignes.find((ligne) => ligne.startsWith('PVC-110'))).toContain(';Plomberie;');
    });
  });

  // ───────────────── Identité de la boutique sur les pièces (§51) ──────

  describe('en-tête des documents (§51)', () => {
    it('garde le numéro fiscal avec les coordonnées', async () => {
      const { business } = await accounts.updateBusiness(OWNER, {
        name: 'Quincaillerie A',
        phone: '90 00 00 00',
        address: 'Lomé',
        taxId: '1000123456789',
      });
      expect(business.tax_id).toBe('1000123456789');
    });

    it('accepte un logo image et le rend au profil', async () => {
      const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
      const { business } = await accounts.updateLogo(OWNER, { image: logo });
      expect(business.logo).toBe(logo);
    });

    it('refuse ce qui n’est pas une image', async () => {
      // Un `data:` text/html rangé ici reviendrait dans une balise img de
      // chaque facture : ce champ est servi tel quel à tous les écrans.
      await expect(
        accounts.updateLogo(OWNER, { image: 'data:text/html,<script>alert(1)</script>' })
      ).rejects.toThrow(/image/i);
      await expect(accounts.updateLogo(OWNER, { image: 'https://exemple.tg/logo.png' })).rejects.toThrow(
        /image/i
      );
    });

    it('refuse un logo trop lourd', async () => {
      const enorme = 'data:image/png;base64,' + 'A'.repeat(400_001);
      await expect(accounts.updateLogo(OWNER, { image: enorme })).rejects.toThrow(/lourd/i);
    });

    it('retire le logo sur une chaîne vide', async () => {
      await accounts.updateLogo(OWNER, { image: 'data:image/png;base64,iVBORw0KGgo=' });
      const { business } = await accounts.updateLogo(OWNER, { image: '' });
      expect(business.logo).toBeNull();
    });

    it('ne touche pas à l’en-tête de la boutique voisine', async () => {
      await accounts.updateLogo(OWNER, { image: 'data:image/png;base64,iVBORw0KGgo=' });
      await accounts.updateBusiness(OWNER, { name: 'Quincaillerie A', taxId: '1000123456789' });

      const voisin = await accounts.profile(RIVAL);
      expect(voisin.business.logo).toBeNull();
      expect(voisin.business.tax_id).toBeNull();
    });
  });

  // ──────────────── Opérateur Mobile Money et carte (§50) ──────────────

  describe('moyen de paiement (§50)', () => {
    it('garde l’opérateur sur la vente et sur son encaissement', async () => {
      const vitre = await seedVitre();
      const vente = await sales.createSale(OWNER, {
        lines: [{ productId: vitre.id, quantity: 2 }],
        paymentMethod: 'MOBILE_MONEY',
        paymentProvider: 'FLOOZ',
      });

      expect(vente.payment_method).toBe('MOBILE_MONEY');
      expect(vente.payment_provider).toBe('FLOOZ');
      const { rows: encaissements } = await pool.query<{ method: string; provider: string | null }>(
        'SELECT method, provider FROM payments WHERE sale_id = $1',
        [vente.id]
      );
      expect(encaissements[0]).toMatchObject({ method: 'MOBILE_MONEY', provider: 'FLOOZ' });
    });

    it('n’attache pas d’opérateur à un paiement qui n’en a pas', async () => {
      const vitre = await seedVitre();
      // Le client paie en espèces : « Flooz » sur cette ligne ferait chercher
      // un versement sur un relevé qui ne le contient pas.
      const especes = await sales.createSale(OWNER, {
        lines: [{ productId: vitre.id, quantity: 1 }],
        paymentMethod: 'CASH',
        paymentProvider: 'FLOOZ',
      });
      expect(especes.payment_provider).toBeNull();

      const carte = await sales.createSale(OWNER, {
        lines: [{ productId: vitre.id, quantity: 1 }],
        paymentMethod: 'CARD',
      });
      expect(carte.payment_method).toBe('CARD');
      expect(carte.payment_provider).toBeNull();
    });

    it('refuse un opérateur inconnu', async () => {
      const vitre = await seedVitre();
      await expect(
        sales.createSale(OWNER, {
          lines: [{ productId: vitre.id, quantity: 1 }],
          paymentMethod: 'MOBILE_MONEY',
          paymentProvider: 'BITCOIN',
        })
      ).rejects.toThrow(/opérateur/i);
    });

    it('distingue les portefeuilles dans le journal de caisse', async () => {
      const vitre = await seedVitre();
      await sales.createSale(OWNER, {
        lines: [{ productId: vitre.id, quantity: 2 }],
        paymentMethod: 'MOBILE_MONEY',
        paymentProvider: 'TMONEY',
      });
      await sales.createSale(OWNER, {
        lines: [{ productId: vitre.id, quantity: 1 }],
        paymentMethod: 'MOBILE_MONEY',
        paymentProvider: 'FLOOZ',
      });
      await sales.createSale(OWNER, {
        lines: [{ productId: vitre.id, quantity: 1 }],
        paymentMethod: 'CASH',
      });

      const journal = await cash.cashJournal(OWNER.businessId);
      const details = journal.entries.map((ligne) => ligne.detail);

      // Le soir, le gérant compare son relevé T-Money et son relevé Flooz :
      // deux portefeuilles distincts, qu'un seul libellé rendrait irréconciliables.
      expect(details).toContain('Mobile Money · T-Money');
      expect(details).toContain('Mobile Money · Flooz');
      expect(details).toContain('Espèces');
    });

    it('garde l’opérateur d’un remboursement de dette', async () => {
      await pool.query(
        `INSERT INTO customers (id, business_id, name, phone)
         VALUES ('cus_mm', $1, 'Yao', '90 00 00 05')`,
        [OWNER.businessId]
      );
      const vitre = await seedVitre();
      await sales.createSale(OWNER, {
        customerId: 'cus_mm',
        lines: [{ productId: vitre.id, quantity: 2 }],
        amountPaid: 0,
      });

      const fiche = await credit.recordRepayment(OWNER, 'cus_mm', {
        amount: 400,
        method: 'MOBILE_MONEY',
        provider: 'WAVE',
      });

      expect(fiche.payments[0]).toMatchObject({ method: 'MOBILE_MONEY', provider: 'WAVE' });
    });

    it('nomme l’opérateur dans l’export des ventes', async () => {
      const vitre = await seedVitre();
      await sales.createSale(OWNER, {
        lines: [{ productId: vitre.id, quantity: 1 }],
        paymentMethod: 'MOBILE_MONEY',
        paymentProvider: 'ORANGE',
      });
      expect(await exports_.EXPORTS.ventes(OWNER.businessId)).toContain(
        'Mobile Money · Orange Money'
      );
    });
  });

  // ─────────────────── Exports du rapport financier (§55) ─────────────

  describe('rapport financier exporté (§55)', () => {
    /** Une vente, une dépense d'exploitation, un achat de stock. */
    async function seedPeriode() {
      const vitre = await seedVitre();
      await sales.createSale(OWNER, { lines: [{ productId: vitre.id, quantity: 10 }] });
      await expenses.createExpense(OWNER, {
        category: 'TRANSPORT',
        label: 'Livraison chantier',
        amount: 1200,
      });
      await expenses.createExpense(OWNER, {
        category: 'STOCK_PURCHASE',
        label: 'Réassort ciment',
        amount: 50000,
      });
      return vitre;
    }

    const lignes = (fichier: string) =>
      fichier
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n');

    it('déroule le résultat du chiffre d’affaires au bénéfice net', async () => {
      await seedPeriode();
      const sortie = lignes(await exports_.EXPORTS.rapport(OWNER.businessId, {}));

      expect(sortie[0]).toBe('Poste;Montant;Détail');
      const texte = sortie.join('\n');
      // 10 × 450 vendus, 10 × 318,75 de coût : 4 500 de CA, 1 312,5 de marge.
      expect(texte).toContain("Chiffre d'affaires;4500");
      // Virgule décimale partout, y compris dans le taux glissé en commentaire :
      // un point au milieu d'un fichier en virgules casse la colonne du tableur.
      expect(texte).toContain('Marge brute;1312,5;29,2 %');
      expect(texte).not.toMatch(/\d\.\d/);
      // 1 200 de transport déduits ; l'achat de stock ne l'est pas.
      expect(texte).toContain('Bénéfice net;112,5');
    });

    it('sort les dépenses en négatif, pour qu’une somme de colonne tombe juste', async () => {
      await seedPeriode();
      const texte = lignes(await exports_.EXPORTS.rapport(OWNER.businessId, {})).join('\n');
      expect(texte).toContain('Dépense — Transport;-1200');
      expect(texte).toContain('Coût des marchandises vendues;-3187,5');
    });

    it('dit que l’achat de stock n’est pas déduit, plutôt que de le taire', async () => {
      await seedPeriode();
      const texte = lignes(await exports_.EXPORTS.rapport(OWNER.businessId, {})).join('\n');
      const ligne = texte.split('\n').find((une) => une.startsWith('dont achat de stock'));
      // Il est sorti de la caisse mais déjà compté par le coût des marchandises
      // vendues : le fichier doit le montrer sans le soustraire (§39).
      expect(ligne).toContain('50000');
      expect(ligne).toContain('Déjà compté');
    });

    it('chiffre la rentabilité, une ligne par produit', async () => {
      await seedPeriode();
      const sortie = lignes(await exports_.EXPORTS.rentabilite(OWNER.businessId, {}));

      expect(sortie[0]).toContain('Taux de marge (%)');
      expect(sortie).toHaveLength(2);
      expect(sortie[1]).toContain('Vitre 60 cm');
      // 4 500 de CA, 3 187,5 de coût, 1 312,5 de marge.
      expect(sortie[1]).toContain(';4500;3187,5;1312,5;');
    });

    it('ne retient que la période demandée', async () => {
      const vitre = await seedPeriode();
      const ancienne = await sales.createSale(OWNER, {
        lines: [{ productId: vitre.id, quantity: 20 }],
      });
      await pool.query(
        "UPDATE sales SET created_at = now() - interval '60 days' WHERE id = $1",
        [ancienne.id]
      );

      const bornes = history_.periodBounds('7d');
      const texte = lignes(await exports_.EXPORTS.rapport(OWNER.businessId, bornes)).join('\n');
      // Sans bornes, le chiffre d'affaires vaudrait 13 500 : la vente d'il y a
      // deux mois ne doit pas entrer dans le rapport du mois.
      expect(texte).toContain("Chiffre d'affaires;4500");
    });

    it('rend un fichier lisible même sans aucune vente', async () => {
      const sortie = lignes(await exports_.EXPORTS.rapport(OWNER.businessId, {}));
      // Un tableur ouvrant un fichier vide n'affiche rien et laisse croire à un
      // export raté : les postes sont là, à zéro.
      expect(sortie.length).toBeGreaterThan(5);
      expect(sortie.join('\n')).toContain('Bénéfice net;0');
      expect(lignes(await exports_.EXPORTS.rentabilite(OWNER.businessId, {}))).toHaveLength(1);
    });

    it('ne laisse passer aucun chiffre de la boutique voisine', async () => {
      await seedPeriode();
      const texte = lignes(await exports_.EXPORTS.rapport(RIVAL.businessId, {})).join('\n');
      expect(texte).toContain("Chiffre d'affaires;0");
      expect(lignes(await exports_.EXPORTS.rentabilite(RIVAL.businessId, {}))).toHaveLength(1);
    });

    it('retombe sur le mois en cours quand aucune période n’est demandée', async () => {
      // « Depuis l'ouverture » téléchargé par mégarde ne ressemble pas à une
      // erreur : il ressemble à un très bon mois.
      const sansPeriode = exports_.exportRequest('rapport', null);
      expect(sansPeriode.bounds.from).toEqual(history_.periodBounds('month').from);
      expect(sansPeriode.fileName).toContain('rapport-month');

      expect(exports_.exportRequest('rapport', 'last-month').bounds.from).toEqual(
        history_.periodBounds('last-month').from
      );
    });

    it('date le nom du fichier, sauf l’inventaire qui n’a pas de période', async () => {
      // Deux fichiers nommés pareil finissent en « rapport (3).csv », et plus
      // personne ne sait lequel couvre quoi.
      expect(exports_.exportRequest('rentabilite', '7d').fileName).toContain('rentabilite-7d');
      expect(exports_.exportRequest('stocks', '7d').fileName).not.toContain('7d');
      expect(exports_.exportRequest('stocks', '7d').fileName).toContain('stocks');
    });
  });

  // ─────────────────── Tableau de bord enrichi (§49) ───────────────────

  describe('tableau de bord (§49)', () => {
    it('rend sept jours, les creux compris, et met aujourd’hui au bout', async () => {
      const vitre = await seedVitre();
      await sales.createSale(OWNER, { lines: [{ productId: vitre.id, quantity: 2 }] });

      // Une vente d'il y a dix jours : hors fenêtre, elle n'appartient à aucun
      // des sept seaux.
      const ancienne = await sales.createSale(OWNER, {
        lines: [{ productId: vitre.id, quantity: 10 }],
      });
      await pool.query(
        "UPDATE sales SET created_at = now() - interval '10 days' WHERE id = $1",
        [ancienne.id]
      );

      const tdb = await dashboard.dashboard(OWNER.businessId);

      expect(tdb.week).toHaveLength(7);
      expect(tdb.week.reduce((somme, jour) => somme + jour.revenue, 0)).toBe(900);
      // Un jour sans vente reste dans la série, à zéro : un trou se lirait
      // comme une baisse là où il n'y a qu'une absence de donnée.
      expect(tdb.week.slice(0, 6).map((jour) => jour.revenue)).toEqual([0, 0, 0, 0, 0, 0]);
      expect(tdb.week[6]).toMatchObject({ revenue: 900, count: 1 });
    });

    it('classe le palmarès par chiffre d’affaires, en unités de base', async () => {
      const vitre = await seedVitre();
      const carton = vitre.units.find((unit) => unit.factor === 40)!;
      const clou = await products.createProduct(OWNER, {
        name: 'Clou de 10',
        sku: 'CLO-010',
        baseUnit: 'pièce',
        purchasePrice: 15,
        sellingPrice: 25,
        lowStockThreshold: 0,
        stockQuantity: 500,
      });
      await sales.createSale(OWNER, {
        lines: [
          { productId: vitre.id, unitId: carton.id, quantity: 1 },
          { productId: clou.id, quantity: 100 },
        ],
      });

      // Ce qui se vendait il y a dix jours n'aide pas à décider du réassort de
      // demain : le palmarès s'arrête à la semaine.
      const ciment = await products.createProduct(OWNER, {
        name: 'Ciment CIMTOGO',
        sku: 'CIM-050',
        baseUnit: 'sac',
        purchasePrice: 3900,
        sellingPrice: 4800,
        lowStockThreshold: 10,
        stockQuantity: 200,
      });
      const ancienne = await sales.createSale(OWNER, {
        lines: [{ productId: ciment.id, quantity: 50 }],
      });
      await pool.query(
        "UPDATE sales SET created_at = now() - interval '10 days' WHERE id = $1",
        [ancienne.id]
      );

      const { topProducts } = await dashboard.dashboard(OWNER.businessId);

      expect(topProducts.map((produit) => produit.name)).toEqual(['Vitre 60 cm', 'Clou de 10']);
      // Un carton compte pour ses 40 pièces : sans le facteur, le palmarès
      // afficherait « 1 vendu » pour la ligne qui rapporte le plus.
      expect(topProducts[0]).toMatchObject({ quantity: 40, revenue: 17000 });
      expect(topProducts[1]).toMatchObject({ quantity: 100, revenue: 2500 });
    });

    it('chiffre les créances et compte les clients qui doivent', async () => {
      await pool.query(
        `INSERT INTO customers (id, business_id, name, phone) VALUES
           ('cus_un', $1, 'Kodjo', '90 00 00 01'), ('cus_deux', $1, 'Afi', '90 00 00 02'),
           ('cus_trois', $1, 'Sena', '90 00 00 03')`,
        [OWNER.businessId]
      );
      const vitre = await seedVitre();
      // Deux ardoises pour le même client, une pour un autre, une vente soldée.
      await sales.createSale(OWNER, {
        customerId: 'cus_un',
        lines: [{ productId: vitre.id, quantity: 2 }],
        amountPaid: 400,
      });
      await sales.createSale(OWNER, {
        customerId: 'cus_un',
        lines: [{ productId: vitre.id, quantity: 2 }],
        amountPaid: 0,
      });
      await sales.createSale(OWNER, {
        customerId: 'cus_deux',
        lines: [{ productId: vitre.id, quantity: 1 }],
        amountPaid: 50,
      });
      // Un client qui a tout payé n'est pas un débiteur : il ne doit ni peser
      // dans le total, ni grossir le nombre de relances.
      await sales.createSale(OWNER, {
        customerId: 'cus_trois',
        lines: [{ productId: vitre.id, quantity: 1 }],
      });

      const tdb = await dashboard.dashboard(OWNER.businessId);

      // 500 + 900 + 400 : la vente soldée ne pèse rien.
      expect(tdb.receivables).toBe(1800);
      // Deux clients, pas trois ardoises : c'est le nombre de relances à faire.
      expect(tdb.debtorCount).toBe(2);
    });

    it('oublie une vente annulée dans la semaine, le palmarès et les créances', async () => {
      await pool.query(
        `INSERT INTO customers (id, business_id, name, phone)
         VALUES ('cus_ann', $1, 'Yao', '90 00 00 03')`,
        [OWNER.businessId]
      );
      const vitre = await seedVitre();
      const annulee = await sales.createSale(OWNER, {
        customerId: 'cus_ann',
        lines: [{ productId: vitre.id, quantity: 2 }],
        amountPaid: 0,
      });
      await sales.cancelSale(OWNER, annulee.id, 'Erreur de saisie');

      const tdb = await dashboard.dashboard(OWNER.businessId);

      // Une vente annulée reste à l'historique, mais la compter ici donnerait
      // un chiffre que le gérant ne retrouverait pas dans sa caisse.
      expect(tdb.week[6]).toMatchObject({ revenue: 0, count: 0 });
      expect(tdb.topProducts).toHaveLength(0);
      expect(tdb.receivables).toBe(0);
      expect(tdb.debtorCount).toBe(0);
    });

    it('ne mélange pas les chiffres de deux quincailleries', async () => {
      await pool.query(
        `INSERT INTO customers (id, business_id, name, phone)
         VALUES ('cus_voisin', $1, 'Sena', '90 00 00 04')`,
        [OWNER.businessId]
      );
      const vitre = await seedVitre();
      await sales.createSale(OWNER, {
        customerId: 'cus_voisin',
        lines: [{ productId: vitre.id, quantity: 2 }],
        amountPaid: 0,
      });

      const voisin = await dashboard.dashboard(RIVAL.businessId);

      expect(voisin.week.every((jour) => jour.revenue === 0 && jour.count === 0)).toBe(true);
      expect(voisin.topProducts).toHaveLength(0);
      expect(voisin.receivables).toBe(0);
      expect(voisin.debtorCount).toBe(0);
    });
  });

  describe('valeur du stock (§49)', () => {
    it('somme le stock au prix d’achat et au prix de vente', async () => {
      await seedVitre(80);

      const valeur = await products.stockValue(OWNER.businessId);

      // 80 × 318,75 d'achat, 80 × 450 de vente : l'écart entre les deux est la
      // marge qui dort dans le magasin.
      expect(valeur).toEqual({ atCost: 25500, atRetail: 36000, products: 1, units: 80 });
    });

    it('ignore un produit archivé ou épuisé', async () => {
      const vitre = await seedVitre(80);
      await products.createProduct(OWNER, {
        name: 'Tôle bac alu',
        sku: 'TOL-002',
        baseUnit: 'tôle',
        purchasePrice: 7000,
        sellingPrice: 9900,
        lowStockThreshold: 2,
        stockQuantity: 0,
      });
      await products.archiveProduct(OWNER, vitre.id);

      // Un produit archivé n'est plus à vendre, un produit à zéro n'est plus
      // là : ni l'un ni l'autre ne vaut quelque chose en rayon.
      expect(await products.stockValue(OWNER.businessId)).toEqual({
        atCost: 0,
        atRetail: 0,
        products: 0,
        units: 0,
      });
    });

    it('ne compte pas le stock du voisin', async () => {
      await seedVitre(80);
      expect(await products.stockValue(RIVAL.businessId)).toMatchObject({ atCost: 0, products: 0 });
    });
  });

  // ──────────────────────────── Carnet de crédit ───────────────────────

  describe('carnet de crédit (§45)', () => {
    /** Deux ventes à crédit au même client, la plus ancienne d'abord. */
    async function seedArdoise() {
      await pool.query(
        `INSERT INTO customers (id, business_id, name, phone) VALUES
        ('cus_maco', $1, 'Kodjo maçon', '90 00 00 00')`,
        [OWNER.businessId]
      );
      const vitre = await seedVitre(200);

      const ancienne = await sales.createSale(OWNER, {
        customerId: 'cus_maco',
        lines: [{ productId: vitre.id, quantity: 20 }],
        amountPaid: 2000,
      });
      // Le temps ne passe pas entre deux appels : l'imputation se fait sur la
      // date, il faut donc vieillir la première vente pour que « la plus
      // ancienne d'abord » veuille dire quelque chose.
      await pool.query(`UPDATE sales SET created_at = now() - interval '20 days' WHERE id = $1`, [
        ancienne.id,
      ]);
      const recente = await sales.createSale(OWNER, {
        customerId: 'cus_maco',
        lines: [{ productId: vitre.id, quantity: 10 }],
        amountPaid: 0,
      });
      return { ancienne, recente, vitre };
    }

    it('calcule l’ardoise d’un client, et la solde par la plus vieille vente', async () => {
      const { ancienne, recente } = await seedArdoise();
      // 20 × 450 − 2 000 = 7 000 dus, plus 10 × 450 = 4 500.
      const avant = await credit.customerAccount(OWNER.businessId, 'cus_maco');
      expect(avant.spent).toBe(13500);
      expect(avant.owed).toBe(11500);
      expect(avant.openCount).toBe(2);

      const apres = await credit.recordRepayment(OWNER, 'cus_maco', {
        amount: 9000,
        method: 'MOBILE_MONEY',
        note: 'Vente de sa récolte',
      });

      expect(apres.owed).toBe(2500);
      const soldee = apres.sales.find((vente) => vente.id === ancienne.id);
      const entamee = apres.sales.find((vente) => vente.id === recente.id);
      expect(soldee).toMatchObject({ amount_paid: 9000, payment_status: 'PAID' });
      expect(entamee).toMatchObject({ amount_paid: 2000, payment_status: 'PARTIAL' });
    });

    it('garde la trace du motif, et nomme le remboursement dans le journal de caisse', async () => {
      const { ancienne } = await seedArdoise();
      await credit.recordRepayment(OWNER, 'cus_maco', {
        amount: 3000,
        method: 'CASH',
        note: 'Avance sur chantier',
      });

      const compte = await credit.customerAccount(OWNER.businessId, 'cus_maco');
      const versement = compte.payments.find((une) => une.kind === 'REPAYMENT');
      expect(versement).toMatchObject({
        amount: 3000,
        note: 'Avance sur chantier',
        sale_reference: ancienne.reference,
      });

      // L'argent entre en caisse le jour du remboursement, sous son vrai nom :
      // « Vente VE-0001 » ferait chercher une vente vieille de trois semaines.
      const journal = await cash.cashJournal(OWNER.businessId, {});
      const ligne = journal.entries.find((une) => une.amount === 3000);
      expect(ligne?.label).toBe(`Remboursement ${ancienne.reference}`);
    });

    it('refuse un versement supérieur à la dette, et n’écrit rien', async () => {
      await seedArdoise();
      await expect(
        credit.recordRepayment(OWNER, 'cus_maco', { amount: 11501, method: 'CASH' })
      ).rejects.toThrow(/dépasse la dette/i);

      const { rows } = await pool.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM payments WHERE kind = 'REPAYMENT'`
      );
      expect(Number(rows[0]!.n)).toBe(0);
    });

    it('classe les débiteurs, et ignore les ventes annulées', async () => {
      const { vitre } = await seedArdoise();
      await pool.query(
        `INSERT INTO customers (id, business_id, name) VALUES
        ('cus_abandon', $1, 'Client parti')`,
        [OWNER.businessId]
      );
      const annulee = await sales.createSale(OWNER, {
        customerId: 'cus_abandon',
        lines: [{ productId: vitre.id, quantity: 5 }],
        amountPaid: 0,
      });
      await sales.cancelSale(OWNER, annulee.id);

      const classement = await credit.debtors(OWNER.businessId, 5);
      expect(classement.debtors.map((un) => un.name)).toEqual(['Kodjo maçon']);
      expect(classement.totalOwed).toBe(11500);
      // Une vente annulée a rendu l'argent et la marchandise (§25) : elle ne
      // laisse aucune dette derrière elle.
      expect(classement.debtorCount).toBe(1);
    });

    it('n’ouvre pas la fiche d’un client d’une autre quincaillerie', async () => {
      await seedArdoise();
      await expect(credit.customerAccount(RIVAL.businessId, 'cus_maco')).rejects.toThrow(
        /client introuvable/i
      );
      await expect(
        credit.recordRepayment(RIVAL, 'cus_maco', { amount: 1000, method: 'CASH' })
      ).rejects.toThrow(/client introuvable/i);
    });
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

  it('dit lequel des deux identifiants est déjà pris', async () => {
    await accounts.register({
      ownerName: 'Ama',
      businessName: 'Quincaillerie Ama',
      email: 'ama@test.tg',
      phone: '+228 90 11 22 33',
      password: 'motdepasse123',
    });

    // Le téléphone sert d'identifiant de connexion au même titre que l'e-mail
    // (§7) : il est unique. Sa collision remontait de la contrainte Postgres,
    // traduite en « Cette référence est déjà utilisée » — un message qui parle
    // de référence produit à quelqu'un qui crée un compte.
    await expect(
      accounts.register({
        ownerName: 'Kossi',
        businessName: 'Autre boutique',
        email: 'kossi-le-second@test.tg',
        phone: '+228 90 11 22 33',
        password: 'motdepasse123',
      })
    ).rejects.toThrow(/numéro de téléphone/i);
  });

  describe('suppression d’une boutique (§46)', () => {
    /** Une boutique garnie, avec son propriétaire et un vendeur. */
    async function seedBoutique() {
      const proprio = await accounts.register({
        ownerName: 'Ama',
        businessName: 'Quincaillerie Le Bâtisseur',
        email: 'ama@test.tg',
        password: 'motdepasse123',
      });
      const members = await import('../members');
      await members.addSeller(proprio, {
        name: 'Kodjo vendeur',
        email: 'kodjo.vendeur@test.tg',
        password: 'motdepasse123',
      });
      await pool.query(
        `INSERT INTO customers (id, business_id, name) VALUES ('cus_x', $1, 'Afi')`,
        [proprio.businessId]
      );
      const vitre = await products.createProduct(proprio, {
        name: 'Vitre 60 cm',
        baseUnit: 'pièce',
        sellingPrice: 450,
        stockQuantity: 10,
      });
      await sales.createSale(proprio, { lines: [{ productId: vitre.id, quantity: 2 }] });
      return proprio;
    }

    /** Ce qui reste en base, toutes tables confondues, pour cette boutique. */
    async function resteDe(businessId: string) {
      const { rows: lignes } = await pool.query<{ n: string }>(
        `SELECT (SELECT COUNT(*) FROM businesses WHERE id = $1)
              + (SELECT COUNT(*) FROM products WHERE business_id = $1)
              + (SELECT COUNT(*) FROM sales WHERE business_id = $1)
              + (SELECT COUNT(*) FROM sale_items WHERE business_id = $1)
              + (SELECT COUNT(*) FROM payments WHERE business_id = $1)
              + (SELECT COUNT(*) FROM customers WHERE business_id = $1)
              + (SELECT COUNT(*) FROM stock_movements WHERE business_id = $1)
              + (SELECT COUNT(*) FROM business_members WHERE business_id = $1) AS n`,
        [businessId]
      );
      return Number(lignes[0]!.n);
    }

    it('annonce le poids de ce qui sera effacé', async () => {
      const proprio = await seedBoutique();
      await expect(accounts.businessWeight(proprio)).resolves.toMatchObject({
        businessName: 'Quincaillerie Le Bâtisseur',
        products: 1,
        sales: 1,
        customers: 1,
        members: 2,
      });
    });

    it('efface la boutique, tout ce qu’elle contient, et les comptes qui n’en tenaient qu’elle', async () => {
      const proprio = await seedBoutique();
      const resume = await accounts.deleteBusiness(proprio, {
        password: 'motdepasse123',
        // Sans l'accent : le clavier d'un téléphone le donne mal, et la règle
        // le pardonne tant que le nom entier est tapé.
        confirmation: 'quincaillerie le batisseur',
      });

      expect(resume).toMatchObject({ sales: 1, products: 1, accountsRemoved: 2 });
      expect(await resteDe(proprio.businessId)).toBe(0);

      // Le propriétaire et son vendeur ne tenaient que cette boutique : leurs
      // comptes partent avec elle. Les comptes des autres boutiques restent.
      const { rows: comptes } = await pool.query(
        `SELECT email FROM users WHERE email IN ('ama@test.tg', 'kodjo.vendeur@test.tg')`
      );
      expect(comptes).toHaveLength(0);
    });

    it('refuse un mot de passe faux, et n’efface rien', async () => {
      const proprio = await seedBoutique();
      await expect(
        accounts.deleteBusiness(proprio, {
          password: 'ce-n-est-pas-le-bon',
          confirmation: 'Quincaillerie Le Bâtisseur',
        })
      ).rejects.toThrow(/mot de passe incorrect/i);
      expect(await resteDe(proprio.businessId)).toBeGreaterThan(0);
    });

    it('refuse un nom mal retapé, et n’efface rien', async () => {
      const proprio = await seedBoutique();
      await expect(
        accounts.deleteBusiness(proprio, {
          password: 'motdepasse123',
          confirmation: 'Quincaillerie',
        })
      ).rejects.toThrow(/tapez le nom exact/i);
      expect(await resteDe(proprio.businessId)).toBeGreaterThan(0);
    });

    it('garde le compte de qui tient encore une autre boutique', async () => {
      const premiere = await accounts.register({
        ownerName: 'Ama',
        businessName: 'Quincaillerie Une',
        email: 'ama@test.tg',
        password: 'motdepasse123',
      });
      // La même personne ouvre une seconde boutique : son compte y reste
      // rattaché, et la fermeture de la première ne doit pas l'emporter.
      await pool.query(
        `INSERT INTO businesses (id, name) VALUES ('biz_deux', 'Quincaillerie Deux')`
      );
      await pool.query(
        `INSERT INTO business_members (business_id, user_id, role) VALUES ('biz_deux', $1, 'OWNER')`,
        [premiere.userId]
      );

      const resume = await accounts.deleteBusiness(premiere, {
        password: 'motdepasse123',
        confirmation: 'Quincaillerie Une',
      });
      expect(resume.accountsRemoved).toBe(0);

      const { rows: reste } = await pool.query(`SELECT id FROM users WHERE id = $1`, [
        premiere.userId,
      ]);
      expect(reste).toHaveLength(1);
    });

    it('ne touche pas à la boutique d’à côté', async () => {
      const proprio = await seedBoutique();
      const voisine = await accounts.register({
        ownerName: 'Kossi',
        businessName: 'Quincaillerie Voisine',
        email: 'kossi.voisin@test.tg',
        password: 'motdepasse123',
      });
      const vitre = await products.createProduct(voisine, {
        name: 'Vitre voisine',
        baseUnit: 'pièce',
        sellingPrice: 500,
        stockQuantity: 5,
      });

      await accounts.deleteBusiness(proprio, {
        password: 'motdepasse123',
        confirmation: 'Quincaillerie Le Bâtisseur',
      });

      await expect(products.getProduct(voisine.businessId, vitre.id)).resolves.toMatchObject({
        name: 'Vitre voisine',
      });
      expect(await resteDe(voisine.businessId)).toBeGreaterThan(0);
    });
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
  // ─────────────── Deux transports pour la session (§41) ───────────────

  it('accepte le refresh token dans le corps, faute de cookie à présenter', async () => {
    const auth = await import('../../lib/auth');
    const jeton = await auth.issueRefreshToken(OWNER.userId, OWNER.businessId);

    const tourne = await auth.rotateRefreshToken(jeton);
    expect(tourne?.member.id).toBe(OWNER.userId);
    expect(tourne?.member.business_id).toBe(OWNER.businessId);
    // Un jeton ne sert qu'une fois, quel que soit le transport qui l'a apporté.
    await expect(auth.rotateRefreshToken(jeton)).resolves.toBeNull();
    // Et le jeton neuf issu de la rotation, lui, vaut toujours.
    expect(await auth.rotateRefreshToken(tourne!.refreshToken)).not.toBeNull();
  });

  it('signe un access token que le serveur accepte tel quel', async () => {
    const auth = await import('../../lib/auth');
    const jeton = await auth.signAccessToken(OWNER);
    const charge = await auth.verifyAccessToken(jeton);
    // C'est le `businessId` du jeton qui porte le cloisonnement (§29) : s'il ne
    // survivait pas à l'aller-retour, un client natif lirait la mauvaise boutique.
    expect(charge?.businessId).toBe(OWNER.businessId);
    expect(charge?.sub).toBe(OWNER.userId);
    expect(await auth.verifyAccessToken('jeton.forgé.ici')).toBeNull();
  });

  // ─────────────────────── Cahier de recettes (§42) ────────────────────────

  it('porte les encaissements de vente dans la journée où ils ont eu lieu', async () => {
    const vitre = await seedVitre();
    await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 4 }],
    });

    const cahier = await incomes.takingsBook(OWNER.businessId);
    const aujourdhui = new Date().toISOString().slice(0, 10);

    expect(cahier.days).toHaveLength(1);
    expect(cahier.days[0]?.day).toBe(aujourdhui);
    expect(cahier.days[0]?.salesCount).toBe(1);
    expect(cahier.salesTotal).toBeGreaterThan(0);
    expect(cahier.otherTotal).toBe(0);
    // L'en-tête se retrouve dans les lignes.
    expect(cahier.total).toBe(cahier.days.reduce((n, j) => n + j.total, 0));
  });

  it('range une recette au jour de sa date, non au jour de sa saisie', async () => {
    await incomes.createIncome(OWNER, {
      category: 'SERVICE',
      label: 'Découpe de fer',
      amount: 3000,
      receivedOn: '2026-01-15',
    });

    const cahier = await incomes.takingsBook(OWNER.businessId);
    expect(cahier.days.map((j) => j.day)).toContain('2026-01-15');
    expect(cahier.otherTotal).toBe(3000);
  });

  it('fait entrer un remboursement de dette en caisse sans gonfler le chiffre d’affaires', async () => {
    const vitre = await seedVitre();
    await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 4 }],
    });

    const avant = await reports.financialReport(OWNER.businessId);
    const caisseAvant = await cash.cashJournal(OWNER.businessId);

    await incomes.createIncome(OWNER, {
      category: 'DEBT_REPAYMENT',
      label: 'Ardoise de Kodjo',
      amount: 40000,
    });

    const apres = await reports.financialReport(OWNER.businessId);
    const caisseApres = await cash.cashJournal(OWNER.businessId);

    // La vente a été comptée le jour où elle a eu lieu : la recompter ici ferait
    // vendre deux fois la même marchandise (§42).
    expect(apres.totals.revenue).toBe(avant.totals.revenue);
    expect(apres.totals.grossMargin).toBeCloseTo(avant.totals.grossMargin, 2);
    expect(apres.totals.netProfit).toBeCloseTo(avant.totals.netProfit, 2);

    // Mais l'argent est bien entré dans le tiroir.
    expect(caisseApres.cashIn).toBeCloseTo(caisseAvant.cashIn + 40000, 2);
    expect(caisseApres.entries.some((e) => e.kind === 'INCOME')).toBe(true);
  });

  it('fait d’un service rendu une recette et une marge, sans coût de marchandise', async () => {
    const vitre = await seedVitre();
    await sales.createSale(OWNER, {
      lines: [{ productId: vitre.id, unitId: vitre.units[0]!.id, quantity: 4 }],
    });

    const avant = await reports.financialReport(OWNER.businessId);

    await incomes.createIncome(OWNER, {
      category: 'SERVICE',
      label: 'Pose de serrure',
      amount: 12000,
    });

    const apres = await reports.financialReport(OWNER.businessId);

    expect(apres.totals.revenue).toBeCloseTo(avant.totals.revenue + 12000, 2);
    expect(apres.totals.otherRevenue).toBe(12000);
    // Sans marchandise derrière, la somme passe entière en marge puis en bénéfice.
    expect(apres.totals.costOfGoods).toBeCloseTo(avant.totals.costOfGoods, 2);
    expect(apres.totals.grossMargin).toBeCloseTo(avant.totals.grossMargin + 12000, 2);
    expect(apres.totals.netProfit).toBeCloseTo(avant.totals.netProfit + 12000, 2);
  });

  it('corrige et supprime une recette', async () => {
    const recette = await incomes.createIncome(OWNER, {
      category: 'RENTAL',
      label: 'Location brouette',
      amount: 1000,
    });
    expect(recette.amount).toBe(1000);

    const corrigee = await incomes.updateIncome(OWNER, recette.id, {
      category: 'RENTAL',
      label: 'Location bétonnière',
      amount: 2500,
    });
    expect(corrigee.label).toBe('Location bétonnière');
    expect(corrigee.amount).toBe(2500);

    await incomes.deleteIncome(OWNER, recette.id);
    expect(await incomes.listIncomes(OWNER.businessId)).toHaveLength(0);
    expect((await incomes.takingsBook(OWNER.businessId)).otherTotal).toBe(0);
  });

  it('ne laisse pas une boutique voir le cahier d’une autre (§29)', async () => {
    await incomes.createIncome(OWNER, {
      category: 'SERVICE',
      label: 'Réparation chez A',
      amount: 7000,
    });

    const chezLeVoisin = await incomes.takingsBook(RIVAL.businessId);
    expect(chezLeVoisin.otherTotal).toBe(0);
    expect(chezLeVoisin.days).toHaveLength(0);
    expect(await incomes.listIncomes(RIVAL.businessId)).toHaveLength(0);
  });
});
