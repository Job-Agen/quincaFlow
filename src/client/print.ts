'use client';

import { useSyncExternalStore } from 'react';
import { isTicket, pageRule, readFormat, type PrintFormat } from '@/domain/ticket';

const CLE = 'maquincaillerie.format-impression';

/** Le ménage de l'impression en cours, s'il reste à faire. */
let aNettoyer: (() => void) | null = null;

/**
 * Impression au format choisi (§54).
 *
 * `@page` ne se sélectionne pas comme une classe : la taille de la feuille ne
 * peut venir que d'une règle de haut niveau. On l'injecte donc le temps de
 * l'impression, et on la retire après — laissée en place, elle imposerait la
 * largeur d'un ticket à la prochaine impression d'autre chose.
 *
 * Le retrait attend `afterprint`, et rien d'autre. Ni la ligne qui suit
 * `print()` — dans plusieurs navigateurs elle s'exécute pendant que l'aperçu
 * est encore ouvert —, ni un délai de secours : le gérant laisse volontiers la
 * fenêtre d'impression ouverte plus de deux secondes, et la règle disparaîtrait
 * sous ses yeux pour imprimer une A4 sur un rouleau de 58 mm.
 *
 * Là où `afterprint` ne se déclenche pas, c'est l'impression suivante qui fait
 * le ménage de la précédente : rien ne traîne jamais au-delà d'un tour.
 */
export function printWith(format: PrintFormat): void {
  aNettoyer?.();

  const style = document.createElement('style');
  style.textContent = pageRule(format);
  document.head.appendChild(style);

  const racine = document.documentElement;
  if (isTicket(format)) racine.dataset.ticket = String(format);

  const nettoyer = () => {
    aNettoyer = null;
    style.remove();
    delete racine.dataset.ticket;
  };
  aNettoyer = nettoyer;
  window.addEventListener('afterprint', nettoyer, { once: true });

  window.print();
}

/**
 * Le dernier format utilisé.
 *
 * Une boutique a une imprimante, pas trois : le gérant choisit une fois. Le
 * stockage local peut être vide, refusé ou vidé — toute lecture douteuse rend
 * la feuille A4, qui est le format qu'on ne peut pas rater.
 */
function rememberedFormat(): PrintFormat {
  try {
    return readFormat(window.localStorage.getItem(CLE));
  } catch {
    return 'A4';
  }
}

/** Les écrans qui affichent le format choisi, à prévenir quand il change. */
const abonnes = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  abonnes.add(onChange);
  return () => {
    abonnes.delete(onChange);
  };
}

/**
 * Le format courant, lu du stockage et partagé par les écrans.
 *
 * `useSyncExternalStore` plutôt qu'un état posé dans un effet : le serveur rend
 * « A4 », le navigateur bascule sur le format retenu dès l'hydratation, et les
 * deux rendus ne divergent jamais. L'instantané est une valeur simple, donc
 * stable tant que le stockage ne bouge pas.
 */
export function usePrintFormat(): [PrintFormat, (format: PrintFormat) => void] {
  const format = useSyncExternalStore(subscribe, rememberedFormat, () => 'A4' as PrintFormat);

  const choisir = (nouveau: PrintFormat) => {
    try {
      window.localStorage.setItem(CLE, String(nouveau));
    } catch {
      // Navigation privée, stockage plein ou bloqué : le choix ne survivra pas
      // à la page, et ce n'est pas une raison pour empêcher d'imprimer. L'écran
      // est prévenu quand même — il doit refléter ce qui vient d'être choisi.
    }
    abonnes.forEach((prevenir) => prevenir());
  };

  return [format, choisir];
}
