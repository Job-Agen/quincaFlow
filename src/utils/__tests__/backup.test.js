import { describe, it, expect, beforeEach } from 'vitest';
import { exportAll, importAll, resetAll, BACKUP_KEYS } from '../backup';

const sampleProducts = [
  {
    id: 'p1',
    name: 'Riz parfumé 25kg',
    cat: 'Alimentation',
    buyPrice: 15000,
    sellPrice: 18500,
    qty: 40,
    unit: 'sac',
    minQty: 10,
    createdAt: '2026-07-01T08:00:00.000Z',
  },
];

const sampleSettings = {
  storeName: 'Ma Boutique',
  tagline: 'Gestion de boutique',
  currency: 'FCFA',
  productCategories: ['Alimentation', 'Boissons'],
  expenseCategories: ['Loyer'],
  units: ['unité', 'sac'],
};

beforeEach(() => {
  window.localStorage.clear();
});

describe('BACKUP_KEYS', () => {
  it('couvre les 9 clés qp_* de l’application', () => {
    expect(BACKUP_KEYS).toHaveLength(9);
    expect(BACKUP_KEYS).toEqual(
      expect.arrayContaining([
        'qp_products',
        'qp_sales',
        'qp_expenses',
        'qp_contacts',
        'qp_invoices',
        'qp_settings',
        'qp_stock_movements',
        'qp_purchases',
        'qp_credit_payments',
      ])
    );
  });
});

describe('exportAll', () => {
  it('retourne version 1, une date exportedAt ISO et toutes les clés', () => {
    window.localStorage.setItem('qp_products', JSON.stringify(sampleProducts));

    const backup = exportAll();

    expect(backup.version).toBe(1);
    expect(new Date(backup.exportedAt).toISOString()).toBe(backup.exportedAt);
    BACKUP_KEYS.forEach((key) => {
      expect(backup.data).toHaveProperty(key);
    });
    expect(backup.data.qp_products).toEqual(sampleProducts);
    expect(backup.data.qp_sales).toBeNull();
  });
});

describe('export → import (aller-retour)', () => {
  it('restitue les données après un cycle export/import', () => {
    window.localStorage.setItem('qp_products', JSON.stringify(sampleProducts));
    window.localStorage.setItem('qp_settings', JSON.stringify(sampleSettings));

    const backup = exportAll();
    window.localStorage.clear();

    const result = importAll(backup);

    expect(result).toEqual({ ok: true });
    expect(JSON.parse(window.localStorage.getItem('qp_products'))).toEqual(sampleProducts);
    expect(JSON.parse(window.localStorage.getItem('qp_settings'))).toEqual(sampleSettings);
  });

  it('survit à une sérialisation JSON (comme un fichier téléchargé)', () => {
    window.localStorage.setItem('qp_products', JSON.stringify(sampleProducts));

    const fileContent = JSON.stringify(exportAll());
    window.localStorage.clear();

    const result = importAll(JSON.parse(fileContent));

    expect(result.ok).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('qp_products'))).toEqual(sampleProducts);
  });
});

describe('importAll — validation', () => {
  it('refuse null', () => {
    const result = importAll(null);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('refuse une valeur non-objet', () => {
    expect(importAll('texte').ok).toBe(false);
    expect(importAll(42).ok).toBe(false);
  });

  it('refuse une mauvaise version', () => {
    const result = importAll({ version: 99, data: { qp_products: [] } });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('refuse une version manquante', () => {
    expect(importAll({ data: { qp_products: [] } }).ok).toBe(false);
  });

  it('refuse un champ data invalide', () => {
    expect(importAll({ version: 1 }).ok).toBe(false);
    expect(importAll({ version: 1, data: null }).ok).toBe(false);
    expect(importAll({ version: 1, data: 'oops' }).ok).toBe(false);
    expect(importAll({ version: 1, data: [] }).ok).toBe(false);
  });

  it('ne modifie pas le localStorage quand l’import est refusé', () => {
    window.localStorage.setItem('qp_products', JSON.stringify(sampleProducts));

    importAll({ version: 99, data: { qp_products: [] } });

    expect(JSON.parse(window.localStorage.getItem('qp_products'))).toEqual(sampleProducts);
  });
});

describe('importAll — clés autorisées uniquement', () => {
  it('n’écrit pas les clés inconnues présentes dans data', () => {
    const result = importAll({
      version: 1,
      data: {
        qp_products: sampleProducts,
        qp_hack: { evil: true },
        autre_cle: 'x',
      },
    });

    expect(result.ok).toBe(true);
    expect(JSON.parse(window.localStorage.getItem('qp_products'))).toEqual(sampleProducts);
    expect(window.localStorage.getItem('qp_hack')).toBeNull();
    expect(window.localStorage.getItem('autre_cle')).toBeNull();
  });

  it('ignore les clés à valeur null (données absentes à l’export)', () => {
    const result = importAll({ version: 1, data: { qp_products: null } });

    expect(result.ok).toBe(true);
    expect(window.localStorage.getItem('qp_products')).toBeNull();
  });
});

describe('resetAll', () => {
  it('supprime toutes les BACKUP_KEYS', () => {
    BACKUP_KEYS.forEach((key) => {
      window.localStorage.setItem(key, JSON.stringify([{ id: 'x' }]));
    });

    resetAll();

    BACKUP_KEYS.forEach((key) => {
      expect(window.localStorage.getItem(key)).toBeNull();
    });
  });

  it('ne touche pas aux clés hors application', () => {
    window.localStorage.setItem('autre_app_cle', 'garder');

    resetAll();

    expect(window.localStorage.getItem('autre_app_cle')).toBe('garder');
  });
});
