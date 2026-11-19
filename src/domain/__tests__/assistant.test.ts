import { describe, expect, it } from 'vitest';
import { money } from '@/utils/format';
import { OUTILS, formuler, outil, outilsPour } from '../assistant';

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

});

describe('les réponses de l’assistant (§71)', () => {
  it('répond en phrases, pas en données brutes', () => {
    const texte = formuler(
      'resume_boutique',
      {
        nombre_de_ventes: 3,
        ventes_du_jour: 12900,
        marge_du_jour: 1200,
        produits_en_alerte: 2,
        dettes_clients: 45000,
        nombre_de_debiteurs: 5,
        dettes_fournisseurs: 0,
        charges_echues_ou_proches: 0,
      },
      'FCFA'
    );
    expect(texte).toContain('3 vente');
    expect(texte).toContain(money(12900, 'FCFA'));
    expect(texte).toContain(money(45000, 'FCFA'));
    // Ce qui vaut zéro ne se dit pas : « vous devez 0 FCFA » est du bruit.
    expect(texte).not.toContain('fournisseurs');
  });

  it('dit quand il n’y a rien à dire, au lieu de rendre une liste vide', () => {
    expect(formuler('stock_bas', [], 'FCFA')).toMatch(/rien à racheter/i);
    expect(formuler('clients_endettes', { clients: [] }, 'FCFA')).toMatch(/personne/i);
    expect(formuler('chercher_produit', [], 'FCFA')).toMatch(/aucun produit/i);
  });

  it('nomme le stock avec son unité', () => {
    const texte = formuler(
      'chercher_produit',
      [{ nom: 'Ciment 50 kg', unite: 'sac', stock: 47, prix_vente: 4300 }],
      'FCFA'
    );
    expect(texte).toContain('Ciment 50 kg');
    expect(texte).toContain('47 sacs');
    expect(texte).toContain(money(4300, 'FCFA'));
  });

  it('dit le retard d’une charge dans le bon sens', () => {
    const texte = formuler(
      'charges_a_venir',
      [
        { libelle: 'Loyer', montant: 80000, jours_restants: 12 },
        { libelle: 'Salaire Kodjo', montant: 45000, jours_restants: -3 },
        { libelle: 'CEET', montant: 18000, jours_restants: 0 },
      ],
      'FCFA'
    );
    expect(texte).toContain('dans 12 jours');
    expect(texte).toContain('en retard de 3 jours');
    expect(texte).toContain('aujourd’hui');
  });
});
