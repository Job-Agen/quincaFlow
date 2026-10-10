import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PurchaseOrderDocument from '../PurchaseOrderDocument';
import type { Profile, PurchaseOrder, PurchaseOrderItemRow } from '@/types';

/**
 * Le bon de commande, monté (§43).
 *
 * Ce document sort de l'imprimante ou part par WhatsApp : c'est la seule pièce
 * que le fournisseur voit. Les tests gardent ce qui l'engage — l'identité de la
 * boutique, les prix, le total — et la distinction qui évite un malentendu
 * coûteux : un bon sans prix ne doit pas se présenter comme un bon de commande.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/purchases/po_1/document',
}));

const PROFILE: Profile = {
  user: { id: 'usr_1', name: 'Kossi', email: 'kossi@test.tg', phone: null },
  business: {
    id: 'biz_1',
    name: 'Quincaillerie Kossi',
    phone: '90 11 22 33',
    address: 'Lomé — Avenue de la Libération',
    tagline: 'Matériaux & outillage',
    currency: 'FCFA',
  },
  role: 'OWNER',
};

vi.mock('@/client/session', async () => {
  const actual = await vi.importActual<typeof import('@/client/session')>('@/client/session');
  return {
    ...actual,
    useSession: () => ({
      status: 'authenticated' as const,
      profile: PROFILE,
      user: PROFILE.user,
      business: PROFILE.business,
      role: PROFILE.role,
      isOwner: true,
      currency: 'FCFA',
      reload: vi.fn(),
      setProfile: vi.fn(),
      signOut: vi.fn(),
    }),
  };
});

function item(over: Partial<PurchaseOrderItemRow> & { id: string }): PurchaseOrderItemRow {
  return {
    product_id: 'prd_1',
    product_name: 'Ciment Diamond 50 kg',
    unit_label: 'sac',
    unit_factor: 1,
    quantity_ordered: 40,
    quantity_received: 0,
    unit_cost: 3800,
    line_total: 152000,
    ...over,
  };
}

/** 40 sacs à 3 800 et 20 barres à 4 500 : 242 000 au total. */
function order(over: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'po_1',
    business_id: 'biz_1',
    reference: 'PO-0042',
    supplier_id: 'sup_1',
    supplier_name: 'Ets Kodjo',
    status: 'SENT',
    total_estimated: 242000,
    notes: null,
    created_at: '2026-10-10T09:00:00.000Z',
    updated_at: '2026-10-10T09:00:00.000Z',
    items: [
      item({ id: 'poi_1' }),
      item({
        id: 'poi_2',
        product_name: 'Fer à béton 8',
        unit_label: 'barre',
        quantity_ordered: 20,
        unit_cost: 4500,
        line_total: 90000,
      }),
    ],
    receipts: [],
    documents: [],
    ...over,
  };
}

function serve(data: PurchaseOrder) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(data), { status: 200 })))
  );
}

/** Montant comparé sur ses seuls chiffres : l'espace fine varie avec l'ICU. */
const digits = (text: string | null | undefined) => (text || '').replace(/[^0-9]/g, '');

