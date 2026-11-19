import { describe, expect, it } from 'vitest';
import { aplatir, comprendre, nombres, terme } from '../comprendre';

/**
 * Comprendre une phrase de comptoir (§71).
 *
 * Ces tests sont le cahier des charges de l'assistant : chaque phrase est une
 * phrase qu'un gérant togolais tape vraiment, au pouce, sur un téléphone.
 * Ce qu'ils gardent n'est pas la grammaire — c'est que la bonne chose arrive,
 * et surtout que rien n'arrive quand la phrase n'est pas claire.
 */
describe('mise à plat (§71)', () => {
  it('efface accents, majuscules et ponctuation', () => {
    expect(aplatir('Combien j’ai VENDU aujourd’hui ?')).toBe("combien j'ai vendu aujourd'hui");
    expect(aplatir('  Électricité   ')).toBe('electricite');
  });
});

describe('les nombres d’une phrase (§71)', () => {
  it('recoud les milliers écrits avec une espace', () => {
    // « 10 000 » est un montant, pas deux nombres. Le lire comme 10 puis 0
    // enregistrerait une vente payée dix francs.
    expect(nombres('il a paye 10 000')).toEqual([10000]);
    expect(nombres('12 500 francs')).toEqual([12500]);
  });

  it('lit les décimales à la virgule, comme on les écrit ici', () => {
    expect(nombres('2,5 sacs')).toEqual([2.5]);
  });

  it('comprend les petits nombres en lettres', () => {
    expect(nombres('vends trois sacs')).toEqual([3]);
    expect(nombres('deux barres')).toEqual([2]);
  });

  it('ne mélange pas les lettres aux chiffres', () => {
    // « trois sacs à 2 500 » : si l'on empilait les deux, l'ordre dirait
    // n'importe quoi. Les chiffres gagnent, et ils suffisent.
    expect(nombres('trois sacs a 2 500')).toEqual([2500]);
  });

  it('ne trouve rien quand il n’y a rien', () => {
    expect(nombres('qui me doit de l’argent')).toEqual([]);
  });
});

describe('le nom que la phrase désigne (§71)', () => {
  it('retire les verbes, les nombres, les unités et les liaisons', () => {
    expect(terme('vends 3 sacs de ciment', /\b(vends|vendu)\w*\b/g)).toBe('ciment');
    expect(terme('il me reste combien de fer 8', /\b(reste|combien)\w*\b/g)).toBe('fer');
  });

  it('rend une chaîne vide quand rien n’est nommé', () => {
    expect(terme('vends 3 sacs', /\b(vends)\w*\b/g)).toBe('');
  });
});

