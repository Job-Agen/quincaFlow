import { describe, expect, it } from 'vitest';
import { MAX_TOURS, OUTILS, invite, outil, outilsPour } from '../assistant';

/**
 * Le catalogue de l'assistant (§71).
 *
 * Ce que ces tests gardent n'est pas la liste — elle grandira — mais les deux
 * règles sans lesquelles l'assistant devient dangereux : qu'un outil
 * d'écriture ne puisse jamais passer pour une lecture, et qu'un vendeur ne
 * voie pas les outils du propriétaire.
 */
describe('catalogue de l’assistant (§71)', () => {
  it('nomme chaque outil une seule fois', () => {
    const noms = OUTILS.map((candidat) => candidat.nom);
    expect(new Set(noms).size).toBe(noms.length);
  });

  it('donne à chaque outil un schéma que le mode strict accepte', () => {
    // `strict: true` exige `additionalProperties: false` et un `required`
    // explicite. Un schéma qui ne les porte pas est refusé par l'API, et
    // l'assistant tombe en panne à la première question.
    OUTILS.forEach((candidat) => {
      expect(candidat.schema.type).toBe('object');
      expect(candidat.schema.additionalProperties).toBe(false);
      expect(Array.isArray(candidat.schema.required)).toBe(true);
      candidat.schema.required.forEach((champ) => {
        expect(Object.keys(candidat.schema.properties)).toContain(champ);
      });
    });
  });

  it('décrit chaque outil assez pour qu’on sache quand l’appeler', () => {
    // Une description vide laisse le modèle deviner : il appellerait
    // « enregistrer_vente » pour répondre à « combien j'ai vendu ».
    OUTILS.forEach((candidat) => {
      expect(candidat.description.length).toBeGreaterThan(40);
    });
  });

  it('réserve au propriétaire exactement ce que les écrans lui réservent', () => {
    // Le miroir des routes : rapports, charges, stock, produits et dépenses
    // sont du propriétaire (§5). Vendre ne l'est pas — c'est le métier du
    // vendeur. Une divergence ici ouvrirait à l'assistant une porte que
    // l'application ferme.
    const reserves = OUTILS.filter((candidat) => candidat.proprietaire).map((c) => c.nom);
    expect(reserves.sort()).toEqual(
      [
        'ajuster_stock',
        'charges_a_venir',
        'creer_produit',
        'enregistrer_depense',
        'payer_charge',
        'rapport_financier',
      ].sort()
    );
  });

  it('ne montre au vendeur aucun outil du propriétaire', () => {
    const vendeur = outilsPour(false);
    expect(vendeur.some((candidat) => candidat.proprietaire)).toBe(false);
    // Mais il garde de quoi travailler : vendre et chercher un produit.
    expect(vendeur.map((candidat) => candidat.nom)).toContain('enregistrer_vente');
    expect(vendeur.map((candidat) => candidat.nom)).toContain('chercher_produit');
    expect(outilsPour(true).length).toBeGreaterThan(vendeur.length);
  });

  it('marque comme écriture tout ce qui touche aux comptes', () => {
    // La liste des gestes qui changent quelque chose. Un outil d'écriture
    // oublié ici s'exécuterait sans que personne ne l'ait validé — c'est la
    // seule faute de ce module qui coûterait de l'argent au gérant.
    const ecrivent = OUTILS.filter((candidat) => candidat.ecrit).map((c) => c.nom);
    expect(ecrivent.sort()).toEqual(
      [
        'ajuster_stock',
        'creer_produit',
        'enregistrer_depense',
        'enregistrer_vente',
        'payer_charge',
      ].sort()
    );
  });

  it('ne connaît pas d’outil qu’on n’a pas écrit', () => {
    expect(outil('supprimer_la_boutique')).toBeNull();
    expect(outil('')).toBeNull();
    expect(outil(undefined)).toBeNull();
    expect(outil('enregistrer_vente')?.ecrit).toBe(true);
  });

  it('borne la conversation', () => {
    // Sans borne, un modèle qui boucle sur un outil en échec dépenserait
    // l'argent du gérant jusqu'à la panne.
    expect(MAX_TOURS).toBeGreaterThan(1);
    expect(MAX_TOURS).toBeLessThanOrEqual(10);
  });
});

describe('ce que l’assistant sait de la boutique (§71)', () => {
  const contexte = {
    boutique: 'Quincaillerie du Golfe',
    gerant: 'Koffi',
    proprietaire: true,
    devise: 'FCFA',
    jour: 'jeudi 19 novembre 2026',
  };

  it('lui dit où il est, à qui il parle, quel jour et en quelle monnaie', () => {
    // Ces quatre faits ne sont dans aucun outil : sans eux l'assistant
    // répondrait « aujourd'hui » sans savoir quel jour, et en euros.
    const texte = invite(contexte);
    expect(texte).toContain('Quincaillerie du Golfe');
    expect(texte).toContain('Koffi');
    expect(texte).toContain('FCFA');
    expect(texte).toContain('jeudi 19 novembre 2026');
  });

  it('dit au vendeur qu’il est vendeur', () => {
    expect(invite(contexte)).toContain('propriétaire');
    expect(invite({ ...contexte, proprietaire: false })).toContain('vendeur');
  });

  it('lui interdit d’annoncer ce qu’il n’a fait que proposer', () => {
    // C'est la promesse faite au gérant : rien ne s'écrit sans son appui. Un
    // assistant qui dirait « c'est enregistré » la romprait en mots même si
    // le serveur, lui, n'a rien écrit.
    expect(invite(contexte)).toMatch(/propose/i);
    expect(invite(contexte)).toMatch(/valide/i);
  });
});
