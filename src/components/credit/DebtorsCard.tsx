'use client';

import { TrendingDown } from 'lucide-react';
import DebtorsChart from '@/components/credit/DebtorsChart';
import { Card, CardHead } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { money } from '@/utils/format';
import type { RankedDebtor } from '@/domain/credit';

interface Classement {
  debtors: RankedDebtor[];
  totalOwed: number;
  debtorCount: number;
}

/**
 * Carte « Principaux débiteurs », en tête du répertoire client (§45).
 *
 * Elle ne s'affiche que s'il y a une dette : une carte vide en haut d'un écran
 * qu'on ouvre vingt fois par jour n'apprend rien et coûte un défilement. Une
 * erreur de chargement la fait disparaître de la même façon — le répertoire
 * reste utilisable, et le gérant n'a pas à comprendre un message de panne pour
 * chercher un numéro de téléphone.
 */
export default function DebtorsCard() {
  const { currency } = useSession();
  const { data } = useResource<Classement>('/api/debtors', { limit: 5 });

  if (!data || data.debtors.length === 0) return null;

  return (
    <Card pad className="stack" style={{ gap: 10 }}>
      <CardHead title="Principaux débiteurs" />
      {/* La phrase est sous le titre et non à côté : à 390 px, « 4 clients
        doivent 160 500 FCFA » ne tient pas sur la même ligne, et l'abréger en
        « 4 · 160 500 » demandait de deviner ce que compte le 4. */}
      <p className="small muted">
        <TrendingDown size={13} style={{ verticalAlign: -2 }} />{' '}
        {data.debtorCount === 1 ? '1 client doit' : `${data.debtorCount} clients doivent`}{' '}
        {money(data.totalOwed, currency)} au total.
      </p>
      <DebtorsChart debtors={data.debtors} currency={currency} />
    </Card>
  );
}
