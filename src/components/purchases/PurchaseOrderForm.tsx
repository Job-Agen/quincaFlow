'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Trash2, MessageCircle } from 'lucide-react';
import AppBar from '@/components/layout/AppBar';
import {
  Button,
  Card,
  Empty,
  Notice,
  SearchField,
  SelectField,
  Sheet,
  Skeleton,
  TextAreaField,
  TextField,
} from '@/components/ui';
import { api } from '@/client/api';
import { envoyerBonDeCommande } from '@/client/partage';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { orderTotal, purchaseOrderMessage, unitCostFor } from '@/domain/purchase';
import { money, withUnit } from '@/utils/format';
import { errorMessage } from '@/utils/errors';
import type { ContactRow, Product, PurchaseOrder } from '@/types';

/**
 * Nouvelle commande fournisseur (maquette 7, §20).
 *
 * Enregistrer cette commande n'écrit aucun mouvement de stock : commander n'est
 * pas posséder (§21). Le stock ne bougera qu'à la réception, à hauteur de ce qui
 * aura réellement été livré.
 */
/**
 * Ligne de commande en cours de saisie.
 *
 * Quantité et coût transitent en chaînes pendant la frappe : c'est le serveur
 * qui les convertit et les valide avant écriture (§35).
 */
interface OrderLine {
  key: string;
  productId: string;
  unitId: string;
  /** Conditionnement d'une ligne rechargée, le temps de retrouver son identifiant. */
  unitLabel?: string;
  quantity: number | string;
  unitCost: number | string;
}

/**
 * Saisie d'une commande fournisseur — création et modification (§58).
 *
 * Une seule saisie pour les deux, comme la fiche produit : un champ ajouté
 * d'un côté manquerait de l'autre, et c'est au moment de corriger une commande
 * qu'on s'en apercevrait, devant le fournisseur.
 */
