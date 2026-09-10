import { randomUUID } from 'crypto';

/**
 * Identifiant d'une ligne, généré côté application.
 *
 * Le pilote HTTP de Neon exécute une transaction comme un tableau de requêtes
 * indépendantes : aucune ne peut lire le `RETURNING id` d'une autre. Générer les
 * identifiants avant d'écrire est ce qui rend possible l'insertion d'un agrégat
 * complet (vente + lignes + paiement + mouvements) en une seule transaction.
 */
export function newId(prefix) {
  const uuid = randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}
