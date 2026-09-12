/**
 * Numérotation des documents : VE-0001, FA-2026-0001, HS-0001, PO-0042, RC-0007.
 *
 * Le numéro n'est pas réservé avant l'écriture métier : il est calculé *dans*
 * la même transaction, par une CTE qui incrémente le compteur au moment de
 * l'INSERT. Une vente refusée — stock insuffisant, par exemple — annule donc
 * aussi son numéro, et la boutique n'émet pas sa première facture sous le
 * numéro 5.
 *
 * La continuité compte surtout pour la facture : une séquence à trous se lit,
 * lors d'un contrôle, comme des factures effacées. L'incrément reste atomique
 * même si deux vendeurs valident au même instant, `ON CONFLICT DO UPDATE`
 * sérialisant les accès à la ligne du compteur.
 */

const FORMATS = {
  SALE: { prefix: 'VE', pad: 4, yearly: false },
  INVOICE: { prefix: 'FA', pad: 4, yearly: true },
  OUT_OF_STOCK: { prefix: 'HS', pad: 4, yearly: false },
  PURCHASE_ORDER: { prefix: 'PO', pad: 4, yearly: false },
  RECEIPT: { prefix: 'RC', pad: 4, yearly: false },
};

/**
 * Décrit une séquence : la clé de son compteur et la façon de l'habiller.
 *
 * Les compteurs annuels (facture) repartent à 1 chaque année civile, d'où
 * l'année dans la clé.
 */
export function referenceFormat(kind) {
  const format = FORMATS[kind];
  if (!format) throw new Error(`Type de référence inconnu : ${kind}`);

  const year = new Date().getFullYear();
  return {
    counterKey: format.yearly ? `${kind}:${year}` : kind,
    prefix: format.yearly ? `${format.prefix}-${year}-` : `${format.prefix}-`,
    pad: format.pad,
  };
}
