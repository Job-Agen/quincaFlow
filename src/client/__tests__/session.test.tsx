import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SessionProvider, useSession } from '../session';
import AppShell from '@/components/layout/AppShell';
import type { Profile } from '@/types';

/**
 * Amorçage de la session (§38).
 *
 * Ces tests gardent une distinction que le code a déjà perdue une fois : un
 * serveur qui répond « cette session ne vaut plus » et un serveur qu'on n'a pas
 * pu joindre ne sont pas le même événement. Les confondre renvoyait le gérant à
 * l'écran de connexion à la moindre coupure réseau, alors que sa session était
 * valide — et l'invitait à ressaisir un mot de passe que personne n'était là
 * pour vérifier.
 */

const nav = vi.hoisted(() => ({ pathname: '/dashboard', replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => nav.pathname,
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

/** Réponse de `/api/auth/me`, et rien d'autre : c'est le seul appel à l'amorçage. */
function respondWith(reply: () => Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      // Un 401 déclenche d'abord une tentative de rafraîchissement ; la refuser
      // reproduit le cas d'une session réellement expirée.
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve(new Response('', { status: 401 }));
      }
      return reply();
    })
  );
}

const ok = () => Promise.resolve(new Response(JSON.stringify(PROFILE), { status: 200 }));
const refused = () =>
  Promise.resolve(new Response(JSON.stringify({ error: 'Session expirée.' }), { status: 401 }));
const unplugged = () => Promise.reject(new TypeError('Failed to fetch'));

function Probe() {
  const { status } = useSession();
  return <span data-testid="statut">{status}</span>;
}

const statut = () => screen.getByTestId('statut').textContent;

beforeEach(() => {
  nav.pathname = '/dashboard';
  nav.replace.mockClear();
});

describe('amorçage de la session', () => {
  it('ouvre la boutique quand le serveur reconnaît la session', async () => {
    respondWith(ok);
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(statut()).toBe('authenticated'));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('renvoie à la connexion quand le serveur refuse la session', async () => {
    respondWith(refused);
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(statut()).toBe('anonymous'));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/login'));
  });

  it("ne déconnecte pas le gérant quand c'est le réseau qui manque", async () => {
    respondWith(unplugged);
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(statut()).toBe('unreachable'));
    // Le point de tout l'exercice : aucune redirection vers /login.
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('retrouve la session au retour du réseau', async () => {
    respondWith(unplugged);
    render(
      <SessionProvider>
        <AppShell>
          <Probe />
        </AppShell>
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText('Pas de connexion')).toBeDefined());

    respondWith(ok);
    screen.getByRole('button', { name: 'Réessayer' }).click();

    await waitFor(() => expect(statut()).toBe('authenticated'));
  });
});

describe('coque de l’application hors réseau', () => {
  it('annonce la coupure sans rien afficher d’autre', async () => {
    respondWith(unplugged);
    render(
      <SessionProvider>
        <AppShell>
          <p>Ventes du jour : 385 500 FCFA</p>
        </AppShell>
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByText('Pas de connexion')).toBeDefined();
    // Aucun chiffre ne doit passer : une somme affichée hors ligne serait lue
    // comme le chiffre du jour, alors que rien ne permet de l'affirmer.
    expect(screen.queryByText(/385 500/)).toBeNull();
    expect(screen.queryByLabelText('Navigation principale')).toBeNull();
  });

  it('laisse passer la connexion, qui n’attend aucune session', async () => {
    nav.pathname = '/login';
    respondWith(unplugged);
    render(
      <SessionProvider>
        <AppShell>
          <p>Se connecter</p>
        </AppShell>
      </SessionProvider>
    );

    expect(screen.getByText('Se connecter')).toBeDefined();
    await waitFor(() => expect(screen.queryByText('Pas de connexion')).toBeNull());
  });
});
