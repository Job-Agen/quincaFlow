import { describe, expect, it } from 'vitest';
import {
  allocateRepayment,
  rankDebtors,
  reminderMessage,
  saleBalance,
  tooMuch,
  totalOwed,
  whatsappLink,
  whatsappNumber,
  type OpenSale,
} from '../credit';

/** Espaces fines insécables de `toLocaleString('fr-FR')`, ramenées à une espace. */
const normalise = (texte: string) => texte.replace(/[  ]/g, ' ');

function vente(partial: Partial<OpenSale> & { id: string }): OpenSale {
  return {
    reference: `VE-${partial.id}`,
    total: 0,
    amount_paid: 0,
    created_at: '2026-01-01T08:00:00Z',
    ...partial,
  };
}

describe('solde d’une vente', () => {
  it('retranche ce qui est déjà encaissé', () => {
    expect(saleBalance(50000, 20000)).toBe(30000);
  });

  it('ne descend jamais sous zéro', () => {
    // Un encaissement supérieur au total — une erreur de saisie corrigée plus
    // tard — ne doit pas créer une dette négative qui réduirait les autres.
    expect(saleBalance(10000, 12000)).toBe(0);
  });

  it('arrondit au franc près', () => {
    expect(saleBalance(318.755, 0)).toBe(318.76);
  });
});

describe('imputation d’un remboursement', () => {
  const ventes: OpenSale[] = [
    vente({ id: 'b', total: 30000, amount_paid: 0, created_at: '2026-03-02T08:00:00Z' }),
    vente({ id: 'a', total: 20000, amount_paid: 5000, created_at: '2026-01-15T08:00:00Z' }),
    vente({ id: 'c', total: 10000, amount_paid: 0, created_at: '2026-04-20T08:00:00Z' }),
  ];

  it('solde la plus ancienne ardoise d’abord, puis déborde sur la suivante', () => {
    // « a » doit 15 000 (20 000 − 5 000) : 20 000 la solde et laisse 5 000 pour « b ».
    const parts = allocateRepayment(20000, ventes);
    expect(parts.map((p) => p.saleId)).toEqual(['a', 'b']);
    expect(parts[0]).toMatchObject({ amount: 15000, amountPaid: 20000 });
    expect(parts[1]).toMatchObject({ amount: 5000, amountPaid: 5000 });
  });

  it('s’arrête dès que le versement est épuisé', () => {
    const parts = allocateRepayment(10000, ventes);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ saleId: 'a', amount: 10000, amountPaid: 15000 });
  });

  it('ne verse à aucune vente plus qu’elle ne doit', () => {
    const parts = allocateRepayment(100000, ventes);
    for (const part of parts) {
      const source = ventes.find((v) => v.id === part.saleId);
      expect(part.amountPaid).toBeLessThanOrEqual(source!.total);
    }
  });

  it('répartit exactement le montant versé, sans perte ni invention', () => {
    const parts = allocateRepayment(42000, ventes);
    const somme = parts.reduce((total, part) => total + part.amount, 0);
    expect(somme).toBe(42000);
  });

  it('ignore les ventes déjà soldées', () => {
    const avecSoldee = [
      vente({ id: 'x', total: 9000, amount_paid: 9000, created_at: '2025-01-01T08:00:00Z' }),
      ...ventes,
    ];
    expect(allocateRepayment(5000, avecSoldee).map((p) => p.saleId)).toEqual(['a']);
  });

  it('n’impute rien d’un versement nul', () => {
    expect(allocateRepayment(0, ventes)).toEqual([]);
  });

  it('ordonne aussi bien des dates que des chaînes', () => {
    // Le pilote HTTP de Neon rend une chaîne ISO, `pg` rend un `Date`. Les deux
    // arrivent ici, et l'imputation doit trouver le même ordre : comparer les
    // chaînes a planté au premier remboursement joué contre un Postgres local.
    const enDates: OpenSale[] = ventes.map((une) => ({
      ...une,
      created_at: new Date(une.created_at as string),
    }));
    expect(allocateRepayment(20000, enDates).map((p) => p.saleId)).toEqual(['a', 'b']);
  });

  it('ne modifie pas la liste qu’on lui confie', () => {
    const copie = [...ventes];
    allocateRepayment(15000, ventes);
    expect(ventes).toEqual(copie);
  });
});

describe('dette totale', () => {
  it('additionne les soldes, pas les totaux', () => {
    expect(
      totalOwed([
        vente({ id: 'a', total: 20000, amount_paid: 5000 }),
        vente({ id: 'b', total: 30000, amount_paid: 30000 }),
      ])
    ).toBe(15000);
  });
});