describe('ce que la phrase demande (§71)', () => {
  const dit = (phrase: string) => comprendre(phrase);

  it('reconnaît les questions du quotidien', () => {
    expect(dit('combien j’ai vendu aujourd’hui')?.outil).toBe('resume_boutique');
    expect(dit('ça va la boutique ?')?.outil).toBe('resume_boutique');
    expect(dit('qu’est-ce que je dois racheter')?.outil).toBe('stock_bas');
    expect(dit('qui me doit de l’argent')?.outil).toBe('clients_endettes');
    expect(dit('mes prochaines échéances')?.outil).toBe('charges_a_venir');
    expect(dit('mon bénéfice du mois')?.outil).toBe('rapport_financier');
    expect(dit('les dernières ventes')?.outil).toBe('ventes_recentes');
  });

  it('cherche un produit quand la phrase en nomme un', () => {
    const vu = dit('il me reste combien de ciment');
    expect(vu?.outil).toBe('chercher_produit');
    expect(vu?.args.terme).toBe('ciment');
  });

  it('comprend la période d’un rapport', () => {
    expect(dit('mon bénéfice le mois dernier')?.args.periode).toBe('mois_dernier');
    expect(dit('ma marge sur 30 jours')?.args.periode).toBe('30j');
    expect(dit('mon bénéfice depuis le début')?.args.periode).toBe('tout');
    expect(dit('mon bénéfice')?.args.periode).toBe('mois');
  });

  it('lit une vente avec sa quantité et ce qui a été payé', () => {
    const vente = dit('vends 3 sacs de ciment, il a payé 10000');
    expect(vente?.outil).toBe('enregistrer_vente');
    expect(vente?.args.terme).toBe('ciment');
    expect(vente?.args.quantite).toBe(3);
    expect(vente?.args.montantPaye).toBe(10000);
  });

  it('ne confond pas la quantité avec le paiement', () => {
    // Le piège : deux nombres dans la phrase. « payé » dit lequel est lequel,
    // et l'inverser vendrait trois sacs contre trois francs.
    const vente = dit('vendu 2 fers a beton paye 5000');
    expect(vente?.args.quantite).toBe(2);
    expect(vente?.args.montantPaye).toBe(5000);
  });

  it('ne prend pas le nombre d’un nom de produit pour un paiement', () => {
    // « Ciment 42,5 », « Fer 8 », « Tôle 30 » : les noms portent des nombres.
    // Sans le mot « payé » pour trancher, le 42,5 du nom deviendrait le
    // montant encaissé, et la vente serait enregistrée à quarante francs.
    const vente = dit('vends 2 sacs de ciment 42,5 paye 5000');
    expect(vente?.args.quantite).toBe(2);
    expect(vente?.args.montantPaye).toBe(5000);
  });

  it('laisse le paiement vide quand la phrase n’en dit rien', () => {
    const vente = dit('vends 4 sacs de ciment');
    expect(vente?.args.quantite).toBe(4);
    expect(vente?.args.montantPaye).toBeNull();
  });

  it('distingue ce qui entre en stock de ce qui en sort', () => {
    const entree = dit('j’ai reçu 20 sacs de ciment');
    expect(entree?.outil).toBe('ajuster_stock');
    expect(entree?.args.quantite).toBe(20);
    expect(entree?.args.motif).toBe('réassort');

    const casse = dit('3 sacs de ciment cassés');
    expect(casse?.outil).toBe('ajuster_stock');
    expect(casse?.args.quantite).toBe(-3);
    expect(casse?.args.motif).toBe('casse');
  });

  it('range une dépense dans son poste', () => {
    const ceet = dit('j’ai payé la facture CEET 18000');
    expect(ceet?.outil).toBe('enregistrer_depense');
    expect(ceet?.args.poste).toBe('UTILITIES');
    expect(ceet?.args.montant).toBe(18000);

    expect(dit('dépense carburant 5000')?.args.poste).toBe('TRANSPORT');
    expect(dit('dépense 2000 pour des clous')?.args.poste).toBe('OTHER');
  });

  it('sépare payer une charge de noter une dépense', () => {
    // « payé le loyer » relance le chrono du §70 ; « payé 2000 » ne fait
    // qu'entrer une dépense. Les confondre fausserait les échéances.
    expect(dit('j’ai payé le loyer')?.outil).toBe('payer_charge');
    expect(dit('j’ai payé 2000')?.outil).toBe('enregistrer_depense');
  });

  it('fait passer le geste avant la question', () => {
    // « vends 3 sacs de ciment » contient « ciment » : lu comme une question,
    // il répondrait « il vous reste 47 sacs » au lieu de vendre.
    expect(dit('vends 3 sacs de ciment')?.outil).toBe('enregistrer_vente');
  });

  it('lit les champs nommés d’un nouveau produit', () => {
    const neuf = dit('nouveau produit ciment achat 3900 vente 4300 stock 40');
    expect(neuf?.outil).toBe('creer_produit');
    expect(neuf?.args.terme).toBe('ciment');
    expect(neuf?.args.prixAchat).toBe(3900);
    expect(neuf?.args.prixVente).toBe(4300);
    expect(neuf?.args.stock).toBe(40);
  });

  it('ne devine pas quand il n’a pas compris', () => {
    // Le point le plus important du module. Une devinette sur une vente coûte
    // plus cher qu'un « je n'ai pas compris ».
    expect(dit('bonjour')).toBeNull();
    expect(dit('')).toBeNull();
    expect(dit('xyzzy')).toBeNull();
  });
});
