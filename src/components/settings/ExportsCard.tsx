'use client';

import { useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  HardDriveDownload,
  Package,
  Receipt,
  Users,
} from 'lucide-react';
import { Button, Card, CardHead, Notice } from '@/components/ui';

/** Les quatre fichiers, dans l'ordre où le gérant les demande. */
const FICHIERS = [
  {
    kind: 'stocks',
    titre: 'Inventaire',
    detail: 'Produits, prix, marges, stock et valeur — au coût et à la vente.',
    icone: Package,
  },
  {
    kind: 'ventes',
    titre: 'Ventes',
    detail: 'Une ligne par article vendu, avec son coût, sa marge et son règlement.',
    icone: Receipt,
  },
  {
    kind: 'clients',
    titre: 'Clients et dettes',
    detail: 'Total acheté, solde dû, nombre d’achats non soldés.',
    icone: Users,
  },
] as const;

/**
 * Sauvegardes et exports (§48).
 *
 * Le gérant n'est pas le seul à regarder ses chiffres : il y a le comptable en
 * fin d'exercice, l'associé, parfois la banque. Aucun d'eux n'ouvrira
 * l'application — ils veulent un fichier.
 *
 * Le téléchargement passe par une ancre et non par `fetch` : le navigateur sait
 * déjà enregistrer un fichier que le serveur lui envoie en pièce jointe, et le
 * reconstruire en mémoire pour le re-télécharger ne ferait qu'ajouter une
 * occasion d'échouer sur un téléphone à faible mémoire.
 *
 * « Tout télécharger » enchaîne les trois, espacés : lancés dans la même
 * milliseconde, les navigateurs n'en retiennent qu'un et bloquent les autres
 * comme des fenêtres surgissantes.
 */
export default function ExportsCard() {
  const [enCours, setEnCours] = useState(false);

  function telecharger(kind: string) {
    const lien = document.createElement('a');
    lien.href = `/api/exports/${kind}`;
    lien.download = '';
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
  }

  async function toutTelecharger() {
    setEnCours(true);
    for (const [index, fichier] of FICHIERS.entries()) {
      if (index > 0) await new Promise((suite) => setTimeout(suite, 900));
      telecharger(fichier.kind);
    }
    setEnCours(false);
  }

  return (
    <Card pad className="stack" style={{ gap: 12 }}>
      <CardHead
        title="Sauvegardes et exports"
        action={<FileSpreadsheet size={18} className="muted" />}
      />
      <p className="small muted">
        Trois fichiers CSV, lisibles directement par Excel, Google Sheets et LibreOffice — accents
        compris.
      </p>

      <div className="exports">
        {FICHIERS.map(({ kind, titre, detail, icone: Icone }) => (
          <button
            key={kind}
            type="button"
            className="exports__ligne"
            onClick={() => telecharger(kind)}
          >
            <span className="exports__icone" aria-hidden="true">
              <Icone size={18} />
            </span>
            <span className="exports__corps">
              <strong>{titre}</strong>
              <span className="small muted">{detail}</span>
            </span>
            <Download size={18} className="muted" />
          </button>
        ))}
      </div>

      <Button variant="soft" block disabled={enCours} onClick={toutTelecharger}>
        <Download size={18} />
        {enCours ? 'Téléchargement…' : 'Tout télécharger (3 fichiers)'}
      </Button>

      <hr className="exports__filet" />

      <p className="small muted">
        La sauvegarde reprend <strong>tout</strong> ce que la boutique contient, dans un seul
        fichier. C’est ce qu’on garde avant de fermer une boutique, et ce qu’on emporte si l’on
        quitte un jour ce logiciel. Elle n’est pas chiffrée : rangez-la comme vous rangeriez votre
        cahier.
      </p>
      <Button variant="ghost" block onClick={() => telecharger('sauvegarde')}>
        <HardDriveDownload size={18} />
        Sauvegarde complète (JSON)
      </Button>

      <Notice tone="info">
        Ces fichiers portent vos prix d’achat et vos marges. Seul le propriétaire peut les
        télécharger.
      </Notice>
    </Card>
  );
}