const afficher = async (data: PurchaseOrder) => {
  serve(data);
  render(<PurchaseOrderDocument id="po_1" />);
  await waitFor(() => expect(screen.getByRole('table')).toBeDefined());
  return document.body.textContent || '';
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('en-tête du document', () => {
  it('dit qui commande : nom, adresse et téléphone de la boutique', async () => {
    const vu = await afficher(order());
    expect(vu).toContain('Quincaillerie Kossi');
    expect(vu).toContain('Lomé — Avenue de la Libération');
    expect(vu).toContain('90 11 22 33');
  });

  it('porte le numéro, la date et le fournisseur', async () => {
    const vu = await afficher(order());
    expect(vu).toContain('PO-0042');
    expect(vu).toContain('10/10/2026');
    expect(vu).toContain('Ets Kodjo');
  });

  it('s’intitule « BON DE COMMANDE »', async () => {
    await afficher(order());
    expect(screen.getByRole('heading', { name: 'BON DE COMMANDE' })).toBeDefined();
  });
});

describe('les lignes et le total', () => {
  it('chiffre chaque ligne : quantité, prix unitaire, total de ligne', async () => {
    const vu = await afficher(order());
    // L'unité est sous le nom, pas dans la colonne des quantités : « 6 seau de
    // 20 L » poussait la colonne des totaux hors de la feuille (§43).
    expect(vu).toContain('Ciment Diamond 50 kg (sac)');
    expect(vu).toContain('Fer à béton 8 (barre)');
    expect(digits(vu)).toContain('3800');
    expect(digits(vu)).toContain('152000');
    expect(digits(vu)).toContain('90000');
  });

  it('affiche un total qui est la somme des lignes affichées', async () => {
    await afficher(order());
    const ligne = screen.getByText('TOTAL ESTIMÉ').parentElement;
    // 152 000 + 90 000, recalculé par le document et non lu de la commande.
    expect(digits(ligne?.textContent)).toContain('242000');
  });

  it('ignore un total de commande qui ne correspondrait plus aux lignes', async () => {
    // Si `total_estimated` dérivait, c'est la somme des lignes qui fait foi :
    // le fournisseur additionne ce qu'il lit.
    await afficher(order({ total_estimated: 999999 }));
    expect(digits(screen.getByText('TOTAL ESTIMÉ').parentElement?.textContent)).toContain('242000');
  });

  it('reprend les observations, qui portent souvent la consigne de livraison', async () => {
    const vu = await afficher(order({ notes: 'Livraison avant vendredi.' }));
    expect(vu).toContain('Livraison avant vendredi.');
  });
});

describe('une commande sans prix est une demande de prix', () => {
  const sansPrix = order({
    total_estimated: 0,
    items: order().items.map((ligne) => ({ ...ligne, unit_cost: 0, line_total: 0 })),
  });

  it('change le titre plutôt que de promettre un engagement', async () => {
    await afficher(sansPrix);
    expect(screen.getByRole('heading', { name: 'DEMANDE DE PRIX' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'BON DE COMMANDE' })).toBeNull();
  });

  it('n’annonce aucun total : « 0 FCFA » se lirait comme une commande gratuite', async () => {
    const vu = await afficher(sansPrix);
    expect(screen.queryByText('TOTAL ESTIMÉ')).toBeNull();
    expect(vu).toContain('Merci de nous communiquer vos prix');
  });

  it('retire les colonnes de prix, et garde les quantités', async () => {
    const vu = await afficher(sansPrix);
    expect(screen.queryByRole('columnheader', { name: 'Prix' })).toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Qté' })).toBeDefined();
    expect(vu).toContain('Ciment Diamond 50 kg (sac)');
    expect(digits(vu)).toContain('40');
  });
});

describe('commande annulée', () => {
  const annulee = order({ status: 'CANCELLED' });

  it('porte le filigrane, qui survit à la capture comme à l’impression', async () => {
    await afficher(annulee);
    const document_ = screen.getByRole('article');
    expect(document_.className).toContain('invoice--cancelled');
  });

  it('dit en clair que le document ne vaut plus commande', async () => {
    const vu = await afficher(annulee);
    expect(vu).toContain('ne vaut pas bon de commande');
    // Et rien n'invite à signer une commande annulée.
    expect(vu).not.toContain('Le fournisseur');
  });
});

describe('ce qui sort de l’imprimante', () => {
  it('écarte les boutons : ils ne sont pas du document', async () => {
    await afficher(order());
    const partager = screen.getByRole('button', { name: /Partager WhatsApp/ });
    expect(partager.closest('.no-print')).not.toBeNull();
  });

  it('laisse deux emplacements de signature sur une commande vivante', async () => {
    const vu = await afficher(order());
    expect(vu).toContain('Le gérant');
    expect(vu).toContain('Le fournisseur');
  });
});
