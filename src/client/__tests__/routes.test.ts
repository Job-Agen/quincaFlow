import { describe, expect, it } from 'vitest';
import { ENTRY_ROUTES, PUBLIC_ROUTES, isEntryRoute, isPublicRoute } from '../routes';

/**
 * Ces règles ont déjà échoué une fois, pour avoir été écrites à deux endroits :
 * la page de téléchargement s'affichait, puis l'écran de connexion la
 * remplaçait. Les tests portent donc sur les deux questions distinctes, et pas
 * seulement sur le contenu d'une liste.
 */
describe('écrans sans session', () => {
  it('laisse voir l’accueil, la connexion, l’inscription et le téléchargement', () => {
    expect(isPublicRoute('/')).toBe(true);
    expect(isPublicRoute('/login')).toBe(true);
    expect(isPublicRoute('/register')).toBe(true);
    expect(isPublicRoute('/telecharger')).toBe(true);
  });

  it('protège tout le reste', () => {
    for (const chemin of ['/dashboard', '/products', '/sales/new', '/reports', '/settings']) {
      expect(isPublicRoute(chemin)).toBe(false);
    }
  });

  it('ne laisse pas passer un préfixe : /loginer n’est pas /login', () => {
    expect(isPublicRoute('/loginer')).toBe(false);
    expect(isPublicRoute('/telecharger/apk')).toBe(false);
  });
});

describe('écrans d’entrée', () => {
  it('renvoient au tableau de bord une session déjà ouverte', () => {
    // La racine comprise : un gérant connecté qui tape l'adresse de son site
    // veut sa boutique, pas la page qui présente l'application (§47).
    expect(isEntryRoute('/')).toBe(true);
    expect(isEntryRoute('/login')).toBe(true);
    expect(isEntryRoute('/register')).toBe(true);
  });

  it('épargnent le téléchargement : un gérant connecté vient y chercher l’APK', () => {
    // Sans cette distinction, la page se fermait d'elle-même dès qu'on était
    // connecté — c'est-à-dire pour le seul public qui en a besoin.
    expect(isEntryRoute('/telecharger')).toBe(false);
  });

  it('sont un sous-ensemble des écrans sans session', () => {
    for (const chemin of ENTRY_ROUTES) expect(PUBLIC_ROUTES).toContain(chemin);
  });
});
