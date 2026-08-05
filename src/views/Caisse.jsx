'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingCart,
  Search,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  AlertTriangle,
  ShoppingBag,
  History,
  RotateCcw,
  CreditCard,
  Package,
  Ban,
  UserPlus,
  Layers,
} from 'lucide-react';

import { useSales } from '../hooks/useSales';
import useInvoices from '../hooks/useInvoices';
import useProducts from '../hooks/useProducts';
import useContacts from '../hooks/useContacts';
import useStockMovements from '../hooks/useStockMovements';
import { fmt } from '../utils/formatCurrency';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { Z } from '../constants/theme';
import {
  RETAIL,
  WHOLESALE,
  hasWholesale,
  priceFor,
  unitsFor,
  packLabelOf,
  packUnitPrice,
  maxSellable,
  clampQty,
  lineTotal,
  lineUnits,
} from '../utils/pricing';

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: '#0D0905',
  card: '#1A1008',
  card2: '#221408',
  amber: '#F5A623',
  terra: '#D4622A',
  green: '#2EAA6B',
  red: '#D93B2A',
  blue: '#3A8FD4',
  text: '#F5EDD8',
  muted: '#8B7B64',
  border: '#362210',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function PaymentBadge({ mode }) {
  const variant =
    mode === 'cash'
      ? 'success'
      : mode === 'mobile money'
        ? 'info'
        : mode === 'crédit'
          ? 'warning'
          : 'neutral';
  return <Badge variant={variant}>{mode}</Badge>;
}

/**
 * Un tarif de vente, nommé et cliquable.
 *
 * Le prix seul ne dit pas ce qu'on achète : « 400 FCFA » peut aussi bien être
 * la pièce que le carton. Le libellé et l'unité lèvent l'ambiguïté, et chaque
 * tarif a sa propre cible pour qu'aucun geste ne soit à deviner.
 */
function PriceButton({ label, price, per, color, icon, onClick, disabled, disabledHint }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? disabledHint : `Ajouter 1 ${per} au panier`}
      style={{
        width: '100%',
        display: 'flex',
        // Empilé plutôt qu'en ligne : « 13 000 FCFA / carton de 40 » ne tient
        // pas sur la largeur d'une carte, et se faisait rogner à droite.
        flexDirection: 'column',
        alignItems: 'flex-start',
        rowGap: '2px',
        padding: '8px 10px',
        borderRadius: '8px',
        background: disabled ? 'transparent' : `${color}1F`,
        border: `1px solid ${disabled ? C.border : color}`,
        color: disabled ? C.muted : color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        font: 'inherit',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          fontSize: '10px',
          fontWeight: 800,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {icon}
        {label}
      </span>
      <span style={{ fontSize: '13px', fontWeight: 800, lineHeight: 1.3 }}>
        <span style={{ whiteSpace: 'nowrap' }}>{fmt(price)}</span>
        <span style={{ fontSize: '11px', fontWeight: 500, opacity: 0.75 }}> / {per}</span>
      </span>
    </button>
  );
}

function Toast({ message, visible }) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '32px',
        left: '50%',
        transform: visible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(80px)',
        opacity: visible ? 1 : 0,
        transition: 'transform 0.3s ease, opacity 0.3s ease',
        background: C.green,
        color: '#fff',
        padding: '12px 28px',
        borderRadius: '99px',
        fontWeight: 700,
        fontSize: '15px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        zIndex: Z.toast,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <CheckCircle size={20} />
      {message}
    </div>
  );
}

function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
}

