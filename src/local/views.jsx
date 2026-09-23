'use client';
import { useState } from 'react';
import {
  Plus,
  Search,
  ChevronRight,
  Package,
  Pencil,
  Trash2,
  MessageCircle,
  Receipt,
  Download,
  Upload,
  Settings,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import {
  CATEGORIES,
  METHODS,
  customerBalance,
  supplierBalance,
  cashLedger,
  report,
  today,
  whatsappLink,
} from './ledger';
import { Amount, Bars, Button, Empty, Field, Metrics, Select, Status, formatMoney } from './ui';
import { ReceiptImage } from './forms';
const active = (rows) => rows.filter((row) => !row.archived);
const match = (value, query) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .includes(
      query
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
    );
export function Section({ title, action, children }) {
  return (
    <section className="local-card">
      <div className="local-section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function SearchBox({ value, onChange, placeholder = 'Rechercher…' }) {
  return (
    <label className="local-search">
      <Search size={19} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Dashboard({ data, open, navigate }) {
  const r = report(data, today(), today()),
    low = active(data.products).filter((p) => p.stock <= p.minStock),
    currency = data.shop.currency;
  return (
    <>
      <div className="local-welcome">
        <div>
          <span className="local-eyebrow">VOTRE BOUTIQUE, À PORTÉE DE MAIN</span>
          <h1>Bonjour !</h1>
          <p>Voici votre activité d’aujourd’hui.</p>
        </div>
        <Button onClick={() => open('sale')}>
          <Plus size={19} />
          Nouvelle vente
        </Button>
      </div>
      <Metrics
        currency={currency}
        items={[
          ['Ventes du jour', r.revenue, 'green'],
          ['Encaissements du jour', r.incoming, 'blue'],
          ['Marge brute du jour', r.gross, 'yellow'],
          ['Nombre de ventes', r.salesCount, 'purple', true],
        ]}
      />
      <div className="local-columns">
        <Section
          title="Stock à surveiller"
          action={
            <Button tone="ghost" onClick={() => navigate('stock')}>
              Voir tout <ChevronRight size={16} />
            </Button>
          }
        >
          {low.length ? (
            low.slice(0, 6).map((p) => (
              <button
                key={p.id}
                className="local-row local-click"
                onClick={() => open('product-detail', p)}
              >
                <span className={'local-product-icon ' + (p.stock === 0 ? 'red' : 'amber')}>
                  <Package size={23} />
                </span>
                <span className="local-row-main">
                  <strong>{p.name}</strong>
                  <small>
                    Il reste {p.stock} {p.unit}
                  </small>
                </span>
                <Status product={p} />
              </button>
            ))
          ) : (
            <Empty>Aucune alerte de stock.</Empty>
          )}
        </Section>
        <Section title="Votre trésorerie">
          <Metrics currency={currency} items={r.balances.map((b) => [b.name, b.value, 'blue'])} />
          <p className="local-hint">Soldes actuels, toutes périodes confondues.</p>
          <Button tone="soft" onClick={() => navigate('cash')}>
            Ouvrir le journal de caisse <ChevronRight size={17} />
          </Button>
        </Section>
        <Section title="Principaux débiteurs">
          <Bars
            rows={r.debtors.slice(0, 5)}
            currency={currency}
            empty="Aucun crédit client en cours."
          />
        </Section>
        <Section title="Accès rapides">
          <div className="local-quick">
            <Button tone="soft" onClick={() => open('product')}>
              Ajouter un produit
            </Button>
            <Button tone="soft" onClick={() => open('customer')}>
              Ajouter un client
            </Button>
            <Button tone="soft" onClick={() => open('purchase')}>
              Achats fournisseurs
            </Button>
            <Button tone="soft" onClick={() => open('expense')}>
              Enregistrer une dépense
            </Button>
          </div>
          <div className="local-total">
            <span>Dettes fournisseurs</span>
            <Amount value={r.supplierDebt} currency={currency} />
          </div>
        </Section>
      </div>
    </>
  );
}
export function Products({ data, open }) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [status, setStatus] = useState('all');
  const rows = active(data.products).filter(
    (p) =>
      match(p.name, query) &&
      (!category || p.category === category) &&
      (status === 'all' ||
        (status === 'low' ? p.stock > 0 && p.stock <= p.minStock : p.stock === 0))
  );
  return (
    <>
      <div className="local-page-head">
        <div>
          <h1>Produits & stock</h1>
          <p>{active(data.products).length} articles dans votre inventaire</p>
        </div>
        <Button onClick={() => open('product')}>
          <Plus size={19} />
          Ajouter
        </Button>
      </div>
      <div className="local-filters">
        <SearchBox value={query} onChange={setQuery} placeholder="Rechercher un produit…" />
        <Select label="Catégorie" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </div>
      <div className="local-tabs">
        {[
          ['all', 'Tous'],
          ['low', 'Stock faible'],
          ['out', 'Rupture'],
        ].map(([id, label]) => (
          <button key={id} aria-pressed={status === id} onClick={() => setStatus(id)}>
            {label}
          </button>
        ))}
      </div>
      <Section title="Inventaire">
        {rows.length ? (
          rows.map((p) => (
            <button
              className="local-row local-click"
              key={p.id}
              onClick={() => open('product-detail', p)}
            >
              <span className="local-product-icon">
                <Package size={26} />
              </span>
              <span className="local-row-main">
                <strong>{p.name}</strong>
                <small>
                  {p.category} · {p.stock} {p.unit}
                </small>
                <small>
                  Public : {formatMoney(p.retail, data.shop.currency)} · Gros :{' '}
                  {formatMoney(p.wholesale, data.shop.currency)}
                </small>
              </span>
              <span className="local-row-end">
                <Status product={p} />
                <ChevronRight size={17} />
              </span>
            </button>
          ))
        ) : (
          <Empty>Aucun produit. Ajoutez un article ou modifiez les filtres.</Empty>
        )}
      </Section>
    </>
  );
}
export function ProductDetail({ product, data, open }) {
  return (
    <div className="local-form">
      <div className="local-detail-hero">
        <span className="local-product-icon">
          <Package size={35} />
        </span>
        <div>
          <h3>{product.name}</h3>
          <p>{product.category}</p>
          <Status product={product} />
        </div>
      </div>
      <Metrics
        currency={data.shop.currency}
        items={[
          ['Prix public', product.retail],
          ['Prix de gros', product.wholesale],
          ['Coût d’achat', product.cost, 'yellow'],
          ['Stock', product.stock + ' ' + product.unit, 'green', true],
        ]}
      />
      <p>
        Seuil d’alerte : {product.minStock} {product.unit}
      </p>
      <Button onClick={() => open('product', product)}>
        <Pencil size={17} />
        Modifier le produit
      </Button>
      <Button tone="danger" onClick={() => open('archive', { collection: 'products', ...product })}>
        <Trash2 size={17} />
        Supprimer le produit
      </Button>
    </div>
  );
}
export function Contacts({ data, kind, open }) {
  const [query, setQuery] = useState('');
  const supplier = kind === 'supplier',
    collection = supplier ? 'suppliers' : 'customers',
    balance = supplier ? supplierBalance : customerBalance;
  const rows = active(data[collection]).filter((c) =>
      match(c.name + ' ' + c.phone + ' ' + c.sector, query)
    ),
    r = report(data);
  return (
    <>
      <div className="local-page-head">
        <div>
          <h1>{supplier ? 'Fournisseurs & grossistes' : 'Clients & carnet de crédit'}</h1>
          <p>
            {supplier
              ? 'Gardez le contrôle sur vos engagements.'
              : 'Retrouvez chaque achat et chaque remboursement.'}
          </p>
        </div>
        <Button onClick={() => open(kind)}>
          <Plus size={19} />
          Ajouter
        </Button>
      </div>
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder={supplier ? 'Rechercher un fournisseur…' : 'Rechercher un client…'}
      />
      <div className="local-columns">
        <Section title={supplier ? 'Répertoire fournisseurs' : 'Répertoire clients'}>
          {rows.length ? (
            rows.map((c) => (
              <button
                className="local-row local-click"
                key={c.id}
                onClick={() => open(kind + '-detail', c)}
              >
                <span className="local-avatar">{c.name.slice(0, 1).toUpperCase()}</span>
                <span className="local-row-main">
                  <strong>{c.name}</strong>
                  <small>{c.phone || 'Téléphone non renseigné'}</small>
                  {supplier ? (
                    <small>
                      {c.contact} {c.sector ? '· ' + c.sector : ''}
                    </small>
                  ) : (
                    <small>
                      Achats cumulés :{' '}
                      {formatMoney(
                        data.sales
                          .filter((s) => s.customerId === c.id)
                          .reduce((n, s) => n + s.total, 0),
                        data.shop.currency
                      )}
                    </small>
                  )}
                </span>
                <span className="local-row-end">
                  <Amount value={balance(data, c.id)} currency={data.shop.currency} />
                  <small>Solde dû</small>
                </span>
              </button>
            ))
          ) : (
            <Empty>Aucune fiche trouvée.</Empty>
          )}
        </Section>
        <Section title={supplier ? 'Dettes fournisseurs' : 'Principaux débiteurs'}>
          <Bars
            rows={
              supplier
                ? active(data.suppliers)
                    .map((c) => ({ id: c.id, name: c.name, value: supplierBalance(data, c.id) }))
                    .filter((c) => c.value > 0)
                    .sort((a, b) => b.value - a.value)
                : r.debtors.slice(0, 10)
            }
            currency={data.shop.currency}
            empty="Aucune dette en cours."
          />
        </Section>
      </div>
    </>
  );
}
export function ContactDetail({ contact, kind, data, open, notify }) {
  const supplier = kind === 'supplier',
    balance = (supplier ? supplierBalance : customerBalance)(data, contact.id),
    currency = data.shop.currency;
  const trades = data[supplier ? 'purchases' : 'sales'].filter(
    (s) => (supplier ? s.supplierId : s.customerId) === contact.id
  );
  const payments = data[supplier ? 'supplierPayments' : 'customerPayments'].filter(
    (p) => p.contactId === contact.id
  );
  function remind() {
    try {
      const url = whatsappLink(
        contact.phone,
        `Bonjour ${contact.name}, petit rappel de ${data.shop.name} : votre solde restant est de ${formatMoney(balance, currency)}. Merci pour votre confiance. N’hésitez pas à nous contacter pour organiser votre règlement.`
      );
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      notify(e.message, 'error');
    }
  }
  return (
    <div className="local-form">
      <div className="local-detail-hero">
        <span className="local-avatar">{contact.name[0]}</span>
        <div>
          <h3>{contact.name}</h3>
          <p>{contact.phone || 'Téléphone non renseigné'}</p>
          {supplier ? (
            <p>
              {contact.contact} · {contact.sector}
            </p>
          ) : null}
        </div>
      </div>
      <Metrics
        currency={currency}
        items={[
          [
            supplier ? 'Achats cumulés' : 'Dépenses cumulées',
            trades.reduce((n, s) => n + s.total, 0),
            'blue',
          ],
          ['Solde dû', balance, 'yellow'],
        ]}
      />
      <div className="local-quick">
        <Button
          onClick={() =>
            open(supplier ? 'purchase' : 'sale', { contactId: contact.id, credit: true })
          }
        >
          {supplier ? 'Nouvel achat à crédit' : 'Nouvel achat à crédit'}
        </Button>
        <Button
          tone="success"
          disabled={balance <= 0}
          onClick={() => open('payment', { contact, kind, balance })}
        >
          {supplier ? 'Payer le fournisseur' : 'Enregistrer un remboursement'}
        </Button>
        {!supplier ? (
          <Button tone="soft" disabled={balance <= 0} onClick={remind}>
            <MessageCircle size={18} />
            Relancer sur WhatsApp
          </Button>
        ) : null}
      </div>
      <h3>Historique des achats</h3>
      {trades.length ? (
        trades
          .slice()
          .reverse()
          .map((s) => (
            <button
              className="local-row local-click"
              key={s.id}
              onClick={() => open('trade-detail', { trade: s, purchase: supplier })}
            >
              <span className="local-row-main">
                <strong>#{String(s.number).padStart(4, '0')}</strong>
                <small>
                  {s.date} · payé à l’achat : {formatMoney(s.paid, currency)}
                </small>
              </span>
              <Amount value={s.total} currency={currency} />
            </button>
          ))
      ) : (
        <Empty>Aucun achat enregistré.</Empty>
      )}
      <h3>Remboursements</h3>
      {payments.length ? (
        payments
          .slice()
          .reverse()
          .map((p) => (
            <div className="local-row" key={p.id}>
              <span className="local-row-main">
                <strong>{p.reason}</strong>
                <small>
                  {p.date} · {p.method}
                </small>
              </span>
              <Amount value={p.amount} currency={currency} />
            </div>
          ))
      ) : (
        <Empty>Aucun remboursement enregistré.</Empty>
      )}
      {contact.openingDebt > 0 ? (
        <p className="local-hint">Dette initiale : {formatMoney(contact.openingDebt, currency)}</p>
      ) : null}
      <div className="local-quick">
        <Button tone="soft" onClick={() => open(kind, contact)}>
          <Pencil size={16} />
          Modifier
        </Button>
        <Button
          tone="danger"
          onClick={() =>
            open('archive', { collection: supplier ? 'suppliers' : 'customers', ...contact })
          }
        >
          <Trash2 size={16} />
          Supprimer
        </Button>
      </div>
    </div>
  );
}
export function Trades({ data, purchase = false, open }) {
  const [query, setQuery] = useState('');
  const rows = data[purchase ? 'purchases' : 'sales']
    .slice()
    .reverse()
    .filter((s) =>
      match(
        String(s.number) +
          ' ' +
          s.date +
          ' ' +
          (data[purchase ? 'suppliers' : 'customers'].find(
            (c) => c.id === (purchase ? s.supplierId : s.customerId)
          )?.name || 'Comptoir'),
        query
      )
    );
  return (
    <>
      <div className="local-page-head">
        <div>
          <h1>{purchase ? 'Achats fournisseurs' : 'Historique des ventes'}</h1>
          <p>
            {purchase
              ? 'Réceptions de stock et règlements.'
              : 'Ventes au comptant et achats à crédit.'}
          </p>
        </div>
        <Button onClick={() => open(purchase ? 'purchase' : 'sale')}>
          <Plus size={18} />
          {purchase ? 'Nouvel achat' : 'Nouvelle vente'}
        </Button>
      </div>
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Rechercher par numéro, nom ou date…"
      />
      <Section title={purchase ? 'Achats enregistrés' : 'Ventes enregistrées'}>
        {rows.length ? (
          rows.map((s) => (
            <button
              key={s.id}
              className="local-row local-click"
              onClick={() => open('trade-detail', { trade: s, purchase })}
            >
              <span className="local-row-main">
                <strong>
                  #{purchase ? 'AC' : 'VE'}-{String(s.number).padStart(4, '0')}
                </strong>
                <small>
                  {s.date} ·{' '}
                  {data[purchase ? 'suppliers' : 'customers'].find(
                    (c) => c.id === (purchase ? s.supplierId : s.customerId)
                  )?.name || 'Comptoir'}
                </small>
              </span>
              <span className="local-row-end">
                <Amount value={s.total} currency={data.shop.currency} />
                <span className={'local-badge ' + (s.paid === s.total ? 'green' : 'amber')}>
                  {s.paid === s.total ? 'Payée à l’achat' : 'Crédit à l’achat'}
                </span>
              </span>
            </button>
          ))
        ) : (
          <Empty>Aucune opération enregistrée.</Empty>
        )}
      </Section>
    </>
  );
}
export function TradeDetail({ trade, purchase, data }) {
  const contact = data[purchase ? 'suppliers' : 'customers'].find(
    (c) => c.id === (purchase ? trade.supplierId : trade.customerId)
  );
  return (
    <div className="local-form local-invoice">
      <div className="local-invoice-brand">
        <Package size={36} />
        <h3>{data.shop.name}</h3>
        <p>{purchase ? 'ACHAT FOURNISSEUR' : 'REÇU DE VENTE'}</p>
      </div>
      <p>
        N° {String(trade.number).padStart(4, '0')} · {trade.date}
        <br />
        {contact?.name || 'Client comptoir'}
      </p>
      <div className="local-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Produit</th>
              <th>Qté</th>
              <th>Prix</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {trade.items.map((i) => (
              <tr key={i.productId}>
                <td>{i.name}</td>
                <td>{i.quantity}</td>
                <td>{formatMoney(i.price, data.shop.currency)}</td>
                <td>{formatMoney(i.total, data.shop.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="local-total">
        <span>TOTAL</span>
        <Amount value={trade.total} currency={data.shop.currency} />
      </div>
      <p>
        Payé à l’achat ({trade.method}) : {formatMoney(trade.paid, data.shop.currency)}
      </p>
      <p>Crédit initial : {formatMoney(trade.total - trade.paid, data.shop.currency)}</p>
      <p className="local-hint">
        Les remboursements ultérieurs sont consultables dans la fiche{' '}
        {purchase ? 'fournisseur' : 'client'}.
      </p>
      <Button tone="soft" onClick={() => window.print()}>
        Imprimer / enregistrer en PDF
      </Button>
    </div>
  );
}
export function Cash({ data, open }) {
  const [method, setMethod] = useState(''),
    [direction, setDirection] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const rows = cashLedger(data).filter(
      (e) =>
        (!method || e.method === method) &&
        (!direction || e.direction === Number(direction)) &&
        (!from || e.date >= from) &&
        (!to || e.date <= to)
    ),
    r = report(data, from, to);
  return (
    <>
      <div className="local-page-head">
        <div>
          <h1>Trésorerie</h1>
          <p>Chaque mouvement de votre caisse.</p>
        </div>
        <Button onClick={() => open('expense')}>
          <Plus size={18} />
          Dépense
        </Button>
      </div>
      <Metrics
        currency={data.shop.currency}
        items={r.balances.map((b) => [b.name + ' · solde actuel', b.value, 'blue'])}
      />
      <div className="local-filters">
        <Select label="Paiement" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Tous les moyens</option>
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
        <Select label="Mouvement" value={direction} onChange={(e) => setDirection(e.target.value)}>
          <option value="">Entrées et sorties</option>
          <option value="1">Entrées</option>
          <option value="-1">Sorties</option>
        </Select>
        <Field
          label="Du"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Field
          label="Au"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>
      <div className="local-columns">
        <Section title="Journal de caisse">
          <div className="local-total">
            <span>Solde des mouvements filtrés</span>
            <Amount
              value={rows.reduce((n, e) => n + e.direction * e.amount, 0)}
              currency={data.shop.currency}
            />
          </div>
          {rows.length ? (
            rows.map((e) => (
              <div className="local-row" key={e.id}>
                <span className={'local-movement ' + (e.direction === 1 ? 'green' : 'red')}>
                  {e.direction === 1 ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                </span>
                <span className="local-row-main">
                  <strong>{e.label}</strong>
                  <small>
                    {e.date} · {e.method}
                  </small>
                  <small>{e.kind}</small>
                  {e.receipt ? (
                    <Button tone="ghost" onClick={() => open('receipt', e)}>
                      <Receipt size={14} />
                      Voir le justificatif
                    </Button>
                  ) : null}
                </span>
                <Amount value={e.amount * e.direction} currency={data.shop.currency} />
              </div>
            ))
          ) : (
            <Empty>Aucun mouvement pour ces filtres.</Empty>
          )}
        </Section>
        <Section title="Répartition des dépenses">
          <Bars rows={r.expenses} currency={data.shop.currency} />
          <p className="local-hint">
            Dépenses saisies sur la période sélectionnée, tous moyens de paiement.
          </p>
        </Section>
      </div>
    </>
  );
}
export function Reports({ data }) {
  const [from, setFrom] = useState(today().slice(0, 7) + '-01'),
    [to, setTo] = useState(today());
  const r = report(data, from, to),
    currency = data.shop.currency;
  return (
    <>
      <div className="local-page-head">
        <div>
          <h1>Rapports & marges</h1>
          <p>Comprenez la rentabilité de votre boutique.</p>
        </div>
      </div>
      <div className="local-filters">
        <Field
          label="Début de période"
          type="date"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Field
          label="Fin de période"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button
          tone="soft"
          onClick={() => {
            setFrom('');
            setTo('');
          }}
        >
          Toute la période
        </Button>
      </div>
      <Metrics
        currency={currency}
        items={[
          ['Chiffre d’affaires', r.revenue, 'blue'],
          ['Coût des produits vendus', r.cost, 'yellow'],
          ['Marge brute', r.gross, 'green'],
          ['Bénéfice net calculé', r.net, 'purple'],
        ]}
      />
      <p className="local-notice">
        Bénéfice net = marge brute − charges enregistrées ({formatMoney(r.operating, currency)}).
        Les achats de stock sont exclus des charges : leur coût est déjà compté dans les produits
        vendus. Le résultat inclut les ventes à crédit et dépend de l’exhaustivité des charges
        saisies.
      </p>
      <div className="local-columns">
        <Section title={'Ventes par jour · ' + r.salesCount + ' ventes'}>
          <Bars rows={r.days} currency={currency} />
        </Section>
        <Section title="Répartition des dépenses">
          <Bars rows={r.expenses} currency={currency} />
        </Section>
      </div>
      <Section title="Rentabilité produit par produit">
        {r.products.length ? (
          <div className="local-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Qté vendue</th>
                  <th>Ventes</th>
                  <th>Coût</th>
                  <th>Marge brute</th>
                  <th>Taux</th>
                </tr>
              </thead>
              <tbody>
                {r.products.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.quantity}</td>
                    <td>{formatMoney(p.revenue, currency)}</td>
                    <td>{formatMoney(p.cost, currency)}</td>
                    <td>
                      <Amount value={p.revenue - p.cost} currency={currency} />
                    </td>
                    <td>
                      {p.revenue
                        ? (((p.revenue - p.cost) / p.revenue) * 100).toFixed(1) + ' %'
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Aucune vente sur cette période.</Empty>
        )}
      </Section>
    </>
  );
}
export function SettingsView({ data, open, backup, onImport }) {
  return (
    <>
      <div className="local-page-head">
        <div>
          <h1>Ma boutique</h1>
          <p>Vos données restent sur cet appareil.</p>
        </div>
      </div>
      <div className="local-columns">
        <Section title={data.shop.name}>
          <p>Devise : {data.shop.currency}</p>
          <Button tone="soft" onClick={() => open('shop')}>
            <Settings size={18} />
            Paramètres et soldes initiaux
          </Button>
        </Section>
        <Section title="Sauvegarde locale">
          <p>
            Exportez régulièrement votre carnet, notamment avant de changer d’appareil ou de vider
            les données du navigateur. Les photos sont incluses.
          </p>
          <div className="local-quick">
            <Button onClick={backup}>
              <Download size={18} />
              Exporter la sauvegarde
            </Button>
            <label className="local-button soft">
              <Upload size={18} />
              Importer une sauvegarde
              <input
                aria-label="Importer une sauvegarde"
                className="local-file-hidden"
                type="file"
                accept=".json,application/json"
                onChange={onImport}
              />
            </label>
          </div>
        </Section>
        <Section title="Mode autonome">
          <p>
            Stock, ventes, crédits et dépenses fonctionnent sans compte ni serveur. Après
            préparation du mode hors ligne, cette page peut être rouverte sans réseau.
          </p>
          <p className="local-hint">
            Le stockage appartient à ce navigateur. La navigation privée, le nettoyage des données
            ou un changement de domaine peuvent le rendre indisponible. WhatsApp nécessite sa propre
            connexion.
          </p>
        </Section>
        <Section title="Accès connecté">
          <p>
            Votre ancien espace connecté reste disponible. Ses données sont séparées de ce carnet
            local ; aucune synchronisation automatique n’est effectuée.
          </p>
          <a className="local-button soft" href="/login">
            Ouvrir l’espace connecté
          </a>
        </Section>
      </div>
    </>
  );
}
export function ReceiptView({ receipt }) {
  return (
    <div className="local-form">
      <ReceiptImage src={receipt} />
    </div>
  );
}
