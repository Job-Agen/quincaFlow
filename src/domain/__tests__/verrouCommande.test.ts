import { describe, expect, it } from 'vitest';
import { verrouDeCommande, verrouDeSuppression } from '../purchase';

/**
 * Ce qui fige une commande fournisseur (§58).
 *
 * Toute la question tient en une phrase : une commande n'est un brouillon que
 * tant que rien n'en dépend. Ces tests gardent le point exact où elle cesse de
 * l'être — celui au-delà duquel corriger une ligne falsifierait le stock, et
 * supprimer effacerait une sortie de caisse.
 */

describe('tant que rien n’en dépend', () => {
  it('laisse modifier une commande que personne n’a livrée', () => {
    expect(verrouDeCommande('DRAFT', 0, 0)).toBeNull();
    expect(verrouDeCommande('SENT', 0, 0)).toBeNull();
    // Le fournisseur a envoyé sa facture, mais rien n'est arrivé : le gérant
    // peut encore corriger une quantité ou un prix.
    expect(verrouDeCommande('INVOICE_RECEIVED', 0, 0)).toBeNull();
  });
});

describe('dès qu’une livraison est entrée', () => {
  it('fige la commande, et dit quoi faire à la place', () => {
    const verrou = verrouDeCommande('PARTIALLY_RECEIVED', 1, 0);
    expect(verrou).toMatch(/livraison/i);
    // « Action impossible » ne dirait pas au gérant quoi faire ensuite.
    expect(verrou).toMatch(/annulez/i);
  });

  it('fige aussi une commande entièrement livrée', () => {
    expect(verrouDeCommande('RECEIVED', 2, 0)).not.toBeNull();
  });
});

describe('dès qu’un règlement est saisi', () => {
  it('fige la commande, même sans livraison enregistrée', () => {
    // La suppression emporterait le règlement en cascade, et avec lui une
    // entrée du journal de caisse.
    expect(verrouDeCommande('PAID', 0, 1)).toMatch(/règlement/i);
  });
});

describe('une commande annulée', () => {
  it('ne se modifie plus : elle est close', () => {
    // La réécrire serait une résurrection silencieuse.
    expect(verrouDeCommande('CANCELLED', 0, 0)).toMatch(/annulée/i);
  });

  it('s’efface, elle : rien ne dépend d’elle (§64)', () => {
    // Le §58 verrouillait les deux gestes ensemble, et créait un piège : une
    // commande ouverte par erreur puis annulée au lieu d'être effacée
    // encombrait la liste à jamais. Or les deux routes refusent d'annuler ce
    // qui a été livré et de régler ce qui est annulé : une commande annulée
    // ne porte rien.
    expect(verrouDeSuppression('CANCELLED', 0, 0)).toBeNull();
  });
});

describe('ce que la suppression laisse passer, et ce qu’elle refuse', () => {
  it('laisse effacer une commande livrée : le stock lui est rendu (§65)', () => {
    // Le §58 la verrouillait pour que l'inventaire ne mente pas. La
    // suppression rend désormais au stock ce que la commande y avait fait
    // entrer : l'objection tombe avec sa cause.
    expect(verrouDeSuppression('RECEIVED', 1, 0)).toBeNull();
    expect(verrouDeSuppression('PARTIALLY_RECEIVED', 1, 0)).toBeNull();
  });

  it('refuse une commande réglée, parce que la caisse est sortie', () => {
    // Celui-là tient : l'effacement emporterait une ligne du journal (§54).
    expect(verrouDeSuppression('PAID', 0, 1)).toMatch(/règlement/i);
    expect(verrouDeSuppression('CANCELLED', 0, 1)).toMatch(/règlement/i);
    // Et il dit quoi faire pour s'en sortir.
    expect(verrouDeSuppression('PAID', 2, 1)).toMatch(/retirez/i);
  });

  it('laisse passer ce dont rien ne dépend', () => {
    expect(verrouDeSuppression('DRAFT', 0, 0)).toBeNull();
    expect(verrouDeSuppression('SENT', 0, 0)).toBeNull();
  });
});