// =============================================================================
// CAISSE — Point de Vente
// =============================================================================
export default function Caisse() {
  const { sales, addSale, deleteSale, cancelSale } = useSales();
  const { addInvoice } = useInvoices();
  const { products, adjustStock } = useProducts();
  const { contacts: allContacts, addContact, updateCredit } = useContacts();
  const { logMovement } = useStockMovements();
  const isMobile = useIsMobile();

  const [tab, setTab] = useState('vente');

  const contacts = useMemo(
    () => allContacts.filter((c) => c.type === 'client' || c.role === 'client'),
    [allContacts]
  );

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [clientName, setClientName] = useState('Client anonyme');
  const [payment, setPayment] = useState('cash');
  const [creditContactId, setCreditContactId] = useState('');
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [cancelConfirmId, setCancelConfirmId] = useState(null);
  const [toast, setToast] = useState({ visible: false, message: '' });
  const [dateFilter, setDateFilter] = useState('');

  // ── Derived ─────────────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => (p.name || '').toLowerCase().includes(q) || (p.cat || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  const cartTotal = useMemo(() => cart.reduce((s, i) => s + lineTotal(i), 0), [cart]);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  /**
   * Pièces déjà engagées par article, tous modes confondus. Un même article peut
   * figurer deux fois dans le panier (20 pièces au détail ET 1 carton en gros) :
   * c'est ce cumul, pas la ligne, qui doit rester dans les limites du stock.
   */
  const unitsInCart = useMemo(() => {
    const map = new Map();
    cart.forEach((i) => map.set(i.id, (map.get(i.id) || 0) + lineUnits(i)));
    return map;
  }, [cart]);

  // ── Cart operations ──────────────────────────────────────────────────────────
  /** `mode` vaut RETAIL (à la pièce) ou WHOLESALE (au carton entier). */
  const addToCart = useCallback((product, mode = RETAIL) => {
    if (!product.qty || product.qty <= 0) return;
    if (mode === WHOLESALE && !hasWholesale(product)) return;

    const key = `${product.id}::${mode}`;

    setCart((prev) => {
      const engaged = prev.reduce(
        (sum, i) => (i.id === product.id ? sum + lineUnits(i) : sum),
        0
      );
      const free = (product.qty || 0) - engaged;
      // Une unité de plus dans ce mode, est-ce que le stock suit ?
      if (free < unitsFor(product, mode, 1)) return prev;

      const ex = prev.find((i) => i.key === key);
      if (ex) {
        return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i));
      }
      return [
        ...prev,
        {
          key,
          id: product.id,
          name: product.name,
          cat: product.cat,
          mode,
          unitPrice: priceFor(product, mode),
          qty: 1,
          unit: product.unit,
          packLabel: packLabelOf(product),
          packSize: product.packSize || 0,
        },
      ];
    });
  }, []);

  const changeQty = useCallback(
    (key, delta) => {
      setCart((prev) => {
        const line = prev.find((i) => i.key === key);
        if (!line) return prev;
        const product = products.find((p) => p.id === line.id);
        const stock = product ? product.qty || 0 : 0;
        // Pièces prises par les AUTRES lignes du même article.
        const otherUnits = prev.reduce(
          (sum, i) => (i.id === line.id && i.key !== key ? sum + lineUnits(i) : sum),
          0
        );
        const max = maxSellable(line, line.mode, stock - otherUnits);
        const next = clampQty(line.qty + delta, max);
        return prev.map((i) => (i.key === key ? { ...i, qty: next } : i));
      });
    },
    [products]
  );

  const removeFromCart = useCallback(
    (key) => setCart((prev) => prev.filter((i) => i.key !== key)),
    []
  );

  /**
   * Plafond d'une ligne : le stock de l'article, moins ce que les autres lignes
   * du même article ont déjà pris, converti dans l'unité vendue par cette ligne.
   */
  const maxForLine = useCallback(
    (line) => {
      const product = products.find((p) => p.id === line.id);
      const stock = product ? product.qty || 0 : 0;
      const otherUnits = cart.reduce(
        (sum, i) => (i.id === line.id && i.key !== line.key ? sum + lineUnits(i) : sum),
        0
      );
      return maxSellable(line, line.mode, stock - otherUnits);
    },
    [cart, products]
  );

  // ── Quick client creation (credit sales) ─────────────────────────────────────
  const handleQuickCreateClient = useCallback(() => {
    const name = newClientName.trim();
    if (!name) return;
    const created = addContact({
      name,
      phone: newClientPhone.trim(),
      type: 'client',
      creditBalance: 0,
    });
    setCreditContactId(created.id);
    setClientName(created.name);
    setShowNewClient(false);
    setNewClientName('');
    setNewClientPhone('');
  }, [addContact, newClientName, newClientPhone]);

  // ── Validate sale ────────────────────────────────────────────────────────────
  const handleConfirmSale = useCallback(() => {
    if (payment === 'crédit' && !creditContactId) return;

    const saleDate = new Date().toISOString();
    const todayStr = saleDate.slice(0, 10);
    // `qty` est exprimée dans l'unité vendue (pièce ou carton) ; `units` porte
    // toujours l'équivalent en unités de base, seule mesure comparable entre
    // une vente au détail et une vente en gros.
    const saleItems = cart.map((i) => ({
      name: i.name,
      qty: i.qty,
      unitPrice: i.unitPrice,
      mode: i.mode,
      unitLabel: i.mode === WHOLESALE ? i.packLabel : i.unit || 'unité',
      units: lineUnits(i),
      packSize: i.packSize || 0,
      lineTotal: lineTotal(i),
    }));
    const creditContact =
      payment === 'crédit' ? contacts.find((c) => c.id === creditContactId) : null;
    const resolvedClient = creditContact?.name || clientName || 'Client anonyme';

    const newSale = addSale({
      date: saleDate,
      items: saleItems,
      total: cartTotal,
      clientName: resolvedClient,
      payment,
      ...(payment === 'crédit' ? { contactId: creditContactId } : {}),
    });

    // Deduct stock + journal des mouvements.
    // Le stock est tenu en unités de base : un carton de 40 en retire 40.
    cart.forEach((item) => {
      const units = lineUnits(item);
      adjustStock(item.id, -units);
      logMovement({
        productId: item.id,
        productName: item.name,
        type: 'sortie',
        qty: units,
        reason:
          item.mode === WHOLESALE
            ? `Vente en caisse (gros — ${item.qty} ${item.packLabel})`
            : 'Vente en caisse (détail)',
        refId: newSale.id,
      });
    });

    // Créance client (vente à crédit)
    if (payment === 'crédit' && creditContactId) {
      updateCredit(creditContactId, +cartTotal);
    }

    // Auto-generate invoice
    const isPaid = payment === 'cash' || payment === 'mobile money';
    const contact = creditContact || allContacts.find((c) => c.name === resolvedClient);
    const dueDate = isPaid
      ? todayStr
      : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    addInvoice({
      date: todayStr,
      dueDate,
      clientName: resolvedClient,
      clientPhone: contact?.phone || '',
      clientAddress: contact?.address || '',
      items: saleItems,
      subtotal: cartTotal,
      discount: 0,
      total: cartTotal,
      status: isPaid ? 'payée' : 'en attente',
      amountPaid: isPaid ? cartTotal : 0,
      notes: `Vente enregistrée en caisse — paiement : ${payment}`,
    });

    setCart([]);
    setClientName('Client anonyme');
    setPayment('cash');
    setCreditContactId('');
    setShowNewClient(false);
    setNewClientName('');
    setNewClientPhone('');
    setShowConfirm(false);
    setToast({ visible: true, message: 'Vente et facture enregistrées !' });
    setTimeout(() => setToast({ visible: false, message: '' }), 3000);
  }, [
    addSale,
    addInvoice,
    adjustStock,
    logMovement,
    updateCredit,
    allContacts,
    contacts,
    cart,
    cartTotal,
    clientName,
    payment,
    creditContactId,
  ]);

  // ── Cancel sale ──────────────────────────────────────────────────────────────
  const handleCancelSale = useCallback(() => {
    const sale = sales.find((s) => s.id === cancelConfirmId);
    setCancelConfirmId(null);
    if (!sale || sale.status === 'annulée') return;

    cancelSale(sale.id);

    // Restitution du stock + journal des mouvements
    (sale.items || []).forEach((item) => {
      const product = products.find((p) => p.name === item.name);
      if (product) adjustStock(product.id, +item.qty);
      logMovement({
        productId: product?.id || null,
        productName: item.name,
        type: 'entrée',
        qty: +item.qty,
        reason: 'Annulation vente',
        refId: sale.id,
      });
    });

    // Annulation de la créance si vente à crédit
    if (sale.payment === 'crédit' && sale.contactId) {
      updateCredit(sale.contactId, -sale.total);
    }

    setToast({ visible: true, message: 'Vente annulée — stock restitué' });
    setTimeout(() => setToast({ visible: false, message: '' }), 3000);
  }, [sales, cancelConfirmId, cancelSale, products, adjustStock, logMovement, updateCredit]);

  // ── History ──────────────────────────────────────────────────────────────────
  const filteredSales = useMemo(() => {
    const sorted = [...sales].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!dateFilter) return sorted;
    return sorted.filter((s) => s.date && s.date.slice(0, 10) === dateFilter);
  }, [sales, dateFilter]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySales = useMemo(
    () =>
      sales.filter(
        (s) => s.date && s.date.slice(0, 10) === todayStr && s.status !== 'annulée'
      ),
    [sales, todayStr]
  );
  const todaySalesTotal = todaySales.reduce((s, v) => s + (v.total || 0), 0);

  // ── Options ──────────────────────────────────────────────────────────────────
  const clientOptions = useMemo(() => {
    const base = [{ value: 'Client anonyme', label: 'Client anonyme' }];
    contacts.forEach((c) => {
      if (c.name) base.push({ value: c.name, label: c.name });
    });
    return base;
  }, [contacts]);

  const creditClientOptions = useMemo(
    () => [
      { value: '', label: '— Sélectionner un client —' },
      ...contacts
        .filter((c) => c.id && c.name)
        .map((c) => ({ value: c.id, label: c.name })),
    ],
    [contacts]
  );

  const paymentOptions = [
    { value: 'cash', label: 'Cash' },
    { value: 'mobile money', label: 'Mobile Money' },
    { value: 'crédit', label: 'Crédit' },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'inherit' }}>
      <Toast message={toast.message} visible={toast.visible} />

      {/* Header + tabs */}
      <div
        style={{
          background: C.card,
          borderBottom: `1px solid ${C.border}`,
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          height: '56px',
          flexWrap: 'wrap',
        }}
      >
        <ShoppingBag size={20} color={C.amber} />
        <span style={{ fontWeight: 800, fontSize: '18px', color: C.text }}>Caisse</span>
        <div style={{ display: 'flex', gap: '4px', marginLeft: '16px' }}>
          {[
            { key: 'vente', label: isMobile ? 'Vente' : 'Nouvelle vente', Icon: ShoppingCart },
            { key: 'historique', label: 'Historique', Icon: History },
          ].map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: tab === key ? C.amber : 'transparent',
                color: tab === key ? '#0D0905' : C.muted,
                border: 'none',
                borderRadius: '8px',
                padding: '6px 14px',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ======================================================================
          TAB — NOUVELLE VENTE
      ====================================================================== */}
      {tab === 'vente' && (
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column-reverse' : 'row',
            gap: '20px',
            padding: isMobile ? '12px' : '20px',
            alignItems: 'flex-start',
          }}
        >
          {/* LEFT — Product catalog */}
          <div style={{ flex: '0 0 65%', width: isMobile ? '100%' : undefined, minWidth: 0 }}>
            {/* Search input */}
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <Search
                size={16}
                color={C.muted}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Rechercher un article par nom ou catégorie…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: '10px',
                  padding: '10px 14px 10px 38px',
                  color: C.text,
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Product grid */}
            {filteredProducts.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '56px 24px',
                  color: C.muted,
                  border: `1px dashed ${C.border}`,
                  borderRadius: '12px',
                }}
              >
                <Package size={36} color={C.muted} style={{ marginBottom: '14px' }} />
                <p style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Aucun article trouvé</p>
                {products.length === 0 && (
                  <p style={{ margin: '8px 0 0', fontSize: '13px' }}>
                    Ajoutez des produits dans le module Stock
                  </p>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: '10px',
                }}
              >
                {filteredProducts.map((product) => {
                  const outOfStock = !product.qty || product.qty <= 0;
                  const lowStock = !outOfStock && product.qty <= (product.minQty || 0);
                  const inCart = cart.some((i) => i.id === product.id);
                  const wholesale = hasWholesale(product);
                  // Stock encore libre une fois le panier déduit : c'est lui qui
                  // décide si un carton de plus est encore possible.
                  const free = (product.qty || 0) - (unitsInCart.get(product.id) || 0);
                  const packFits = wholesale && free >= (product.packSize || 0);
                  return (
                    <div
                      key={product.id || product.name}
                      title={outOfStock ? 'Rupture de stock' : product.name}
                      style={{
                        background: outOfStock ? 'rgba(26,16,8,0.6)' : C.card,
                        border: `1px solid ${inCart ? C.amber : outOfStock ? C.red : C.border}`,
                        borderRadius: '10px',
                        padding: '14px',
                        opacity: outOfStock ? 0.5 : 1,
                        transition: 'border-color 0.15s',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          gap: '4px',
                          flexWrap: 'wrap',
                          marginBottom: '8px',
                        }}
                      >
                        {outOfStock && <Badge variant="danger">Rupture de stock</Badge>}
                        {lowStock && <Badge variant="warning">Stock faible</Badge>}
                        {inCart && !outOfStock && <Badge variant="success">Dans le panier</Badge>}
                      </div>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: C.text,
                          lineHeight: 1.3,
                        }}
                      >
                        {product.name}
                      </div>
                      <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>
                        {product.cat || 'Sans catégorie'}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: outOfStock ? C.red : lowStock ? C.amber : C.muted,
                          fontWeight: 600,
                          marginTop: '6px',
                        }}
                      >
                        {product.qty} {product.unit || 'u.'} en stock
                      </div>

                      {/* Un article conditionné a deux tarifs : on les nomme et
                          on leur donne chacun sa cible, plutôt que de laisser
                          deviner que toucher la carte vend à la pièce. */}
                      {!outOfStock && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            marginTop: '10px',
                          }}
                        >
                          <PriceButton
                            label="Détail"
                            price={product.sellPrice}
                            per={product.unit || 'unité'}
                            color={C.amber}
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(product, RETAIL);
                            }}
                          />
                          {wholesale && (
                            <PriceButton
                              label="Gros"
                              price={product.packPrice}
                              per={`${packLabelOf(product)} de ${product.packSize}`}
                              color={C.terra}
                              icon={<Layers size={12} />}
                              disabled={!packFits}
                              disabledHint={`Il reste ${free} ${product.unit || 'u.'} : pas de quoi faire un ${packLabelOf(product)} entier`}
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCart(product, WHOLESALE);
                              }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT — Cart */}
          <div style={{ flex: 1, minWidth: isMobile ? '100%' : '280px' }}>
            <Card
              style={{ position: isMobile ? 'static' : 'sticky', top: '20px', padding: '18px' }}
            >
              {/* Cart header */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}
              >
                <ShoppingCart size={18} color={C.amber} />
                <span style={{ fontWeight: 800, fontSize: '16px', color: C.text, flex: 1 }}>
                  Panier
                </span>
                <Badge variant={cartCount > 0 ? 'warning' : 'neutral'}>
                  {cartCount} article{cartCount !== 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Items list */}
              {cart.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px 16px',
                    color: C.muted,
                    border: `1px dashed ${C.border}`,
                    borderRadius: '10px',
                    marginBottom: '16px',
                  }}
                >
                  <ShoppingCart size={28} color={C.muted} style={{ marginBottom: '10px' }} />
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>Panier vide</p>
                  <p style={{ margin: '6px 0 0', fontSize: '12px' }}>
                    Choisissez un tarif — détail ou gros — sur un article
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    marginBottom: '14px',
                  }}
                >
                  {cart.map((item) => (
                    <div
                      key={item.key}
                      style={{
                        background: C.card2,
                        border: `1px solid ${item.mode === WHOLESALE ? C.terra : C.border}`,
                        borderRadius: '8px',
                        padding: '10px 12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: '8px',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: 700,
                              color: C.text,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.name}
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              flexWrap: 'wrap',
                              marginTop: '3px',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                color: item.mode === WHOLESALE ? C.terra : C.muted,
                                border: `1px solid ${item.mode === WHOLESALE ? C.terra : C.border}`,
                              }}
                            >
                              {item.mode === WHOLESALE ? 'Gros' : 'Détail'}
                            </span>
                            <span style={{ fontSize: '12px', color: C.muted }}>
                              {fmt(item.unitPrice)} / {item.mode === WHOLESALE ? item.packLabel : item.unit || 'unité'}
                            </span>
                          </div>
                          {item.mode === WHOLESALE && (
                            <div style={{ fontSize: '11px', color: C.muted, marginTop: '2px' }}>
                              {lineUnits(item)} {item.unit || 'u.'} retirées du stock
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromCart(item.key)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: C.red,
                            padding: '2px',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Retirer du panier"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginTop: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            onClick={() => changeQty(item.key, -1)}
                            disabled={item.qty <= 1}
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '6px',
                              background: C.card,
                              border: `1px solid ${C.border}`,
                              color: item.qty <= 1 ? C.muted : C.text,
                              cursor: item.qty <= 1 ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Minus size={11} />
                          </button>
                          <span
                            style={{
                              minWidth: '28px',
                              textAlign: 'center',
                              fontSize: '14px',
                              fontWeight: 700,
                              color: C.text,
                            }}
                          >
                            {item.qty}
                          </span>
                          <button
                            onClick={() => changeQty(item.key, 1)}
                            disabled={item.qty >= maxForLine(item)}
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '6px',
                              background: C.card,
                              border: `1px solid ${C.border}`,
                              color: item.qty >= maxForLine(item) ? C.muted : C.text,
                              cursor: item.qty >= maxForLine(item) ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: C.amber }}>
                          {fmt(lineTotal(item))}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ borderTop: `1px solid ${C.border}`, margin: '12px 0' }} />

              {/* Cart total */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 600, color: C.muted }}>Total</span>
                <span style={{ fontSize: '24px', fontWeight: 900, color: C.amber }}>
                  {fmt(cartTotal)}
                </span>
              </div>

              {/* Client (paiement comptant) */}
              {payment !== 'crédit' && (
                <Select
                  label="Client"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  options={clientOptions}
                  style={{ marginBottom: '12px' }}
                />
              )}

              {/* Payment */}
              <Select
                label="Mode de paiement"
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
                options={paymentOptions}
                style={{ marginBottom: payment === 'crédit' ? '12px' : '16px' }}
              />

              {/* Client à créditer (obligatoire en mode crédit) */}
              {payment === 'crédit' && (
                <div style={{ marginBottom: '16px' }}>
                  <Select
                    label="Client à créditer (obligatoire)"
                    value={creditContactId}
                    onChange={(e) => {
                      setCreditContactId(e.target.value);
                      const c = contacts.find((ct) => ct.id === e.target.value);
                      if (c) setClientName(c.name);
                    }}
                    options={creditClientOptions}
                  />
                  {!showNewClient ? (
                    <button
                      type="button"
                      onClick={() => setShowNewClient(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: C.amber,
                        fontSize: '12px',
                        fontWeight: 700,
                        padding: '6px 0 0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <UserPlus size={13} />
                      Nouveau client
                    </button>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        marginTop: '10px',
                        background: C.card2,
                        border: `1px solid ${C.border}`,
                        borderRadius: '8px',
                        padding: '10px',
                      }}
                    >
                      <Input
                        label="Nom"
                        type="text"
                        placeholder="Nom du client"
                        value={newClientName}
                        onChange={(e) => setNewClientName(e.target.value)}
                      />
                      <Input
                        label="Téléphone"
                        type="text"
                        placeholder="Ex : 90 00 00 00"
                        value={newClientPhone}
                        onChange={(e) => setNewClientPhone(e.target.value)}
                      />
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <Button variant="ghost" size="sm" onClick={() => setShowNewClient(false)}>
                          Annuler
                        </Button>
                        <Button
                          variant="green"
                          size="sm"
                          disabled={!newClientName.trim()}
                          onClick={handleQuickCreateClient}
                        >
                          <UserPlus size={13} />
                          Créer
                        </Button>
                      </div>
                    </div>
                  )}
                  {!creditContactId && (
                    <p style={{ margin: '8px 0 0', fontSize: '12px', color: C.red }}>
                      Sélectionnez un client pour une vente à crédit.
                    </p>
                  )}
                </div>
              )}

              {/* Validate button */}
              <Button
                variant="primary"
                size="lg"
                disabled={cart.length === 0 || (payment === 'crédit' && !creditContactId)}
                onClick={() => setShowConfirm(true)}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <CreditCard size={17} />
                Valider la vente
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* ======================================================================
          TAB — HISTORIQUE
      ====================================================================== */}
      {tab === 'historique' && (
        <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
          {/* KPI + filter */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              alignItems: 'flex-end',
              marginBottom: '24px',
            }}
          >
            <Card style={{ padding: '14px 20px', minWidth: '180px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: C.muted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '6px',
                }}
              >
                Ventes du jour
              </div>
              <div style={{ fontSize: '22px', fontWeight: 900, color: C.amber }}>
                {fmt(todaySalesTotal)}
              </div>
              <div style={{ fontSize: '12px', color: C.muted, marginTop: '4px' }}>
                {todaySales.length} vente{todaySales.length !== 1 ? 's' : ''}
              </div>
            </Card>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-end',
                flex: 1,
                minWidth: '220px',
              }}
            >
              <Input
                type="date"
                label="Filtrer par date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                style={{ flex: 1 }}
              />
              {dateFilter && (
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setDateFilter('')}
                  style={{ flexShrink: 0, border: `1px solid ${C.border}`, color: C.muted }}
                >
                  <RotateCcw size={14} />
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>

          {/* Sales list */}
          {filteredSales.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '64px 24px',
                color: C.muted,
                border: `1px dashed ${C.border}`,
                borderRadius: '12px',
              }}
            >
              <History size={40} color={C.muted} style={{ marginBottom: '16px' }} />
              <p style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                Aucune vente enregistrée
              </p>
              {dateFilter && (
                <p style={{ margin: '8px 0 0', fontSize: '13px' }}>Aucune vente pour cette date</p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredSales.map((sale) => {
                const isCancelled = sale.status === 'annulée';
                return (
                <Card
                  key={sale.id}
                  style={{ padding: '16px 20px', opacity: isCancelled ? 0.65 : 1 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '12px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '10px',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: '13px', color: C.muted }}>{fmtDate(sale.date)}</span>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 700,
                          color: C.text,
                          textDecoration: isCancelled ? 'line-through' : 'none',
                        }}
                      >
                        {sale.clientName || 'Client anonyme'}
                      </span>
                      <PaymentBadge mode={sale.payment || 'cash'} />
                      {isCancelled && <Badge variant="danger">Annulée</Badge>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        style={{
                          fontSize: '18px',
                          fontWeight: 900,
                          color: isCancelled ? C.muted : C.amber,
                          textDecoration: isCancelled ? 'line-through' : 'none',
                        }}
                      >
                        {fmt(sale.total)}
                      </span>
                      {!isCancelled && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCancelConfirmId(sale.id)}
                          title="Annuler cette vente"
                          style={{ color: C.red }}
                        >
                          <Ban size={13} />
                          Annuler
                        </Button>
                      )}
                      <button
                        onClick={() => setDeleteConfirmId(sale.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: C.red,
                          padding: '4px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        title="Supprimer cette vente"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      background: C.card2,
                      border: `1px solid ${C.border}`,
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}
                  >
                    {(sale.items || []).map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px 14px',
                          borderBottom:
                            idx < (sale.items || []).length - 1 ? `1px solid ${C.border}` : 'none',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '13px',
                            color: C.text,
                            flex: 1,
                            textDecoration: isCancelled ? 'line-through' : 'none',
                          }}
                        >
                          {item.name}
                        </span>
                        <span style={{ fontSize: '12px', color: C.muted, flexShrink: 0 }}>
                          {item.qty} × {fmt(item.unitPrice)}
                        </span>
                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: 700,
                            color: C.text,
                            flexShrink: 0,
                          }}
                        >
                          {fmt(item.qty * item.unitPrice)}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================================
          MODAL — CONFIRM SALE
      ====================================================================== */}
      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Confirmer la vente">
        <div className="table-responsive">
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Article', 'Qté', 'Prix unit.', 'Sous-total'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: h === 'Article' ? 'left' : 'right',
                      padding: '6px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: C.muted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cart.map((item) => (
                <tr key={item.key} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '8px', fontSize: '13px', color: C.text }}>
                    {item.name}
                    {item.mode === WHOLESALE && (
                      <span style={{ color: C.terra, fontWeight: 700, fontSize: '11px' }}>
                        {' '}
                        · GROS
                      </span>
                    )}
                  </td>
                  <td
                    style={{ padding: '8px', fontSize: '13px', color: C.muted, textAlign: 'right' }}
                  >
                    {item.qty} {item.mode === WHOLESALE ? item.packLabel : item.unit || ''}
                    {item.mode === WHOLESALE && (
                      <div style={{ fontSize: '11px', opacity: 0.75 }}>
                        = {lineUnits(item)} {item.unit || 'u.'}
                      </div>
                    )}
                  </td>
                  <td
                    style={{ padding: '8px', fontSize: '13px', color: C.muted, textAlign: 'right' }}
                  >
                    {fmt(item.unitPrice)}
                  </td>
                  <td
                    style={{
                      padding: '8px',
                      fontSize: '13px',
                      fontWeight: 700,
                      color: C.text,
                      textAlign: 'right',
                    }}
                  >
                    {fmt(lineTotal(item))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Grand total */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: C.card2,
            border: `1px solid ${C.border}`,
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 700, color: C.muted }}>TOTAL</span>
          <span style={{ fontSize: '28px', fontWeight: 900, color: C.amber }}>
            {fmt(cartTotal)}
          </span>
        </div>

        {/* Client + payment */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div
            style={{
              flex: 1,
              minWidth: '120px',
              background: C.card2,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              padding: '10px 14px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: C.muted,
                fontWeight: 700,
                textTransform: 'uppercase',
                marginBottom: '4px',
              }}
            >
              Client
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: C.text }}>
              {clientName || 'Client anonyme'}
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: '120px',
              background: C.card2,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              padding: '10px 14px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: C.muted,
                fontWeight: 700,
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}
            >
              Paiement
            </div>
            <PaymentBadge mode={payment} />
          </div>
        </div>

        {/* Credit warning */}
        {payment === 'crédit' && (
          <div
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
              background: 'rgba(245,166,35,0.08)',
              border: '1px solid rgba(245,166,35,0.3)',
              borderRadius: '8px',
              padding: '12px 14px',
              marginBottom: '16px',
            }}
          >
            <AlertTriangle size={18} color={C.amber} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span style={{ fontSize: '13px', color: C.amber, lineHeight: 1.5 }}>
              Cette vente sera enregistrée comme crédit client. Le paiement est différé.
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="md" onClick={() => setShowConfirm(false)}>
            Annuler
          </Button>
          <Button variant="primary" size="md" onClick={handleConfirmSale}>
            <CheckCircle size={16} />
            Confirmer
          </Button>
        </div>
      </Modal>

      {/* ======================================================================
          MODAL — DELETE SALE CONFIRM
      ====================================================================== */}
      <Modal
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Supprimer la vente"
      >
        <p style={{ color: C.text, fontSize: '15px', lineHeight: 1.6, marginTop: 0 }}>
          Confirmer la suppression de cette vente ? Cette action est irréversible.
        </p>
        <div
          style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}
        >
          <Button variant="ghost" size="md" onClick={() => setDeleteConfirmId(null)}>
            Annuler
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={() => {
              deleteSale(deleteConfirmId);
              setDeleteConfirmId(null);
            }}
          >
            <Trash2 size={15} />
            Supprimer
          </Button>
        </div>
      </Modal>

      {/* ======================================================================
          MODAL — CANCEL SALE CONFIRM
      ====================================================================== */}
      <Modal
        open={!!cancelConfirmId}
        onClose={() => setCancelConfirmId(null)}
        title="Annuler la vente"
      >
        <p style={{ color: C.text, fontSize: '15px', lineHeight: 1.6, marginTop: 0 }}>
          Confirmer l&apos;annulation de cette vente ? La vente sera marquée comme annulée, le
          stock des articles sera restitué et, s&apos;il s&apos;agit d&apos;une vente à crédit, la
          créance du client sera annulée.
        </p>
        <div
          style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}
        >
          <Button variant="ghost" size="md" onClick={() => setCancelConfirmId(null)}>
            Retour
          </Button>
          <Button variant="danger" size="md" onClick={handleCancelSale}>
            <Ban size={15} />
            Annuler la vente
          </Button>
        </div>
      </Modal>
    </div>
  );
}
