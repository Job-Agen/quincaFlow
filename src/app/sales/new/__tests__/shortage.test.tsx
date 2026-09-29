import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewSalePage from '../page';
import type { Product, Profile } from '@/types';

/**
 * Garde-fou de survente (§12, §35).
 *
 * La contrainte `stock_quantity >= 0` reste l'arbitre : une vente qui dépasse le
 * stock est rejetée par Postgres, quoi que fasse l'écran. Mais laisser le
 * vendeur encaisser puis lui annoncer l'échec, c'est lui faire perdre la vente
 * devant le client. Le panier devance donc le refus, et ce test vérifie qu'il le
 * fait encore.
 */

const nav = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, back: vi.fn() }),
  usePathname: () => '/sales/new',
}));

const PROFILE: Profile = {
  user: { id: 'usr_1', name: 'Ama', email: 'ama@test.tg', phone: null },
  business: {
    id: 'biz_1',
    name: 'Quincaillerie Ama',
    phone: null,
    address: null,
    tagline: null,
    currency: 'FCFA',
  },
  role: 'OWNER',
};

/** Trois serrures en rayon, et rien d'autre au catalogue. */
const SERRURE: Product = {
  id: 'prd_1',
  business_id: 'biz_1',
  name: 'Serrure porte',
  sku: 'SER-001',
  description: null,
  base_unit: 'pièce',
  purchase_price: 3400,
  selling_price: 5000,
  stock_quantity: 3,
  low_stock_threshold: 0,
  archived: false,
  created_at: '2026-09-29T08:00:00.000Z',
  updated_at: '2026-09-29T08:00:00.000Z',
  units: [{ id: 'unt_1', label: 'pièce', factor: 1, price: 5000, isBase: true }],
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

beforeEach(() => {
  nav.replace.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/products') ? [SERRURE] : [];
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    })
  );
});

/** Met une serrure au panier en passant par le sélecteur de produits. */
async function ajouterUneSerrure() {
  render(<NewSalePage />);
  const ouvrir = await screen.findByRole('button', { name: /Rechercher un produit/ });
  fireEvent.click(ouvrir);
  fireEvent.click(await screen.findByRole('button', { name: /Serrure porte/ }));
  return screen.getByRole('button', { name: /Valider la vente/ }) as HTMLButtonElement;
}

/** `toBeDisabled` viendrait d'une extension de matchers ; la propriété suffit. */
const bloque = (bouton: HTMLButtonElement) => bouton.disabled;

describe('panier au-delà du stock', () => {
  it('laisse valider tant que la quantité tient dans le stock', async () => {
    const valider = await ajouterUneSerrure();
    fireEvent.change(screen.getByLabelText('Quantité — Serrure porte'), {
      target: { value: '3' },
    });

    await waitFor(() => expect(bloque(valider)).toBe(false));
  });

  it('empêche de valider dès que la quantité dépasse le stock', async () => {
    const valider = await ajouterUneSerrure();
    fireEvent.change(screen.getByLabelText('Quantité — Serrure porte'), {
      target: { value: '4' },
    });

    await waitFor(() => expect(bloque(valider)).toBe(true));
    // Le vendeur doit comprendre pourquoi, et combien il en reste réellement.
    // L'alerte est portée deux fois : sur la ligne fautive, et en bas de panier
    // où se prend la décision de valider.
    expect(screen.getAllByText(/Stock insuffisant/)).toHaveLength(2);
    expect(screen.getByText(/4 pièces demandés, 3 en stock/)).toBeDefined();
  });

  it('redevient validable une fois la quantité corrigée', async () => {
    const valider = await ajouterUneSerrure();
    const quantite = screen.getByLabelText('Quantité — Serrure porte');

    fireEvent.change(quantite, { target: { value: '10' } });
    await waitFor(() => expect(bloque(valider)).toBe(true));

    fireEvent.change(quantite, { target: { value: '2' } });
    await waitFor(() => expect(bloque(valider)).toBe(false));
  });

  it('refuse un panier vide', async () => {
    render(<NewSalePage />);
    const valider = (await screen.findByRole('button', {
      name: /Valider la vente/,
    })) as HTMLButtonElement;
    expect(bloque(valider)).toBe(true);
  });
});
