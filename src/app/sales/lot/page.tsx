'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Plus, Trash2 } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import { Button, Card, Empty, Notice, SelectField, Skeleton } from '@/components/ui';
import ProductPicker from '@/components/sales/ProductPicker';
import { api } from '@/client/api';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import {
  MOBILE_MONEY_PROVIDERS,
  MOBILE_MONEY_PROVIDER_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from '@/domain/sale';
import { money, withUnit } from '@/utils/format';
import { errorMessage } from '@/utils/errors';
import type { MobileMoneyProvider, PaymentMethod, Product } from '@/types';

/**
 * Plusieurs ventes d'un coup (§75).
 *
 * Le cahier du comptoir se rattrape le soir : « 3 sacs de ciment, 2 tôles,
 * 1 bidon de peinture ». Ce sont trois **ventes** distinctes, pas une vente à
 * trois lignes — chacune a son client, son heure, sa facture. Les saisir une
 * par une par l'écran ordinaire fait dix allers-retours ; ici c'est une liste
 * et un bouton.
 *
 * L'écran assume une limite et la dit : tout y est encaissé comptant. Une
 * ardoise demande un client et un montant reçu, et cela se saisit à l'écran
 * de vente, qui prend le temps de les demander.
 */

/** Une vente du lot, telle que l'écran la tient pendant la frappe. */
interface Ligne {
  key: string;
  productId: string;
  nom: string;
  unite: string;
  unitId: string;
  quantity: number | string;
  unitPrice: number | string;
}

interface Resultat {
  creees: { id: string; reference: string; total: number }[];
  echec: { rang: number; message: string } | null;
}

export default function LotDeVentesPage() {
  const { currency } = useSession();
  const products = useResource<Product[]>('/api/products');
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [choisir, setChoisir] = useState(false);
  const [methode, setMethode] = useState<PaymentMethod>('CASH');
  // `noUncheckedIndexedAccess` : la liste est constante et non vide, mais le
  // typage ne le sait pas. Le repli nomme l'opérateur le plus courant ici.
  const [operateur, setOperateur] = useState<MobileMoneyProvider>(
    MOBILE_MONEY_PROVIDERS[0] ?? 'TMONEY'
  );
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  const total = useMemo(
    () =>
      lignes.reduce(
        (somme, ligne) => somme + (Number(ligne.quantity) || 0) * (Number(ligne.unitPrice) || 0),
        0
      ),
    [lignes]
  );

  function ajouter(product: Product) {
    const unite = product.units[0];
    if (!unite) {
      setErreur(`« ${product.name} » n'a aucun conditionnement utilisable.`);
      return;
    }
    setLignes((avant) => [
      ...avant,
      {
        key: `${product.id}-${Date.now()}`,
        productId: product.id,
        nom: product.name,
        unite: unite.label,
        unitId: unite.id,
        quantity: 1,
        unitPrice: unite.price,
      },
    ]);
    setChoisir(false);
    setResultat(null);
  }

  const modifier = (key: string, valeurs: Partial<Ligne>) =>
    setLignes((avant) =>
      avant.map((ligne) => (ligne.key === key ? { ...ligne, ...valeurs } : ligne))
    );

  async function enregistrer() {
    setBusy(true);
    setErreur(null);
    try {
      const vu = await api.post<Resultat>('/api/sales/lot', {
        paymentMethod: methode,
        paymentProvider: methode === 'MOBILE_MONEY' ? operateur : null,
        ventes: lignes.map(({ productId, unitId, quantity, unitPrice }) => ({
          productId,
          unitId,
          quantity,
          unitPrice: unitPrice === '' ? null : unitPrice,
        })),
      });
      setResultat(vu);
      // Ce qui est passé quitte la liste ; ce qui a buté y reste, avec la
      // suite. Sans cela le gérant ressaisirait des ventes déjà écrites.
      setLignes((avant) => (vu.echec ? avant.slice(vu.echec.rang - 1) : []));
    } catch (souci) {
      setErreur(errorMessage(souci));
    }
    setBusy(false);
  }

  return (
    <>
      <AppBar back="/dashboard" title="Plusieurs ventes" />

      <main className="page">
        <p className="small muted">
          Une ligne par vente. Tout est encaissé comptant — pour une ardoise ou un client nommé,
          passez par{' '}
          <Link href="/sales/new" className="link">
            Nouvelle vente
          </Link>
          .
        </p>

        {erreur ? <Notice tone="error">{erreur}</Notice> : null}

        {resultat ? (
          <Notice tone={resultat.echec ? 'warn' : 'success'}>
            <strong>
              {resultat.creees.length} vente{resultat.creees.length > 1 ? 's' : ''} enregistrée
              {resultat.creees.length > 1 ? 's' : ''}
            </strong>
            {resultat.creees.length > 0 ? (
              <>
                {' '}
                (
                {money(
                  resultat.creees.reduce((somme, vente) => somme + vente.total, 0),
                  currency
                )}
                ){' — '}
                {resultat.creees.map((vente, index) => (
                  <span key={vente.id}>
                    {index > 0 ? ', ' : ''}
                    <Link href={`/sales/${vente.id}`} className="link">
                      {vente.reference}
                    </Link>
                  </span>
                ))}
              </>
            ) : null}
            {resultat.echec ? (
              <div className="small">
                La vente n° {resultat.echec.rang} n’est pas passée : {resultat.echec.message} Elle
                est restée dans la liste, avec les suivantes.
              </div>
            ) : null}
          </Notice>
        ) : null}

        <Card>
          {products.loading && !products.data ? <Skeleton count={2} height={60} /> : null}
          {lignes.length === 0 ? (
            <Empty
              icon={<Plus size={26} className="muted" />}
              title="Aucune vente dans la liste"
              hint="Ajoutez les ventes du cahier l’une après l’autre, puis enregistrez-les toutes."
            />
          ) : (
            <ul className="lot">
              {lignes.map((ligne, rang) => (
                <li key={ligne.key} className="lot__ligne">
                  <div className="lot__tete">
                    <span className="lot__rang">{rang + 1}</span>
                    <strong className="lot__nom">{ligne.nom}</strong>
                    <button
                      type="button"
                      aria-label={`Retirer ${ligne.nom}`}
                      onClick={() =>
                        setLignes((avant) => avant.filter((autre) => autre.key !== ligne.key))
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  <div className="grid-2">
                    <label className="field">
                      <span className="field__label">Quantité ({ligne.unite})</span>
                      <input
                        className="input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={ligne.quantity}
                        aria-label={`Quantité — ${ligne.nom}`}
                        onChange={(event) => modifier(ligne.key, { quantity: event.target.value })}
                      />
                    </label>
                    <label className="field">
                      <span className="field__label">Prix unitaire</span>
                      <input
                        className="input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={ligne.unitPrice}
                        aria-label={`Prix unitaire — ${ligne.nom}`}
                        onChange={(event) => modifier(ligne.key, { unitPrice: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="lot__total">
                    {withUnit(Number(ligne.quantity) || 0, ligne.unite)} ·{' '}
                    <strong>
                      {money(
                        (Number(ligne.quantity) || 0) * (Number(ligne.unitPrice) || 0),
                        currency
                      )}
                    </strong>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Button variant="soft" block onClick={() => setChoisir(true)}>
          <Plus size={18} />
          Ajouter une vente
        </Button>

        {lignes.length > 0 ? (
          <>
            <SelectField
              label="Encaissement"
              value={methode}
              onChange={(event) => setMethode(event.target.value as PaymentMethod)}
            >
              {PAYMENT_METHODS.map((valeur) => (
                <option key={valeur} value={valeur}>
                  {PAYMENT_METHOD_LABELS[valeur]}
                </option>
              ))}
            </SelectField>

            {methode === 'MOBILE_MONEY' ? (
              <SelectField
                label="Opérateur"
                value={operateur}
                onChange={(event) => setOperateur(event.target.value as MobileMoneyProvider)}
              >
                {MOBILE_MONEY_PROVIDERS.map((valeur) => (
                  <option key={valeur} value={valeur}>
                    {MOBILE_MONEY_PROVIDER_LABELS[valeur]}
                  </option>
                ))}
              </SelectField>
            ) : null}

            <div className="total-line">
              <span>
                {lignes.length} vente{lignes.length > 1 ? 's' : ''}
              </span>
              <strong className="num amount">{money(total, currency)}</strong>
            </div>

            <Button variant="success" block disabled={busy} onClick={enregistrer}>
              <Check size={18} />
              {busy
                ? 'Enregistrement…'
                : `Enregistrer ${lignes.length} vente${lignes.length > 1 ? 's' : ''}`}
            </Button>
          </>
        ) : null}
      </main>

      <ProductPicker
        open={choisir}
        onClose={() => setChoisir(false)}
        products={products.data}
        loading={products.loading}
        currency={currency}
        onPick={ajouter}
      />
    </>
  );
}
