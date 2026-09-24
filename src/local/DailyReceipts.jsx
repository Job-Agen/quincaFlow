'use client';
import { useState } from 'react';
import { daySummary, closureFingerprint, METHODS, today } from './ledger';
import { canonical } from './syncProtocol';
import { Amount, Button, Empty, Field, Form, Metrics, Select } from './ui';
import { Section } from './views';

function Summary({ snapshot, currency }) {
  return (
    <>
      <Metrics
        currency={currency}
        items={[
          ['Total des ventes', snapshot.totalSales, 'green'],
          ['Encaissé sur ces ventes', snapshot.collectedSales, 'blue'],
          ['Ventes à crédit restant dues', snapshot.totalSales - snapshot.collectedSales, 'yellow'],
          ['Recettes nettes du jour', snapshot.incoming - snapshot.outgoing, 'purple'],
        ]}
      />
      <p className="local-hint">
        Recettes nettes = tous les encaissements du jour (y compris remboursements clients) moins
        les dépenses et paiements fournisseurs. Tous moyens de paiement confondus, sans le solde des
        jours précédents.
      </p>
      <Section title={`${snapshot.sales.length} vente(s)`}>
        {!snapshot.sales.length ? (
          <Empty>Aucune vente pour cette journée.</Empty>
        ) : (
          snapshot.sales.map((s) => (
            <details key={s.id} className="local-day-sale">
              <summary>
                Vente {s.reference || `n° ${s.number}`} ·{' '}
                <Amount value={s.total} currency={currency} />
              </summary>
              <div className="local-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Article</th>
                      <th>Quantité</th>
                      <th>Prix unitaire</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.items.map((i, n) => (
                      <tr key={n}>
                        <td>{i.name}</td>
                        <td>
                          {i.quantity} {i.unit || ''}
                        </td>
                        <td>
                          <Amount value={i.price} currency={currency} />
                        </td>
                        <td>
                          <Amount value={i.total} currency={currency} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {s.discount ? (
                <p>
                  Remise : <Amount value={s.discount} currency={currency} />
                </p>
              ) : null}
              <p>
                Encaissé ({s.method}) : <Amount value={s.paid} currency={currency} /> · Crédit :{' '}
                <Amount value={s.total - s.paid} currency={currency} />
              </p>
            </details>
          ))
        )}
      </Section>
      <Section title="Entrées et sorties de la journée">
        {!snapshot.entries.length ? (
          <Empty>Aucun encaissement ni dépense.</Empty>
        ) : (
          snapshot.entries.map((e) => (
            <div className="local-row" key={e.id}>
              <span className="local-row-main">
                <strong>{e.label}</strong>
                <small>
                  {e.kind} · {e.method}
                </small>
              </span>
              <Amount value={e.amount * e.direction} currency={currency} />
            </div>
          ))
        )}
        <div className="local-total">
          <span>Total encaissé</span>
          <Amount value={snapshot.incoming} currency={currency} />
        </div>
        <div className="local-total">
          <span>Total des sorties</span>
          <Amount value={snapshot.outgoing} currency={currency} />
        </div>
      </Section>
    </>
  );
}
export function DailyReceipts({ data, open }) {
  const [date, setDate] = useState(today()),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const closure = (data.dailyClosures || []).find((c) => c.date === date);
  const history = (data.dailyClosures || [])
    .filter((c) => (!from || c.date >= from) && (!to || c.date <= to))
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="local-page-head">
        <div>
          <h1>Recettes du jour</h1>
          <p>Vérifiez les ventes, les sorties et validez votre fin de journée.</p>
        </div>
      </div>
      <Field
        label="Journée à consulter"
        type="date"
        value={date}
        max={today()}
        required
        onChange={(e) => e.target.value && setDate(e.target.value)}
      />
      <div className="local-quick">
        {closure ? (
          <Button onClick={() => open('closure-detail', closure)}>Voir la clôture validée</Button>
        ) : (
          <>
            <Button tone="soft" onClick={() => open('expense', { date })}>
              Enregistrer une dépense
            </Button>
            <Button onClick={() => open('day-close', { date })}>Clôturer cette journée</Button>
          </>
        )}
      </div>
      {closure ? (
        <p className="local-hint">
          Journée validée à {closure.time}. Le récapitulatif ci-dessous affiche les mouvements
          actuels ; la fiche validée conserve les chiffres de la clôture.
        </p>
      ) : (
        <p className="local-hint">
          La clôture se fait à votre validation, par exemple à 17 h. Les dépenses s’enregistrent
          immédiatement ; le retrait et le montant restant se règlent à l’étape suivante.
        </p>
      )}
      <Summary snapshot={daySummary(data, date)} currency={data.shop.currency} />
      <Section title="Historique des journées validées">
        <div className="local-grid-two">
          <Field label="Du" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Field label="Au" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {!history.length ? (
          <Empty>Aucune clôture pour cette période.</Empty>
        ) : (
          history.map((c) => (
            <button
              key={c.id}
              className="local-row local-click"
              onClick={() => open('closure-detail', c)}
            >
              <span className="local-row-main">
                <strong>
                  {c.date} · {c.time}
                </strong>
                <small>
                  {c.snapshot.sales.length} vente(s) · Total vendu :{' '}
                  <Amount value={c.snapshot.totalSales} currency={data.shop.currency} />
                </small>
              </span>
              <span>
                Validé
                <br />
                <Amount value={c.remaining} currency={data.shop.currency} />
              </span>
            </button>
          ))
        )}
      </Section>
    </>
  );
}
export function ClosureForm({ data, date, onSave }) {
  const snapshot = daySummary(data, date),
    net = snapshot.incoming - snapshot.outgoing;
  const [withdrawal, setWithdrawal] = useState('0'),
    [remaining, setRemaining] = useState(null);
  const withdrawalCents = Math.round(Number(withdrawal) * 100);
  const suggested = (net - withdrawalCents) / 100;
  const value = remaining ?? (Number.isFinite(suggested) ? String(suggested) : '');
  const adjustment = Math.round(Number(value) * 100) - (net - withdrawalCents);
  return (
    <Form
      label="Valider et archiver la journée"
      onSubmit={(v) => onSave('day.close', { ...v, date })}
    >
      <p>
        Journée du <strong>{date}</strong> · {snapshot.sales.length} vente(s). Total vendu :{' '}
        <Amount value={snapshot.totalSales} currency={data.shop.currency} />
      </p>
      <div className="local-total">
        <span>Recettes nettes avant retrait</span>
        <Amount value={net} currency={data.shop.currency} />
      </div>
      <Field label="Heure de clôture" name="time" type="time" defaultValue="17:00" required />
      <Field
        label="Montant à retirer"
        name="withdrawal"
        type="number"
        min="0"
        step="0.01"
        value={withdrawal}
        onChange={(e) => setWithdrawal(e.target.value)}
        required
      />
      <Field
        label="Motif du retrait"
        name="withdrawalReason"
        maxLength={300}
        required={withdrawalCents > 0}
      />
      <Select label="Moyen du retrait et de l’écart" name="method">
        {METHODS.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </Select>
      <Field
        label="Montant restant à valider"
        name="remaining"
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => setRemaining(e.target.value)}
        required
      />
      <Button tone="ghost" onClick={() => setRemaining(null)}>
        Reprendre le montant calculé
      </Button>
      <p>
        Écart par rapport au calcul :{' '}
        <Amount
          value={Number.isFinite(adjustment) ? adjustment : 0}
          currency={data.shop.currency}
        />
      </p>
      <Field
        label="Motif de l’écart"
        name="adjustmentReason"
        maxLength={300}
        required={adjustment !== 0}
      />
      <Field label="Note de clôture (facultatif)" name="note" maxLength={300} />
      <p className="local-hint">
        Le montant restant concerne uniquement les mouvements de cette journée, tous moyens
        confondus. Un retrait n’est pas une dépense : il diminue la trésorerie sans diminuer le
        bénéfice. Un écart modifie le journal de caisse, jamais le total des ventes. Une seule
        clôture est autorisée par date.
      </p>
    </Form>
  );
}
export function ClosureDetail({ data, closure: c }) {
  const changed =
    canonical(closureFingerprint(daySummary(data, c.date))) !==
    canonical(closureFingerprint(c.snapshot));
  return (
    <div className="local-form">
      <h3>
        {c.date} · clôture à {c.time}
      </h3>
      {changed ? (
        <p role="status" className="local-cache-warning">
          Des mouvements ont été ajoutés ou modifiés depuis la validation. Cette archive conserve
          les chiffres validés à la clôture.
        </p>
      ) : null}
      <Summary snapshot={c.snapshot} currency={data.shop.currency} />
      <div className="local-total">
        <span>Retrait ({c.method})</span>
        <Amount value={c.withdrawal} currency={data.shop.currency} />
      </div>
      {c.withdrawalReason ? <p>{c.withdrawalReason}</p> : null}
      <div className="local-total">
        <span>Écart constaté</span>
        <Amount value={c.adjustment} currency={data.shop.currency} />
      </div>
      {c.adjustmentReason ? <p>{c.adjustmentReason}</p> : null}
      <div className="local-total">
        <span>Montant restant validé</span>
        <Amount value={c.remaining} currency={data.shop.currency} />
      </div>
      {c.note ? <p>{c.note}</p> : null}
    </div>
  );
}
