'use client';

import { FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '@/components/ui';
import { printWith } from '@/client/print';

/**
 * Sortir le rapport de l'écran (§55).
 *
 * Trois destinataires, trois formats. Le comptable veut des colonnes : deux
 * CSV, le compte de résultat et la rentabilité par produit — séparés, parce
 * qu'un tableur lit des colonnes et non des sections. La banque ou l'associé
 * veulent une feuille : l'impression, qui donne aussi le PDF.
 *
 * Les fichiers portent la période affichée. Sans elle, le gérant qui regarde
 * le mois dernier téléchargerait le mois en cours sans rien remarquer — et
 * s'en apercevrait devant son comptable.
 */
export default function TelechargerRapport({ period }: { period: string }) {
  function telecharger(kind: string) {
    const lien = document.createElement('a');
    lien.href = `/api/exports/${kind}?period=${encodeURIComponent(period)}`;
    lien.download = '';
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
  }

  return (
    <div className="exports-row no-print">
      <Button variant="soft" size="sm" onClick={() => telecharger('rapport')}>
        <FileSpreadsheet size={16} />
        Résultat (CSV)
      </Button>
      <Button variant="soft" size="sm" onClick={() => telecharger('rentabilite')}>
        <FileSpreadsheet size={16} />
        Rentabilité (CSV)
      </Button>
      <Button
        variant="soft"
        size="sm"
        onClick={() => printWith('A4')}
        title="Choisissez Enregistrer au format PDF dans la fenêtre d’impression"
      >
        <Printer size={16} />
        Imprimer / PDF
      </Button>
    </div>
  );
}
