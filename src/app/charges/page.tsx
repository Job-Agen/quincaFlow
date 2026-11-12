'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, Pencil, Plus } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Badge, Button, Card, Empty, Notice, Segmented, Skeleton } from '@/components/ui';
import ChargeSheet from '@/components/charges/ChargeSheet';
import RappelsToggle from '@/components/charges/RappelsToggle';
import PaiementChargeSheet from '@/components/charges/PaiementChargeSheet';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { etatCharge, phraseEcheance, phrasePeriode, type ChargeRow } from '@/domain/charge';
import { money, shortDate } from '@/utils/format';
import { errorMessage } from '@/utils/errors';

/**
 * Les charges qui reviennent (§66).
 *
 * Le loyer, les salaires, l'électricité. L'écran répond à une seule question —
 * « qu'est-ce que je dois payer, et quand ? » — et les plus pressantes sont en
 * tête parce que c'est le retard qui coûte.
 */

const VUES = [
  { value: 'actives', label: 'En cours' },
  { value: 'rangees', label: 'Rangées' },
];

/** Aujourd'hui en `YYYY-MM-DD`, comme la base la range. */
const aujourdhui = () => {
  const jour = new Date();
  return `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(
    jour.getDate()
  ).padStart(2, '0')}`;
};

export default function ChargesPage() {
  const { currency } = useSession();
  const [vue, setVue] = useState('actives');
  const [edition, setEdition] = useState<ChargeRow | 'nouvelle' | null>(null);
  const [paiement, setPaiement] = useState<ChargeRow | null>(null);
  const [aSupprimer, setASupprimer] = useState<ChargeRow | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { data, loading, error, reload } = useResource<ChargeRow[]>('/api/charges', {
    inactives: vue === 'rangees' ? '1' : '',
  });

  const jour = aujourdhui();
  const listees = useMemo(
    () => (data || []).filter((charge) => (vue === 'rangees' ? !charge.active : charge.active)),
    [data, vue]
  );

  async function supprimer(charge: ChargeRow) {
    setErreur(null);
    try {
      await api.delete(`/api/charges/${charge.id}`);
      setASupprimer(null);
      reload();
    } catch (souci) {
      setErreur(errorMessage(souci));
    }
  }

  return (
    <>
      <AppBar back="/more" title="Charges récurrentes" />

      <main className="page page--fab">
        <RappelsToggle />

        <Segmented options={VUES} value={vue} onChange={setVue} />

        {erreur ? <Notice tone="error">{erreur}</Notice> : null}
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading && !data ? <Skeleton count={3} height={76} /> : null}

        {data ? (
          <Card>
            {listees.length === 0 ? (
              <Empty
                icon={<CalendarClock size={26} className="muted" />}
                title={vue === 'rangees' ? 'Aucune charge rangée' : 'Aucune charge'}
                hint={
                  vue === 'rangees'
                    ? 'Une charge finie — un employé parti, un bail terminé — se range ici.'
                    : 'Loyer, salaires, électricité : enregistrez-les une fois, l’application vous rappellera l’échéance.'
                }
              />
            ) : (
              <div className="list">
                {listees.map((charge) => {
                  const etat = etatCharge(charge.next_due_on, jour);
                  return (
                    <div key={charge.id} className="list__row list__row--geste">
                      <button
                        type="button"
                        className="list__link"
                        onClick={() => setPaiement(charge)}
                      >
                        <div className="list__body">
                          <div className="list__title">{charge.label}</div>
                          {/* La périodicité seule : le nom que le gérant écrit
                            — « Salaire Kodjo », « Loyer boutique » — dit déjà
                            le poste, et une troisième mention renvoyait la
                            ligne à la ligne. */}
                          <div className="list__sub">
                            {phrasePeriode(charge.interval_months)}
                          </div>
                        </div>
                        <div className="list__end">
                          <strong className="num">{money(charge.amount, currency)}</strong>
                          {/* L'échéance se dit en jours, pas en date : « 11/12 »
                            oblige le gérant à compter, et le retard se perd. */}
                          <Badge
                            tone={
                              etat === 'en-retard' ? 'red' : etat === 'bientot' ? 'amber' : 'grey'
                            }
                          >
                            {charge.active
                              ? phraseEcheance(charge.next_due_on, jour)
                              : shortDate(charge.next_due_on)}
                          </Badge>
                        </div>
                      </button>
                      {/* Un seul signe en bout de ligne : deux se disputaient
                        la largeur et renvoyaient la périodicité à la ligne.
                        L'effacement vit dans la feuille de modification, où
                        il est de toute façon plus à sa place. */}
                      <button
                        type="button"
                        className="list__supprimer"
                        aria-label={`Modifier ${charge.label}`}
                        onClick={() => setEdition(charge)}
                      >
                        <Pencil size={17} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        ) : null}

        {listees.length > 0 ? (
          <p className="small muted">
            Touchez une charge pour enregistrer son paiement : la dépense est écrite et la
            prochaine échéance repart de ce jour-là.
          </p>
        ) : null}
      </main>

      {edition ? (
        <ChargeSheet
          charge={edition === 'nouvelle' ? null : edition}
          onClose={() => setEdition(null)}
          onEnregistree={() => {
            setEdition(null);
            reload();
          }}
          onSupprimer={
            edition === 'nouvelle'
              ? undefined
              : () => {
                  setASupprimer(edition);
                  setEdition(null);
                }
          }
        />
      ) : null}

      {paiement ? (
        <PaiementChargeSheet
          charge={paiement}
          onClose={() => setPaiement(null)}
          onPayee={() => {
            setPaiement(null);
            reload();
          }}
        />
      ) : null}

      {aSupprimer ? (
        <ChargeSheet
          charge={aSupprimer}
          suppression
          onClose={() => setASupprimer(null)}
          onEnregistree={() => supprimer(aSupprimer)}
        />
      ) : null}

      <button
        type="button"
        className="fab"
        aria-label="Nouvelle charge"
        onClick={() => setEdition('nouvelle')}
      >
        <Plus size={26} />
      </button>
    </>
  );
}
