import { redirect } from 'next/navigation';

/**
 * La liste des ventes est l'historique filtré sur les ventes (§24, §30).
 * Maintenir deux écrans quasi identiques les ferait diverger au premier
 * correctif ; cette route existe pour que l'URL du PRD reste valide.
 */
export default function SalesPage() {
  redirect('/history?kind=SALE');
}
