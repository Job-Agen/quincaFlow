import { describe, expect, it } from 'vitest';
import {
  canReceive,
  orderTotal,
  purchaseOrderMessage,
  receptionStatus,
  remainingOf,
} from '../purchase';

/** L'exemple du PRD : 50 sacs commandés, 30 reçus, puis les 20 derniers (§22). */
const order = (received: number) => [
  { quantity_ordered: 50, quantity_received: received },
  { quantity_ordered: 10, quantity_received: 0 },
];

/** La même commande vue à la saisie, avant tout enregistrement. */
const draft = [
  { quantity: 50, unitCost: 4000 },
  { quantity: 10, unitCost: 12000 },
];

describe('orderTotal', () => {
  it('additionne quantité × coût de chaque ligne', () => {
    expect(orderTotal(draft)).toBe(320000);
  });

  it('chiffre une ligne isolée', () => {
    expect(orderTotal([{ quantity: 3, unitCost: 1500 }])).toBe(4500);
  });
});

describe('remainingOf', () => {
  it('donne ce qui reste à livrer', () => {
    expect(remainingOf({ quantity_ordered: 50, quantity_received: 30 })).toBe(20);
  });

  it('ne descend jamais sous zéro', () => {
    expect(remainingOf({ quantity_ordered: 50, quantity_received: 60 })).toBe(0);
  });
});

describe('receptionStatus', () => {
  it("laisse le statut administratif tant que rien n'est reçu", () => {
    expect(receptionStatus(order(0), 'PAID')).toBe('PAID');
  });

  it('passe en partiellement livrée dès la première réception', () => {
    expect(receptionStatus(order(30), 'PAID')).toBe('PARTIALLY_RECEIVED');
  });

  it('ne passe à livrée que lorsque toutes les lignes sont soldées', () => {
    expect(receptionStatus(order(50), 'PAID')).toBe('PARTIALLY_RECEIVED');
    expect(
      receptionStatus(
        [
          { quantity_ordered: 50, quantity_received: 50 },
          { quantity_ordered: 10, quantity_received: 10 },
        ],
        'PAID'
      )
    ).toBe('RECEIVED');
  });

  it('laisse une commande annulée annulée', () => {
    expect(receptionStatus(order(50), 'CANCELLED')).toBe('CANCELLED');
  });
});

describe('canReceive', () => {
  it("autorise la réception tant qu'il reste des lignes", () => {
    expect(canReceive({ status: 'PAID' }, order(30))).toBe(true);
  });

  it('refuse une commande annulée', () => {
    expect(canReceive({ status: 'CANCELLED' }, order(0))).toBe(false);
  });

  it('refuse une commande entièrement livrée', () => {
    expect(
      canReceive({ status: 'RECEIVED' }, [
        { quantity_ordered: 50, quantity_received: 50 },
        { quantity_ordered: 10, quantity_received: 10 },
      ])
    ).toBe(false);
  });
});

/**
 * Bon de commande (§43).
 *
 * Ce qui est vérifié ici n'est pas la mise en forme — elle changera — mais ce
 * qui engage les deux parties : les montants du message doivent être ceux du
 * document, et un bon sans prix ne doit pas se présenter comme un bon.
 */

/**
 * Le message, espaces fines normalisées.
 *
 * `toLocaleString('fr-FR')` sépare les milliers par une espace insécable fine :
 * la comparer à une espace ordinaire ferait échouer des tests qui décrivent
 * pourtant le bon texte, et les littéraux resteraient illisibles.
 */
const texte = (...args: Parameters<typeof purchaseOrderMessage>) =>
  purchaseOrderMessage(...args).replace(/[\u00a0\u202f\u2009]/g, ' ');

const boutique = {
  name: 'Quincaillerie ABC',
  tagline: 'Matériaux & outillage',
  address: 'Lomé — Avenue de la Libération',
  phone: '90 11 22 33',
};

const lignes = [
  { productName: 'Ciment Diamond 50 kg', unitLabel: 'sac', quantity: 40, unitCost: 3800 },
  { productName: 'Fer à béton 8', unitLabel: 'barre', quantity: 20, unitCost: 4500 },
];

const entete = {
  reference: 'PO-0042',
  supplierName: 'Ets Kodjo',
  createdAt: '2026-10-10T09:00:00Z',
};