export default function PurchaseOrderForm({ initial }: { initial?: PurchaseOrder | null }) {
  const router = useRouter();
  const { business, currency, user } = useSession();
  const products = useResource<Product[]>('/api/products');
  const suppliers = useResource<ContactRow[]>('/api/suppliers');

  const [supplierId, setSupplierId] = useState(initial?.supplier_id || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  // À la création, le nom du compte qui saisit : le cas courant est que le
  // gérant commande lui-même, et lui faire retaper son nom à chaque bon serait
  // un impôt. Il reste modifiable — un vendeur saisit parfois pour le compte
  // du patron, et c'est le patron que le fournisseur attend (§62).
  const [gerant, setGerant] = useState(initial?.manager_name || user?.name || '');
  const [items, setItems] = useState<OrderLine[]>(() =>
    (initial?.items || []).map((item) => ({
      key: item.id,
      productId: item.product_id || '',
      // La ligne enregistrée ne garde que le libellé du conditionnement, pas
      // son identifiant : il se retrouve dans le catalogue au chargement.
      unitId: '',
      unitLabel: item.unit_label,
      quantity: item.quantity_ordered,
      unitCost: item.unit_cost,
    }))
  );
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [partage, setPartage] = useState(false);

  const catalog = useMemo(
    () => new Map((products.data || []).map((product) => [product.id, product])),
    [products.data]
  );

  /**
   * Les lignes, conditionnement retrouvé.
   *
   * Une commande enregistrée ne garde que le libellé du conditionnement — « sac »,
   * « carton » — parce qu'une facture déjà imprimée ne doit pas changer si le
   * produit est renommé plus tard. À la réouverture, l'identifiant se retrouve
   * dans le catalogue. Résolu au rendu plutôt que dans un effet : l'état reste
   * le même à chaque passage, et rien ne clignote en attendant le catalogue.
   */
  const lignes = useMemo(
    () =>
      items.map((item) => {
        if (item.unitId || !item.unitLabel) return item;
        const unites = catalog.get(item.productId)?.units ?? [];
        const retrouve = unites.find((unit) => unit.label === item.unitLabel);
        return retrouve ? { ...item, unitId: retrouve.id } : item;
      }),
    [items, catalog]
  );

  const total = useMemo(
    () => orderTotal(lignes.map((item) => ({ quantity: item.quantity, unitCost: item.unitCost }))),
    [lignes]
  );

  function addProduct(product: Product) {
    const unit = product.units[0];
    // Le serveur garantit au moins l'unité de base ; sans elle, aucun coût à appliquer.
    if (!unit) {
      setError(`« ${product.name} » n'a aucun conditionnement utilisable.`);
      return;
    }
    setItems((current) => [
      ...current,
      {
        key: `${product.id}-${Date.now()}`,
        productId: product.id,
        unitId: unit.id,
        quantity: 1,
        unitCost: product.purchase_price || '',
      },
    ]);
    setPicking(false);
  }

  const patch = (key: string, values: Partial<OrderLine>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...values } : item))
    );

  /**
   * La commande encore à l'écran, en pièce jointe (§60bis).
   *
   * Elle n'a pas de numéro : elle n'est pas enregistrée. Le PDF le dit en
   * toutes lettres sous son titre — « PROJET — NON ENREGISTRÉ » — et ne porte
   * aucune ligne à signer, plutôt que d'inventer une référence que le
   * fournisseur citerait ensuite et qu'aucun écran ne retrouverait.
   *
   * C'est le geste du gérant qui demande « as-tu ça, et à quel prix ? » avant
   * de s'engager : il mérite une pièce que le fournisseur puisse ouvrir sur un
   * ordinateur, pas seulement une liste dans une bulle.
   */
  async function shareDraft() {
    const supplier = (suppliers.data || []).find((row) => row.id === supplierId);
    const articles = lignes.map((item) => {
      const product = catalog.get(item.productId);
      const unit = (product?.units ?? []).find((row) => row.id === item.unitId);
      return {
        nom: product?.name || 'Article',
        unite: unit?.label || product?.base_unit || null,
        quantite: item.quantity,
        cout: item.unitCost,
      };
    });

    const text = purchaseOrderMessage(
      { supplierName: supplier?.name, notes },
      articles.map((a) => ({
        productName: a.nom,
        unitLabel: a.unite ?? undefined,
        quantity: a.quantite,
        unitCost: a.cout,
      })),
      business,
      currency
    );

    const ouvrirWhatsApp = () =>
      window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');

    setPartage(true);
    try {
      const issue = await envoyerBonDeCommande(
        {
          reference: null,
          supplier_name: supplier?.name ?? null,
          status: null,
          created_at: new Date().toISOString(),
          notes,
          items: articles.map((a) => ({
            product_name: a.nom,
            unit_label: a.unite,
            quantity_ordered: a.quantite,
            unit_cost: a.cout,
          })),
        },
        business,
        currency,
        text
      );
      if (issue === 'téléchargé') ouvrirWhatsApp();
    } catch {
      // Le PDF n'a pas pu être fabriqué : le message part quand même, c'est ce
      // que ce bouton faisait avant le §60bis.
      ouvrirWhatsApp();
    }
    setPartage(false);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const corps = {
      supplierId: supplierId || null,
      notes,
      managerName: gerant,
      items: lignes.map(({ productId, unitId, quantity, unitCost }) => ({
        productId,
        unitId: unitId || null,
        quantity,
        unitCost,
      })),
    };
    try {
      // PUT sur une commande existante : les lignes envoyées la remplacent.
      const order = initial
        ? await api.put<PurchaseOrder>(`/api/purchase-orders/${initial.id}`, corps)
        : await api.post<PurchaseOrder>('/api/purchase-orders', corps);
      router.replace(`/purchases/${order.id}`);
    } catch (issue) {
      setError(errorMessage(issue));
      setBusy(false);
    }
  }

  return (
    <>
      <AppBar
        back={initial ? `/purchases/${initial.id}` : '/purchases'}
        title={initial ? `Modifier ${initial.reference}` : 'Nouvelle commande'}
      />

      <main className="page page--purchase">
        {error ? <Notice tone="error">{error}</Notice> : null}

        <SelectField
          label="Fournisseur"
          value={supplierId}
          onChange={(event) => setSupplierId(event.target.value)}
        >
          <option value="">— Choisir un fournisseur —</option>
          {(suppliers.data || []).map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </SelectField>

        <h2 className="section-title">Produits</h2>
        <Card>
          {items.length === 0 ? (
            <Empty
              icon={<Search size={26} className="muted" />}
              title="Aucun produit"
              hint="Ajoutez les articles à commander chez ce fournisseur."
            />
          ) : (
            <ul className="purchase-items">
              {lignes.map((item) => {
                const product = catalog.get(item.productId);
                const units = product?.units ?? [];
                return (
                  <li key={item.key} className="purchase-item">
                    <div className="purchase-item__row">
                      <span>{product?.name}</span>
                      <input
                        className="input num"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={item.quantity}
                        aria-label={'Quantité — ' + product?.name}
                        onChange={(event) => patch(item.key, { quantity: event.target.value })}
                      />
                      <button
                        type="button"
                        aria-label={'Retirer ' + product?.name}
                        onClick={() =>
                          setItems((current) => current.filter((row) => row.key !== item.key))
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                    <details>
                      <summary>
                        {money(item.unitCost || 0, currency)} /{' '}
                        {units.find((unit) => unit.id === item.unitId)?.label || product?.base_unit}{' '}
                        · Modifier le coût
                      </summary>
                      <div className="grid-2">
                        <SelectField
                          label="Conditionnement"
                          value={item.unitId}
                          onChange={(event) => {
                            const unit = units.find((unit) => unit.id === event.target.value);
                            patch(item.key, {
                              unitId: event.target.value,
                              unitCost: unitCostFor(
                                product?.purchase_price || 0,
                                unit?.factor || 1
                              ),
                            });
                          }}
                        >
                          {units.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                              {unit.label} ({withUnit(unit.factor, product?.base_unit)})
                            </option>
                          ))}
                        </SelectField>
                        <label className="field">
                          <span className="field__label">Coût unitaire</span>
                          <input
                            className="input"
                            type="number"
                            min="0"
                            step="any"
                            value={item.unitCost}
                            onChange={(event) => patch(item.key, { unitCost: event.target.value })}
                          />
                        </label>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <button
          type="button"
          className="btn btn--dashed btn--block"
          onClick={() => setPicking(true)}
        >
          <Plus size={18} />
          Ajouter un produit
        </button>

        <TextField
          label="Gérant"
          placeholder="Nom de qui passe la commande"
          hint="S’imprime au-dessus de la ligne à signer sur le bon."
          value={gerant}
          onChange={(event) => setGerant(event.target.value)}
        />

        <TextAreaField
          label="Notes (optionnel)"
          rows={2}
          placeholder="Livraison prévue la semaine prochaine."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        <Card pad>
          <div className="total-line total-line--grand" style={{ marginTop: 0, borderTop: 'none' }}>
            <span>Total estimé</span>
            <span className="num amount">{money(total, currency)}</span>
          </div>
        </Card>

        <Button block disabled={items.length === 0 || !supplierId || busy} onClick={submit}>
          {busy ? 'Enregistrement…' : initial ? 'Enregistrer les modifications' : 'Générer la commande'}
        </Button>
        <Button
          block
          variant="soft"
          disabled={!items.length || !supplierId || partage}
          onClick={shareDraft}
        >
          <MessageCircle size={21} style={{ color: 'var(--green)' }} />
          {partage ? 'Préparation…' : 'Envoyer le projet par WhatsApp'}
        </Button>
      </main>

      <Sheet open={picking} title="Ajouter un produit" onClose={() => setPicking(false)}>
        <PickerBody
          products={products.data}
          loading={products.loading}
          currency={currency}
          onPick={addProduct}
        />
      </Sheet>
    </>
  );
}

function PickerBody({
  products,
  loading,
  currency,
  onPick,
}: {
  products: Product[] | null;
  loading: boolean;
  currency: string;
  onPick: (product: Product) => void;
}) {
  const [search, setSearch] = useState('');
  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = products || [];
    if (!term) return all.slice(0, 40);
    return all.filter((product) => product.name.toLowerCase().includes(term)).slice(0, 40);
  }, [products, search]);

  return (
    <>
      <SearchField value={search} onChange={setSearch} placeholder="Nom du produit…" />
      {loading ? <Skeleton count={4} height={56} /> : null}
      {!loading && results.length === 0 ? (
        <Empty
          title="Aucun produit"
          hint="Créez d'abord la fiche produit : c'est elle qui recevra le stock à la livraison."
        />
      ) : null}
      <div className="list">
        {results.map((product) => (
          <button
            key={product.id}
            type="button"
            className="list__row"
            onClick={() => onPick(product)}
          >
            <div className="list__body">
              <div className="list__title">{product.name}</div>
              <div className="list__sub">
                Stock : {withUnit(product.stock_quantity, product.base_unit)}
              </div>
            </div>
            <span className="small muted num">{money(product.purchase_price, currency)}</span>
          </button>
        ))}
      </div>
    </>
  );
}
