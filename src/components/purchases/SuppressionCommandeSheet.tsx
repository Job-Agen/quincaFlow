'use client';

import { useState } from 'react';
import { Button, Notice, Sheet } from '@/components/ui';
import { api } from '@/client/api';
import { errorMessage } from '@/utils/errors';

/**
 * La confirmation d'une suppression de commande (§58).
 *
 * Partagée par la liste et par la fiche : la phrase qui prévient qu'il n'y a
 * pas de corbeille ne doit pas exister en deux exemplaires, sans quoi l'une
 * des deux finira par être adoucie sans l'autre.
 *
 * Elle porte l'appel elle-même. L'écran qui l'ouvre dit seulement quoi faire
 * ensuite — revenir à la liste, ou recharger celle qu'on regarde.
 */
export default function SuppressionCommandeSheet({
  id,
  reference,
  lignes,
  onClose,
  onSupprimee,
}: {
  id: string;
  reference: string;
  /** Nombre de lignes de la commande, pour que le gérant mesure ce qui part. */
  lignes: number;
  onClose: () => void;
  onSupprimee: () => void;
}) {
  const [effacement, setEffacement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function supprimer() {
    setEffacement(true);
    setErreur(null);
    try {
      await api.delete(`/api/purchase-orders/${encodeURIComponent(id)}`);
      onSupprimee();
    } catch (souci) {
      // Le refus du serveur est relayé tel quel : c'est lui qui connaît l'état
      // réel de la commande, l'écran peut avoir une liste vieille d'une minute.
      setErreur(errorMessage(souci));
      setEffacement(false);
    }
  }

  return (
    <Sheet open title="Supprimer la commande" onClose={onClose}>
      {erreur ? <Notice tone="error">{erreur}</Notice> : null}
      <p className="small">
        La commande <strong>{reference}</strong> et ses {lignes} ligne(s) seront effacées. Il n’y a
        pas de corbeille.
      </p>
      <p className="small muted">
        Si vous l’avez déjà envoyée au fournisseur, annulez-la plutôt : elle restera dans
        l’historique.
      </p>
      <Button variant="danger" block disabled={effacement} onClick={supprimer}>
        {effacement ? 'Suppression…' : 'Supprimer définitivement'}
      </Button>
    </Sheet>
  );
}