describe('purchaseOrderMessage', () => {
  it('nomme la boutique, son adresse et son téléphone', () => {
    const message = texte(entete, lignes, boutique);
    expect(message).toContain('*QUINCAILLERIE ABC*');
    expect(message).toContain('Lomé — Avenue de la Libération');
    expect(message).toContain('Tél : 90 11 22 33');
    // Le fournisseur doit savoir à qui répondre après avoir lu les lignes.
    expect(message.trimEnd().endsWith('Quincaillerie ABC — Tél : 90 11 22 33')).toBe(true);
  });

  it('porte le numéro, la date et le fournisseur', () => {
    const message = texte(entete, lignes, boutique);
    expect(message).toContain('*BON DE COMMANDE N° PO-0042*');
    expect(message).toContain('Date : 10/10/2026');
    expect(message).toContain('Fournisseur : Ets Kodjo');
  });

  it('chiffre chaque ligne : quantité, prix unitaire, total de ligne', () => {
    const message = texte(entete, lignes, boutique);
    expect(message).toContain('1. Ciment Diamond 50 kg');
    expect(message).toContain('40 sacs × 3 800 = 152 000 FCFA');
    expect(message).toContain('20 barres × 4 500 = 90 000 FCFA');
  });

  it('annonce un total qui est la somme des lignes', () => {
    const message = texte(entete, lignes, boutique);
    // 152 000 + 90 000, et c'est aussi ce que le document affiche (§43).
    expect(message).toContain('*TOTAL ESTIMÉ : 242 000 FCFA*');
    expect(orderTotal(lignes.map((l) => ({ quantity: l.quantity, unitCost: l.unitCost })))).toBe(
      242000
    );
  });

  it('reprend les observations quand il y en a', () => {
    expect(texte({ ...entete, notes: 'Livraison avant vendredi.' }, lignes, boutique)).toContain(
      'Observations : Livraison avant vendredi.'
    );
    expect(texte(entete, lignes, boutique)).not.toContain('Observations');
  });

  it('demande confirmation du prix et du délai', () => {
    expect(texte(entete, lignes, boutique)).toContain(
      'Merci de nous confirmer la disponibilité, le délai de livraison et le prix définitif.'
    );
  });

  it('respecte la devise de la boutique', () => {
    expect(texte(entete, lignes, boutique, 'EUR')).toContain('*TOTAL ESTIMÉ : 242 000 EUR*');
  });

  describe('sans prix, c’est une demande de prix', () => {
    const sansPrix = lignes.map((ligne) => ({ ...ligne, unitCost: 0 }));

    it('change le titre plutôt que de promettre un engagement', () => {
      const message = texte(entete, sansPrix, boutique);
      expect(message).toContain('*DEMANDE DE PRIX N° PO-0042*');
      expect(message).not.toContain('BON DE COMMANDE');
    });

    it('n’annonce aucun total : « 0 FCFA » serait faux', () => {
      const message = texte(entete, sansPrix, boutique);
      expect(message).not.toContain('TOTAL');
      expect(message).not.toContain('0 FCFA');
    });

    it('garde les quantités, sans multiplication vide', () => {
      const message = texte(entete, sansPrix, boutique);
      expect(message).toContain('40 sacs');
      expect(message).not.toContain('×');
    });

    it('demande le prix au lieu de le confirmer', () => {
      expect(texte(entete, sansPrix, boutique)).toContain(
        'Merci de nous communiquer vos prix et vos délais pour ces articles.'
      );
    });

    it('chiffre encore la commande dès qu’une seule ligne a un prix', () => {
      const message = texte(entete, [sansPrix[0]!, lignes[1]!], boutique);
      expect(message).toContain('*BON DE COMMANDE N° PO-0042*');
      expect(message).toContain('*TOTAL ESTIMÉ : 90 000 FCFA*');
    });
  });

  describe('commande annulée', () => {
    const annulee = { ...entete, cancelled: true };

    it('avertit avant tout le reste', () => {
      const message = texte(annulee, lignes, boutique);
      expect(message.startsWith('⚠️ *COMMANDE ANNULÉE*')).toBe(true);
    });

    it('ne réclame ni délai ni confirmation', () => {
      const message = texte(annulee, lignes, boutique);
      expect(message).toContain('Merci de ne pas donner suite à cette commande.');
      expect(message).not.toContain('délai de livraison');
    });
  });

  describe('ce qui manque ne casse rien', () => {
    it('se passe du numéro : une commande non enregistrée est un projet', () => {
      expect(texte({}, lignes, boutique)).toContain('*BON DE COMMANDE (projet)*');
    });

    it('se passe du fournisseur et de la boutique', () => {
      const message = texte({}, lignes, null);
      expect(message).not.toContain('Fournisseur :');
      expect(message).toContain('40 sacs × 3 800 = 152 000 FCFA');
    });

    it('accepte des quantités et des coûts en chaînes, comme un formulaire', () => {
      expect(
        texte(entete, [{ productName: 'Vis', quantity: '20', unitCost: '100' }], boutique)
      ).toContain('*TOTAL ESTIMÉ : 2 000 FCFA*');
    });

    it('ne laisse jamais trois sauts de ligne de suite', () => {
      expect(texte({}, lignes, null)).not.toMatch(/\n{3}/);
    });
  });
});
