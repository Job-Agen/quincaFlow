import { describe, expect, it } from 'vitest';
import { comprendre } from '@/domain/comprendre';

/**
 * Le corpus du comptoir (§71).
 *
 * Quarante-trois phrases telles qu'un gérant les tape : au pouce, avec ses
 * fautes, dans les tournures qui lui viennent. C'est le seul test qui dise si
 * l'assistant **sert** — les autres disent s'il est correct.
 *
 * Il est né d'un échec : « Quels sont les produits à racheté ?? » recevait
 * « je n'ai pas compris », alors que l'écran proposait « qu'est-ce que je
 * dois racheter » deux lignes plus bas. Les règles étaient calées sur des
 * mots entiers ; elles le sont maintenant sur leurs racines.
 *
 * Toute phrase qu'un gérant tape et qui tombe à côté a sa place ici.
 */
const CORPUS: [string, string][] = [
  // Ce qu'il faut racheter
  ['Quels sont les produits à racheté ??', 'stock_bas'],
  ['qu’est-ce que je dois racheter', 'stock_bas'],
  ['qu’est-ce qui manque', 'stock_bas'],
  ['produits en rupture', 'stock_bas'],
  ['je dois commander quoi', 'stock_bas'],
  ['liste des produits à acheter', 'stock_bas'],
  ['quels articles sont épuisés', 'stock_bas'],
  ['stock bas', 'stock_bas'],
  // Le résumé du jour
  ['combien j’ai vendu aujourd’hui', 'resume_boutique'],
  ['ça va la boutique', 'resume_boutique'],
  ['mon chiffre du jour', 'resume_boutique'],
  ['bilan de la journée', 'resume_boutique'],
  ['combien il y a en caisse aujourd’hui', 'resume_boutique'],
  // Les dettes
  ['qui me doit de l’argent', 'clients_endettes'],
  ['les ardoises', 'clients_endettes'],
  ['quels clients sont endettés', 'clients_endettes'],
  ['les impayés', 'clients_endettes'],
  // Les charges
  ['mes prochaines échéances', 'charges_a_venir'],
  ['quelles charges arrivent', 'charges_a_venir'],
  ['quand je dois payer le loyer', 'charges_a_venir'],
  // Le rapport
  ['mon bénéfice du mois', 'rapport_financier'],
  ['ma marge le mois dernier', 'rapport_financier'],
  ['est-ce que je gagne de l’argent', 'rapport_financier'],
  ['mon résultat sur 30 jours', 'rapport_financier'],
  // Les ventes récentes
  ['les dernières ventes', 'ventes_recentes'],
  ['historique des ventes', 'ventes_recentes'],
  // Un produit nommé
  ['il me reste combien de ciment', 'chercher_produit'],
  ['stock de fer', 'chercher_produit'],
  ['combien de tôle disponible', 'chercher_produit'],
  ['quelle quantité de ciment il reste', 'chercher_produit'],
  // Vendre
  ['vends 3 sacs de ciment, il a payé 10000', 'enregistrer_vente'],
  ['vendu 2 fers à béton payé 5000', 'enregistrer_vente'],
  ['sors 4 tôles pour le client', 'enregistrer_vente'],
  // Sans le « s » : la faute la plus commune au pouce, et une règle calée sur
  // le mot entier la manque.
  ['je vend 2 sacs de ciment', 'enregistrer_vente'],
  ['cède 1 tôle à 5000', 'enregistrer_vente'],
  // Le stock qui bouge
  ['j’ai reçu 20 sacs de ciment', 'ajuster_stock'],
  ['le fournisseur a livré 15 tôles', 'ajuster_stock'],
  ['3 sacs de ciment cassés', 'ajuster_stock'],
  ['retire 2 barres de fer', 'ajuster_stock'],
  ['ajoute 10 sacs de ciment', 'ajuster_stock'],
  // Les dépenses et les charges payées
  ['j’ai payé la facture CEET 18000', 'enregistrer_depense'],
  ['dépense carburant 5000', 'enregistrer_depense'],
  ['j’ai réglé 2000 pour des clous', 'enregistrer_depense'],
  ['j’ai payé le loyer', 'payer_charge'],
  ['j’ai payé le salaire de Kodjo 45000', 'payer_charge'],
];

describe('corpus du comptoir (§71)', () => {
  it.each(CORPUS)('« %s » → %s', (phrase, attendu) => {
    expect(comprendre(phrase)?.outil ?? '(rien)').toBe(attendu);
  });
});
