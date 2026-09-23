'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CATEGORIES, EXPENSES, METHODS, today } from './ledger';
import { readReceipt } from './storage';
import { Field, Select, Form, Button, Amount, Empty, formatMoney } from './ui';

export function ProductForm({ product, onSave }) {
  return (
    <Form onSubmit={(values) => onSave('product.save', { ...values, id: product?.id })}>
      <Field
        label="Nom du produit"
        name="name"
        defaultValue={product?.name}
        required
        maxLength={300}
      />
      <Select label="Catégorie" name="category" defaultValue={product?.category || CATEGORIES[0]}>
        {CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Select>
      <Field
        label="Unité (pièce, sac, kg…)"
        name="unit"
        defaultValue={product?.unit || 'pièce'}
        required
        maxLength={30}
      />
      <div className="local-grid-two">
        <Field
          label="Prix public"
          name="retail"
          type="number"
          min="0"
          step="0.01"
          defaultValue={product ? product.retail / 100 : ''}
          required
        />
        <Field
          label="Prix de gros"
          name="wholesale"
          type="number"
          min="0"
          step="0.01"
          defaultValue={product ? product.wholesale / 100 : ''}
          required
        />
      </div>
      <Field
        label="Coût d’achat unitaire"
        name="cost"
        type="number"
        min="0"
        step="0.01"
        defaultValue={product ? product.cost / 100 : ''}
        required
      />
      <div className="local-grid-two">
        <Field
          label="Stock actuel"
          name="stock"
          type="number"
          min="0"
          step="0.001"
          defaultValue={product?.stock ?? 0}
          required
        />
        <Field
          label="Seuil minimum"
          name="minStock"
          type="number"
          min="0"
          step="0.001"
          defaultValue={product?.minStock ?? 5}
          required
        />
      </div>
      {product ? (
        <p className="local-hint">
          Modifier le stock corrige l’inventaire. Pour un réapprovisionnement payé ou à crédit,
          utilisez Achats fournisseurs.
        </p>
      ) : null}
    </Form>
  );
}
export function ContactForm({ contact, kind, onSave }) {
  const supplier = kind === 'supplier';
  return (
    <Form onSubmit={(values) => onSave('contact.save', { ...values, kind, id: contact?.id })}>
      <Field
        label={supplier ? 'Entreprise / grossiste' : 'Nom du client'}
        name="name"
        defaultValue={contact?.name}
        maxLength={300}
        required
      />
      <Field
        label="Téléphone avec indicatif pays"
        type="tel"
        name="phone"
        placeholder="+228 90 12 34 56"
        defaultValue={contact?.phone}
        maxLength={40}
      />
      {supplier ? (
        <>
          <Field
            label="Contact / commercial"
            name="contact"
            defaultValue={contact?.contact}
            maxLength={300}
          />
          <Field
            label="Secteur d’approvisionnement"
            name="sector"
            defaultValue={contact?.sector}
            maxLength={300}
          />
        </>
      ) : null}
      {!contact ? (
        <Field
          label={supplier ? 'Dette fournisseur initiale' : 'Solde débiteur initial'}
          name="openingDebt"
          type="number"
          min="0"
          step="0.01"
          defaultValue="0"
          required
        />
      ) : null}
      {!contact ? (
        <p className="local-hint">
          Solde antérieur à l’utilisation de cette boutique. Il n’est pas compté comme une nouvelle
          vente ou dépense.
        </p>
      ) : null}
    </Form>
  );
}
function MethodAndDate() {
  return (
    <div className="local-grid-two">
      <Select name="method" label="Mode de paiement">
        {METHODS.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </Select>
      <Field label="Date" name="date" type="date" defaultValue={today()} max={today()} required />
    </div>
  );
}
export function TradeForm({ data, purchase = false, contactId = '', credit = false, onSave }) {
  const products = data.products.filter((p) => !p.archived),
    contacts = data[purchase ? 'suppliers' : 'customers'].filter((c) => !c.archived);
  const [lines, setLines] = useState([{ productId: '', quantity: 1, price: '' }]);
  const [priceMode, setPriceMode] = useState('retail'),
    [paid, setPaid] = useState(credit ? '0' : '');
  const change = (index, patch) =>
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const total = lines.reduce((n, line) => {
    const p = products.find((p) => p.id === line.productId);
    return (
      n +
      Math.round(
        (purchase ? (Number(line.price) || 0) * 100 : p?.[priceMode] || 0) *
          (Number(line.quantity) || 0)
      )
    );
  }, 0);
  if (!products.length)
    return (
      <div className="local-form">
        <Empty>Ajoutez un produit dans Stock avant d’enregistrer cette opération.</Empty>
      </div>
    );
  return (
    <Form
      label={purchase ? 'Enregistrer l’achat et le stock' : 'Valider la vente'}
      onSubmit={(values) =>
        onSave(purchase ? 'purchase' : 'sale', { ...values, lines, priceMode, paid })
      }
    >
      <Select
        label={purchase ? 'Fournisseur' : 'Client (obligatoire pour un crédit)'}
        name="contactId"
        defaultValue={contactId}
      >
        <option value="">{purchase ? 'Sans fournisseur' : 'Client comptoir'}</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {!purchase ? (
        <Select
          label="Tarif de vente"
          value={priceMode}
          onChange={(e) => setPriceMode(e.target.value)}
        >
          <option value="retail">Prix public</option>
          <option value="wholesale">Prix de gros</option>
        </Select>
      ) : null}
      <div className="local-trade-lines">
        {lines.map((line, index) => {
          const product = products.find((p) => p.id === line.productId);
          return (
            <div className="local-trade-line" key={index}>
              <Select
                label={'Produit ' + (index + 1)}
                value={line.productId}
                required
                onChange={(e) =>
                  change(index, {
                    productId: e.target.value,
                    price: (products.find((p) => p.id === e.target.value)?.cost || 0) / 100,
                  })
                }
              >
                <option value="">Choisir un produit</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.stock} {p.unit}
                  </option>
                ))}
              </Select>
              <div className="local-line-values">
                <Field
                  label={'Quantité ' + (index + 1)}
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={line.quantity}
                  required
                  onChange={(e) => change(index, { quantity: e.target.value })}
                />
                {purchase ? (
                  <Field
                    label={'Coût unitaire ' + (index + 1)}
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.price}
                    required
                    onChange={(e) => change(index, { price: e.target.value })}
                  />
                ) : (
                  <div>
                    <span className="local-hint">Prix unitaire</span>
                    <p>{formatMoney(product?.[priceMode] || 0, data.shop.currency)}</p>
                  </div>
                )}
                <button
                  type="button"
                  className="local-icon danger"
                  aria-label={'Retirer la ligne ' + (index + 1)}
                  disabled={lines.length === 1}
                  onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <Button
        tone="soft"
        onClick={() => setLines((rows) => [...rows, { productId: '', quantity: 1, price: '' }])}
      >
        <Plus size={19} />
        Ajouter un produit
      </Button>
      <div className="local-total">
        <span>TOTAL</span>
        <Amount value={total} currency={data.shop.currency} />
      </div>
      <Field
        label={purchase ? 'Montant payé maintenant' : 'Montant encaissé maintenant'}
        type="number"
        min="0"
        max={total / 100}
        step="0.01"
        placeholder={'Vide = totalité (' + total / 100 + ')'}
        value={paid}
        onChange={(e) => setPaid(e.target.value)}
      />
      {paid !== '' && Number(paid) * 100 < total ? (
        <p className="local-notice">
          À crédit : {formatMoney(total - Math.round(Number(paid) * 100), data.shop.currency)}
        </p>
      ) : null}
      <MethodAndDate />
      {purchase ? (
        <p className="local-hint">
          Les quantités reçues entrent immédiatement en stock. Le montant non payé devient une dette
          fournisseur.
        </p>
      ) : null}
    </Form>
  );
}
export function PaymentForm({ contact, kind, balance, currency, onSave }) {
  return (
    <Form
      onSubmit={(values) => onSave('payment', { ...values, kind, contactId: contact.id })}
      label={kind === 'customer' ? 'Enregistrer le remboursement' : 'Enregistrer le paiement'}
    >
      <p className="local-total">
        <span>Solde de {contact.name}</span>
        <Amount value={balance} currency={currency} />
      </p>
      <Field
        label="Montant"
        name="amount"
        type="number"
        min="0.01"
        max={balance / 100}
        step="0.01"
        defaultValue={balance / 100}
        required
      />
      <Field
        label="Motif du remboursement"
        name="reason"
        placeholder="Versement partiel, règlement du solde…"
        maxLength={300}
        required
      />
      <MethodAndDate />
    </Form>
  );
}
export function ExpenseForm({ onSave }) {
  const [receipt, setReceipt] = useState(''),
    [processing, setProcessing] = useState(false),
    [error, setError] = useState('');
  async function choose(file) {
    setProcessing(true);
    setError('');
    try {
      setReceipt(await readReceipt(file));
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  }
  return (
    <Form
      disabled={processing || Boolean(error)}
      onSubmit={(values) => onSave('expense', { ...values, receipt })}
    >
      <Select label="Catégorie de dépense" name="category">
        {EXPENSES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Select>
      <Field label="Montant" name="amount" type="number" min="0.01" step="0.01" required />
      <Field label="Motif / description" name="reason" maxLength={300} required />
      <MethodAndDate />
      <div className="local-attachment">
        <Field label="Justificatif depuis la galerie">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </Field>
        <Field label="Prendre une photo">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </Field>
        {processing ? <p role="status">Préparation de la photo…</p> : null}
        {error ? (
          <p role="alert" className="local-error">
            {error}
          </p>
        ) : null}
        {receipt ? (
          <>
            <ReceiptImage src={receipt} />
            <Button
              tone="ghost"
              onClick={() => {
                setReceipt('');
                setError('');
              }}
            >
              Retirer la photo
            </Button>
          </>
        ) : null}
      </div>
      <p className="local-hint">
        Achat de stock : sortie de caisse, exclue des charges pour éviter de compter deux fois le
        coût des produits vendus. Pour augmenter aussi les quantités, utilisez Achats fournisseurs.
      </p>
    </Form>
  );
}
export function ReceiptImage({ src }) {
  // A local data URL must remain available without an image server.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="local-receipt" src={src} alt="Justificatif de paiement" />;
}
export function ShopForm({ data, onSave }) {
  return (
    <Form onSubmit={(values) => onSave('shop', values)}>
      <Field
        label="Nom de la boutique"
        name="name"
        defaultValue={data.shop.name}
        required
        maxLength={100}
      />
      <Select label="Devise" name="currency" defaultValue={data.shop.currency}>
        {['FCFA', 'XOF', 'XAF'].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Select>
      <Field
        label="Caisse initiale en espèces"
        name="openingCash"
        type="number"
        step="0.01"
        min="0"
        defaultValue={data.shop.openingCash / 100}
        required
      />
      <Field
        label="Solde initial Mobile Money"
        name="openingMobile"
        type="number"
        step="0.01"
        min="0"
        defaultValue={data.shop.openingMobile / 100}
        required
      />
      <p className="local-hint">
        Les soldes initiaux sont ceux du démarrage de votre carnet, pas les soldes actuels.
      </p>
    </Form>
  );
}
