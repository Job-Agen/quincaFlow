import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { envoyerFacture, fichierFacture } from '../partage';
import type { BusinessRow, Sale, SaleItemRow } from '@/types';

/**
 * L'envoi de la facture (§57).
 *
 * Le chemin qui compte — le partage de fichiers du téléphone — n'existe sur
 * aucun navigateur de bureau : il ne peut pas se vérifier en ouvrant
 * l'application. Ces tests le jouent avec un `navigator` simulé, parce que
 * c'est la seule façon d'exercer la branche que le gérant utilisera tous les
 * jours, et celle qui tombe en silence si elle casse.
 */

const BOUTIQUE: BusinessRow = {
  id: 'biz_1',
  name: 'Quincaillerie Le Bâtisseur',
  phone: '+228 90 11 22 33',
  address: 'Lomé',
  tagline: null,
  tax_id: '1000123456789',
  logo: null,
  currency: 'FCFA',
};

const article: SaleItemRow = {
  id: 'sit_1',
  product_id: 'prd_1',
  product_name: 'Fer à béton 8 mm',
  unit_label: 'barre',
  unit_factor: 1,
  quantity: 20,
  unit_price: 3100,
  line_total: 62000,
  unit_cost: 2600,
};

const VENTE: Sale = {
  id: 'sal_1',
  business_id: 'biz_1',
  reference: 'VE-0002',
  invoice_reference: 'FA-2026-0002',
  customer_id: 'cus_1',
  customer_name: 'Entreprise BTP Soleil',
  user_id: 'usr_1',
  subtotal: 62000,
  discount: 0,
  total: 62000,
  cost_of_goods: 52000,
  payment_method: 'CASH',
  payment_provider: null,
  amount_paid: 62000,
  payment_status: 'PAID',
  status: 'COMPLETED',
  note: null,
  created_at: '2026-10-12T07:25:00.000Z',
  updated_at: '2026-10-12T07:25:00.000Z',
  items: [article],
};

let telechargements: string[];

beforeEach(() => {
  telechargements = [];
  // jsdom n'implémente pas les URL d'objet : sans ce relais, le repli jette au
  // lieu de télécharger, et le test passerait pour de mauvaises raisons.
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => 'blob:essai',
    revokeObjectURL: () => undefined,
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    telechargements.push(this.download);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Un `navigator` qui sait, ou non, partager des fichiers. */
function simuleTelephone(options: { sait: boolean; echoue?: Error }) {
  const partages: { files: File[]; text?: string }[] = [];
  vi.stubGlobal('navigator', {
    canShare: (donnees: { files?: File[] }) => options.sait && Array.isArray(donnees.files),
    share: async (donnees: { files: File[]; text?: string }) => {
      if (options.echoue) throw options.echoue;
      partages.push(donnees);
    },
  });
  return partages;
}

describe('le fichier joint', () => {
  it('est un PDF nommé d’après la facture', async () => {
    const fichier = await fichierFacture(VENTE, BOUTIQUE, 'FCFA');
    expect(fichier.name).toBe('FA-2026-0002.pdf');
    expect(fichier.type).toBe('application/pdf');
    // Un PDF, pas un fichier vide : les premiers octets le disent.
    const tete = new Uint8Array(await fichier.slice(0, 5).arrayBuffer());
    expect(new TextDecoder().decode(tete)).toBe('%PDF-');
    expect(fichier.size).toBeGreaterThan(1000);
  });
});

describe('sur un téléphone qui sait partager un fichier', () => {
  it('confie le PDF au partage, et ne télécharge rien', async () => {
    const partages = simuleTelephone({ sait: true });

    const issue = await envoyerFacture(VENTE, BOUTIQUE, 'FCFA', 'Votre facture');

    expect(issue).toBe('partagé');
    expect(partages).toHaveLength(1);
    expect(partages[0]!.files[0]!.name).toBe('FA-2026-0002.pdf');
    expect(partages[0]!.text).toBe('Votre facture');
    // Télécharger en plus laisserait un fichier dans le dos du gérant.
    expect(telechargements).toEqual([]);
  });

  it('ne télécharge rien quand le gérant referme la feuille de partage', async () => {
    // Refermer n'est pas une panne : lui déposer un fichier serait une surprise.
    simuleTelephone({ sait: true, echoue: new DOMException('annulé', 'AbortError') });

    expect(await envoyerFacture(VENTE, BOUTIQUE, 'FCFA', 'Votre facture')).toBe('partagé');
    expect(telechargements).toEqual([]);
  });

  it('retombe sur le téléchargement si le partage échoue vraiment', async () => {
    simuleTelephone({ sait: true, echoue: new Error('partage indisponible') });

    expect(await envoyerFacture(VENTE, BOUTIQUE, 'FCFA', 'Votre facture')).toBe('téléchargé');
    expect(telechargements).toEqual(['FA-2026-0002.pdf']);
  });
});

describe('sur un navigateur qui ne sait pas', () => {
  it('télécharge la facture plutôt que de ne rien faire', async () => {
    // Un gérant qui appuie et à qui il ne se passe rien conclut que
    // l'application est cassée.
    simuleTelephone({ sait: false });

    expect(await envoyerFacture(VENTE, BOUTIQUE, 'FCFA', 'Votre facture')).toBe('téléchargé');
    expect(telechargements).toEqual(['FA-2026-0002.pdf']);
  });

  it('télécharge aussi quand `canShare` n’existe pas du tout', async () => {
    vi.stubGlobal('navigator', {});
    expect(await envoyerFacture(VENTE, BOUTIQUE, 'FCFA', 'Votre facture')).toBe('téléchargé');
    expect(telechargements).toEqual(['FA-2026-0002.pdf']);
  });
});
