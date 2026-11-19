import { describe, expect, it } from 'vitest';
import { completer, comprendre } from '../comprendre';

/**
 * Poursuivre la question d'avant (§71).
 *
 * Au comptoir, on ne répète pas la phrase entière : on complète. « Et de
 * fer ? », « le CIMTOGO », « 3 ». Un assistant qui oblige à tout retaper fait
 * perdre le temps qu'il prétend gagner.
 *
 * Mais se souvenir est aussi un risque, et c'est ce que ces tests gardent :
 * un geste déjà complet n'est pas un sujet qu'on poursuit, et une phrase qui
 * ne nomme rien ne complète rien.
 */
const suite = (avant: string, apres: string) => {
  const precedente = comprendre(avant);
  if (!precedente) throw new Error(`« ${avant} » n'est pas compris`);
  return completer(precedente, apres);
};

describe('poursuivre la question d’avant (§71)', () => {
  it('change de produit sans changer de question', () => {
    const vu = suite('il me reste combien de ciment', 'et de fer ?');
    expect(vu?.outil).toBe('chercher_produit');
    expect(vu?.args.terme).toBe('fer');
  });

  it('accepte le nom qu’on lui donne après « Lequel ? »', () => {
    // La vente ne nommait pas assez précisément : le gérant précise, et la
    // quantité déjà dite ne se retape pas.
    const vu = suite('vends 3 sacs', 'ciment CIMTOGO');
    expect(vu?.outil).toBe('enregistrer_vente');
    expect(vu?.args.terme).toBe('ciment CIMTOGO');
    expect(vu?.args.quantite).toBe(3);
  });

  it('accepte le nombre qu’on lui donne après « Combien ? »', () => {
    const vu = suite('vends du ciment', '3');
    expect(vu?.outil).toBe('enregistrer_vente');
    expect(vu?.args.terme).toBe('ciment');
    expect(vu?.args.quantite).toBe(3);
  });

  it('complète le montant d’une dépense', () => {
    const vu = suite('dépense carburant', '5000');
    expect(vu?.outil).toBe('enregistrer_depense');
    expect(vu?.args.montant).toBe(5000);
    expect(vu?.args.poste).toBe('TRANSPORT');
  });

  it('ne remplit que les creux, jamais ce qui est déjà dit', () => {
    // Deux creux sur une vente sans quantité : le premier nombre est la
    // quantité, le second ce qui a été payé. Les intervertir vendrait trois
    // sacs contre dix mille sacs.
    const vu = suite('vends du ciment', '3, il a payé 10000');
    expect(vu?.args.quantite).toBe(3);
    expect(vu?.args.montantPaye).toBe(10000);
  });

  it('ne rouvre pas un geste que le gérant a déjà sous les yeux', () => {
    // « Vends 3 sacs de ciment » est complet : la carte est affichée, avec
    // son montant. Un « 10000 » tapé ensuite ne doit pas la réécrire dans son
    // dos — le gérant annule et redit sa phrase, et il voit ce qu'il signe.
    expect(suite('vends 3 sacs de ciment', '10000')).toBeNull();
  });

  it('ne range pas un montant dans la case de la quantité', () => {
    // « Vends 3 sacs » puis « ciment, payé 10000 » : la quantité est déjà
    // dite. Si le nombre qui arrive écrasait la première case venue, on
    // vendrait dix mille sacs.
    const vu = suite('vends 3 sacs', 'ciment, il a payé 10000');
    expect(vu?.args.quantite).toBe(3);
    expect(vu?.args.montantPaye).toBe(10000);
    expect(vu?.args.terme).toBe('ciment');
  });

  it('ne prend pas un mot d’une lettre pour un produit', () => {
    const vu = suite('vends du ciment', 'il y a 3');
    expect(vu?.args.terme).toBe('ciment');
    expect(vu?.args.quantite).toBe(3);
  });

  it('ne poursuit pas un geste déjà complet', () => {
    // Le piège qui coûterait cher : après « vends 2 sacs de ciment », un
    // simple « fer ? » ne doit surtout pas proposer d'en vendre deux.
    expect(suite('vends 2 sacs de ciment, il a payé 8600', 'fer ?')).toBeNull();
    expect(suite('j’ai reçu 20 sacs de ciment', 'tôle')).toBeNull();
  });

  it('ne poursuit rien sur une phrase qui ne dit rien', () => {
    expect(suite('il me reste combien de ciment', 'bonjour')).toBeNull();
    expect(suite('vends du ciment', 'ok')).toBeNull();
    expect(suite('il me reste combien de ciment', '')).toBeNull();
  });

  it('ne poursuit pas une question qui ne porte sur rien de nommé', () => {
    // « Combien j'ai vendu aujourd'hui » puis « ciment » n'est pas une suite :
    // c'est une nouvelle question, que les règles ordinaires sauront lire.
    expect(suite('combien j’ai vendu aujourd’hui', 'ciment')).toBeNull();
    expect(suite('qui me doit de l’argent', 'ciment')).toBeNull();
  });
});
