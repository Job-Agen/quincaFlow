import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ReportsPage from '../page';
import type { FinancialReport, Profile } from '@/types';

/**
 * Honnêteté de l'écran des rapports (§39).
 *
 * Le calcul ne peut pas savoir si le gérant a saisi toutes ses dépenses : c'est
 * l'écran qui doit le dire. Un « bénéfice net » annoncé sans aucune dépense
 * enregistrée est une marge brute, et le commerçant qui le lit croit disposer
 * d'un argent déjà parti en loyer. Ces tests gardent cet avertissement, qui est
 * la seule chose empêchant l'écran de mentir en toute bonne foi.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/reports',
}));

const PROFILE: Profile = {
  user: { id: 'usr_1', name: 'Kossi', email: 'kossi@test.tg', phone: null },
  business: {
    id: 'biz_1',
    name: 'Quincaillerie Kossi',
    phone: null,
    address: null,
    tagline: null,
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

/** Rapport de référence : 19 250 encaissés, 4 906,25 de marge brute. */
function reportWith(overrides: Partial<FinancialReport> = {}): FinancialReport {
  return {
    from: null,
    to: null,
    granularity: 'day',
    totals: {
      revenue: 19250,
      salesRevenue: 19250,
      outOfStockRevenue: 0,
      costOfGoods: 14343.75,
      grossMargin: 4906.25,
      marginRate: 25.5,
      expenses: 0,
      stockPurchases: 0,
      operatingExpenses: 0,
      netProfit: 4906.25,
    },
    salesCount: 1,
    outOfStockCount: 0,
    expenseCount: 0,
    expensesByCategory: [],
    buckets: [],
    products: [],
    productCount: 0,
    ...overrides,
  };
}

function serve(report: FinancialReport) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(report), { status: 200 })))
  );
}

const AVERTISSEMENT = /le bénéfice net affiché est donc votre marge brute/i;

/**
 * Chiffres d'un montant mis en forme, séparateurs retirés.
 *
 * `toLocaleString('fr-FR')` sépare les milliers par une espace fine insécable et
 * peut écrire le moins en U+2212 selon la version d'ICU. Comparer la chaîne
 * entière ferait échouer le test sur un détail de bibliothèque, pas sur le
 * montant.
 */
const digits = (text: string | null | undefined) => (text || '').replace(/[^0-9]/g, '');

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('bénéfice net sans dépense saisie', () => {
  it('avertit que le chiffre affiché est une marge brute', async () => {
    serve(reportWith());
    render(<ReportsPage />);

    await waitFor(() => expect(screen.getByText(AVERTISSEMENT)).toBeDefined());
    // Le chiffre reste affiché : le cacher priverait le gérant de sa marge.
    expect(screen.getAllByText(/4 906/).length).toBeGreaterThan(0);
  });

  it('retire l’avertissement dès qu’une dépense est enregistrée', async () => {
    serve(
      reportWith({
        expenseCount: 2,
        expensesByCategory: [
          { category: 'RENT', amount: 2000, count: 1 },
          { category: 'TRANSPORT', amount: 1500, count: 1 },
        ],
        totals: {
          ...reportWith().totals,
          expenses: 3500,
          operatingExpenses: 3500,
          netProfit: 1406.25,
        },
      })
    );
    render(<ReportsPage />);

    await waitFor(() => expect(screen.getAllByText(/1 406/).length).toBeGreaterThan(0));
    expect(screen.queryByText(AVERTISSEMENT)).toBeNull();
    // La réserve demeure, mais sous une forme qui n'accuse plus l'écran de mentir.
    expect(screen.getByText(/n’est juste que si toutes les dépenses/i)).toBeDefined();
  });
});

describe('résultat de la période', () => {
  it('affiche la cascade dans l’ordre du PRD, du chiffre d’affaires au bénéfice', async () => {
    serve(reportWith());
    render(<ReportsPage />);

    await waitFor(() => expect(document.querySelector('.waterfall')).not.toBeNull());

    // L'ordre est celui du §39 : on doit pouvoir suivre la soustraction du
    // regard, du chiffre d'affaires jusqu'au bénéfice. Les libellés sont cherchés
    // dans le texte rendu, car chacun figure aussi sur une tuile.
    const rendu = document.querySelector('.waterfall')!.textContent || '';
    const lignes = [
      'Ventes en boutique',
      'Ventes hors stock',
      'Chiffre d’affaires',
      'Coût des marchandises vendues',
      'Marge brute',
      'Dépenses de fonctionnement',
      'Bénéfice net',
    ];
    let position = -1;
    lignes.forEach((ligne) => {
      const trouve = rendu.indexOf(ligne);
      expect(trouve, ligne).toBeGreaterThan(position);
      position = trouve;
    });
  });

  it('signale un mois déficitaire au lieu de le noyer dans la cascade', async () => {
    // Le loyer dépasse la marge : c'est le chiffre pour lequel on ouvre l'écran.
    serve(
      reportWith({
        expenseCount: 1,
        expensesByCategory: [{ category: 'RENT', amount: 65000, count: 1 }],
        totals: {
          ...reportWith().totals,
          expenses: 65000,
          operatingExpenses: 65000,
          netProfit: -60093.75,
        },
      })
    );
    render(<ReportsPage />);

    // La tuile change de couleur, et le montant du bas est marqué négatif : sans
    // cela un mois déficitaire se lit comme les autres, à un signe près.
    await waitFor(() => expect(document.querySelector('.tile--red')).not.toBeNull());
    const grand = document.querySelector('.total-line--grand .amount');
    expect(grand?.className).toContain('negative');
    // Le chiffre lui-même est bien celui du serveur, aux séparateurs près.
    expect(digits(grand?.textContent)).toContain('60094');
  });
});