describe('versement excessif', () => {
  it('refuse ce qui dépasse la dette', () => {
    expect(tooMuch(15001, 15000)).toBe(true);
  });

  it('accepte le solde exact', () => {
    expect(tooMuch(15000, 15000)).toBe(false);
  });

  it('ne se laisse pas prendre par un reste d’arrondi', () => {
    // Les deux montants sont ramenés au centime : un reste plus fin, laissé par
    // une division au conditionnement, ne doit pas faire refuser un solde exact.
    expect(tooMuch(15000.004, 15000)).toBe(false);
    expect(tooMuch(15000, 14999.997)).toBe(false);
  });

  it('refuse dès le centime de trop', () => {
    expect(tooMuch(15000.01, 15000)).toBe(true);
  });
});

describe('classement des débiteurs', () => {
  const debiteurs = [
    { id: '1', name: 'Afi', phone: null, owed: 12000, oldestDays: 10 },
    { id: '2', name: 'Kodjo', phone: null, owed: 48000, oldestDays: 40 },
    { id: '3', name: 'Zino', phone: null, owed: 0, oldestDays: null },
    { id: '4', name: 'Bema', phone: null, owed: 24000, oldestDays: 5 },
  ];

  it('range du plus gros débiteur au plus petit', () => {
    expect(rankDebtors(debiteurs).map((d) => d.name)).toEqual(['Kodjo', 'Bema', 'Afi']);
  });

  it('écarte ceux qui ne doivent rien', () => {
    expect(rankDebtors(debiteurs).map((d) => d.name)).not.toContain('Zino');
  });

  it('mesure chaque barre sur la plus longue', () => {
    const [premier, deuxieme] = rankDebtors(debiteurs);
    expect(premier!.share).toBe(1);
    expect(deuxieme!.share).toBe(0.5);
  });

  it('s’arrête au nombre demandé', () => {
    expect(rankDebtors(debiteurs, 2)).toHaveLength(2);
  });

  it('départage deux dettes égales par le nom', () => {
    const egaux = [
      { id: '1', name: 'Zoé', phone: null, owed: 5000, oldestDays: 1 },
      { id: '2', name: 'Ama', phone: null, owed: 5000, oldestDays: 1 },
    ];
    expect(rankDebtors(egaux).map((d) => d.name)).toEqual(['Ama', 'Zoé']);
  });

  it('ne divise pas par zéro quand personne ne doit rien', () => {
    expect(rankDebtors([{ id: '1', name: 'Afi', phone: null, owed: 0, oldestDays: null }])).toEqual(
      []
    );
  });
});

describe('numéro WhatsApp', () => {
  it('complète un numéro local par l’indicatif de la boutique', () => {
    expect(whatsappNumber('90 00 00 00')).toBe('22890000000');
  });

  it('reconnaît les trois façons d’écrire le même numéro', () => {
    expect(whatsappNumber('+228 90-00-00-00')).toBe('22890000000');
    expect(whatsappNumber('00228 90000000')).toBe('22890000000');
    expect(whatsappNumber('90000000')).toBe('22890000000');
  });

  it('refuse plutôt que de deviner sur un numéro trop court', () => {
    // Ouvrir une conversation avec un inconnu est pire que ne rien proposer.
    expect(whatsappNumber('123')).toBeNull();
    expect(whatsappNumber('')).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });

  it('suit l’indicatif d’un autre pays quand on le lui donne', () => {
    expect(whatsappNumber('0612345678', '33')).toBe('330612345678');
  });
});

describe('lien de relance', () => {
  it('porte le message en paramètre', () => {
    const lien = whatsappLink('90000000', 'Bonjour Afi, il reste 5 000 FCFA.');
    expect(lien).toContain('https://wa.me/22890000000?text=');
    expect(decodeURIComponent(lien!.split('text=')[1]!)).toBe('Bonjour Afi, il reste 5 000 FCFA.');
  });

  it('n’existe pas sans numéro utilisable', () => {
    expect(whatsappLink('', 'peu importe')).toBeNull();
  });
});

describe('message de relance', () => {
  const base = { customerName: 'Afi Dossou', businessName: 'Quincaillerie Le Bâtisseur' };

  it('nomme le client, la boutique et le montant dû', () => {
    const texte = normalise(reminderMessage({ ...base, owed: 15000, openCount: 1 }));
    expect(texte).toContain('Afi Dossou');
    expect(texte).toContain('Quincaillerie Le Bâtisseur');
    expect(texte).toContain('15 000 FCFA');
  });

  it('accorde le nombre d’achats', () => {
    expect(reminderMessage({ ...base, owed: 1000, openCount: 1 })).toContain('votre achat');
    expect(reminderMessage({ ...base, owed: 1000, openCount: 3 })).toContain('vos 3 achats');
  });

  it('laisse une porte ouverte, et ne menace pas', () => {
    const texte = reminderMessage({ ...base, owed: 15000, openCount: 2 }).toLowerCase();
    expect(texte).toContain('plusieurs fois');
    expect(texte).not.toMatch(/urgent|immédiat|poursuite|dernier avertissement/);
  });

  it('suit la devise de la boutique', () => {
    expect(normalise(reminderMessage({ ...base, owed: 1500, currency: 'EUR' }))).toContain(
      '1 500 EUR'
    );
  });
});
