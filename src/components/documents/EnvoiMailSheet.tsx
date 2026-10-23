'use client';

import { useState } from 'react';
import { Button, Notice, Sheet, TextField } from '@/components/ui';
import { api } from '@/client/api';
import { errorMessage } from '@/utils/errors';
import type { ContactRow, Sale } from '@/types';

/**
 * Envoi de la facture par courriel (§57).
 *
 * L'adresse du client est proposée, jamais imposée : une entreprise fait
 * souvent envoyer ses factures à une adresse de comptabilité qui n'est pas
 * celle de la personne venue au comptoir. Le gérant corrige en une frappe.
 *
 * L'adresse corrigée n'est pas enregistrée sur la fiche d'ici : une adresse de
 * circonstance deviendrait silencieusement l'adresse du client, et la facture
 * suivante partirait au mauvais endroit.
 */
export default function EnvoiMailSheet({
  sale,
  client,
  onClose,
}: {
  sale: Sale;
  client: ContactRow | null;
  onClose: () => void;
}) {
  const [adresse, setAdresse] = useState(client?.email || '');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState<string | null>(null);

  async function envoyer() {
    setBusy(true);
    setErreur(null);
    try {
      const issue = await api.post<{ to: string }>(`/api/sales/${sale.id}/email`, { to: adresse });
      setEnvoye(issue.to);
    } catch (souci) {
      setErreur(errorMessage(souci));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open title="Envoyer par e-mail" onClose={onClose}>
      {erreur ? <Notice tone="error">{erreur}</Notice> : null}

      {envoye ? (
        <>
          <Notice tone="success">
            Facture {sale.invoice_reference} envoyée à {envoye}, en pièce jointe.
          </Notice>
          <Button block onClick={onClose}>
            Fermer
          </Button>
        </>
      ) : (
        <>
          <p className="small muted">
            La facture {sale.invoice_reference} part en PDF, telle qu’elle s’imprime.
          </p>

          <TextField
            label="Adresse du destinataire"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="comptabilite@entreprise.tg"
            hint={
              client?.email
                ? 'Adresse de la fiche client. Modifiez-la si la facture doit partir ailleurs.'
                : 'Ce client n’a pas d’adresse enregistrée.'
            }
            value={adresse}
            onChange={(event) => setAdresse(event.target.value)}
          />

          <Button block disabled={busy || !adresse.trim()} onClick={envoyer}>
            {busy ? 'Envoi…' : 'Envoyer la facture'}
          </Button>
        </>
      )}
    </Sheet>
  );
}
