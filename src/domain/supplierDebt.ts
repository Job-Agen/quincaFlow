import { round2, toNumber } from '../utils/money';

/**
 * Ce que la boutique doit à ses fournisseurs (§53).
 *
 * C'est l'ardoise du §45 vue de l'autre côté du comptoir. Le gérant prend sa
 * livraison de ciment le lundi, règle la moitié tout de suite et le reste à la
 * fin du mois ; jusqu'ici l'application ne gardait aucune trace de ce reste, et
 * c'est pourtant l'argent qu'il doit mettre de côté avant de se croire riche
 * d'une bonne journée de ventes.
 *
 * Une règle, et une seule, fait toute la différence avec la dette client : **on
 * ne doit que ce qui est arrivé**. Une commande passée n'engage pas un
 * paiement ; une commande livrée, si. Calculer la dette sur le total estimé
 * ferait apparaître des milliers de francs dus pour des sacs encore chez le
 * fournisseur — et la ferait disparaître le jour où une commande est annulée
 * après livraison partielle.
 */

/** Une ligne de commande, telle que le calcul de la dette la regarde. */
export interface ReceivedLine {
  readonly quantity_received: number;
  readonly unit_cost: number;
}

/** La valeur de ce qui a réellement été livré, aux prix de la commande. */
export function receivedValue(lines: readonly ReceivedLine[]): number {
  return round2(
    lines.reduce(
      (somme, ligne) => somme + toNumber(ligne.quantity_received) * toNumber(ligne.unit_cost),
      0
    )
  );
}

/** Ce qu'une commande doit encore, jamais négatif. */
export function orderBalance(received: unknown, amountPaid: unknown): number {
  return round2(Math.max(0, toNumber(received) - toNumber(amountPaid)));
}

/**
 * Vrai si un règlement dépasse ce qui reste dû.
 *
 * La règle est celle du carnet client (§45), et elle est importée plutôt que
 * réécrite : deux seuils de dépassement qui divergeraient d'un centime
 * donneraient deux comportements pour le même geste.
 */
export { tooMuch } from './credit';
