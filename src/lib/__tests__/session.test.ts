import { describe, expect, it } from 'vitest';
import { NATIVE_CLIENT_HEADER, pickRefreshToken, sessionPayload, wantsTokens } from '../session';
import type { Profile } from '@/types';

/**
 * Transport des jetons de session (§41).
 *
 * Ces tests gardent une règle de sécurité, pas une commodité : les jetons ne
 * doivent jamais figurer dans une réponse au navigateur. Les cookies `HttpOnly`
 * mettent la session hors de portée du JavaScript de la page ; une route qui
 * rendrait les mêmes jetons dans le corps annulerait cette protection sans que
 * rien ne le signale à la lecture.
 */

const FICHE: Profile = {
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

const JETONS = { accessToken: 'acces', refreshToken: 'renouvellement' };

const requete = (entetes: Record<string, string> = {}) =>
  new Request('https://exemple.test/api/auth/login', { method: 'POST', headers: entetes });

describe('wantsTokens', () => {
  it('ne reconnaît que la demande explicite d’un client natif', () => {
    expect(wantsTokens(requete({ [NATIVE_CLIENT_HEADER]: 'native' }))).toBe(true);
    expect(wantsTokens(requete())).toBe(false);
    // Ni un agent qui se dit mobile, ni une valeur approchante : la porte ne
    // s'ouvre que sur le mot convenu.
    expect(wantsTokens(requete({ 'user-agent': 'okhttp/4.12 Android' }))).toBe(false);
    expect(wantsTokens(requete({ [NATIVE_CLIENT_HEADER]: 'Native' }))).toBe(false);
    expect(wantsTokens(requete({ [NATIVE_CLIENT_HEADER]: 'web' }))).toBe(false);
  });
});

describe('sessionPayload', () => {
  it('ne rend aucun jeton au navigateur', () => {
    const corps = sessionPayload(requete(), FICHE, JETONS);
    expect('tokens' in corps).toBe(false);
    // La fiche passe intacte : c'est bien la même réponse qu'avant (§7).
    expect(corps).toEqual(FICHE);
  });

  it('rend les jetons au client natif, avec leur durée de vie', () => {
    const corps = sessionPayload(requete({ [NATIVE_CLIENT_HEADER]: 'native' }), FICHE, JETONS);
    expect(corps).toMatchObject({ ...FICHE, tokens: { ...JETONS, expiresIn: 15 * 60 } });
  });

  it('ne modifie pas la fiche qu’on lui confie', () => {
    const copie = structuredClone(FICHE);
    sessionPayload(requete({ [NATIVE_CLIENT_HEADER]: 'native' }), copie, JETONS);
    expect(copie).toEqual(FICHE);
  });
});

describe('pickRefreshToken', () => {
  it('donne la priorité au cookie du navigateur', () => {
    // Sans cette priorité, un corps forgé substituerait une autre session à
    // celle que le gérant a réellement ouverte.
    expect(pickRefreshToken('du-cookie', { refreshToken: 'du-corps' })).toBe('du-cookie');
  });

  it('retombe sur le corps quand aucun cookie n’est présenté', () => {
    expect(pickRefreshToken(null, { refreshToken: 'du-corps' })).toBe('du-corps');
    expect(pickRefreshToken(undefined, { refreshToken: 'du-corps' })).toBe('du-corps');
  });

  it('ne rend rien plutôt qu’une valeur douteuse', () => {
    expect(pickRefreshToken(null, {})).toBeNull();
    expect(pickRefreshToken(null, undefined)).toBeNull();
    expect(pickRefreshToken('', { refreshToken: '' })).toBeNull();
    expect(pickRefreshToken(null, { refreshToken: 42 })).toBeNull();
  });
});
