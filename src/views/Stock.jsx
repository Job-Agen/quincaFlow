'use client';

import React, { useState, useMemo } from 'react';
import {
  Edit2,
  Trash2,
  Plus,
  Minus,
  Package,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  History,
  CheckSquare,
  Square,
  X,
  Layers,
} from 'lucide-react';

import useProducts from '../hooks/useProducts';
import useSettings from '../hooks/useSettings';
import useStockMovements from '../hooks/useStockMovements';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { fmt } from '../utils/formatCurrency';
import { formatDate, formatTime } from '../utils/dateHelpers';
import {
  normalizePackagings,
  blankPackaging,
  hasBulk,
  marginOf,
  discountOf,
  decomposeStock,
} from '../utils/packaging';

// ─── Design tokens ──────────────────────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
function calcMargin(buyPrice, sellPrice) {
  const buy = parseFloat(buyPrice) || 0;
  const sell = parseFloat(sellPrice) || 0;
  if (buy <= 0) return null;
  return ((sell - buy) / buy) * 100;
}

function MarginLabel({ margin }) {
  if (margin === null) return <span style={{ color: C.muted }}>—</span>;
  const color = margin < 15 ? C.red : margin < 30 ? C.amber : C.green;
  return <span style={{ color, fontWeight: 600 }}>{margin.toFixed(1)}%</span>;
}

// ─── Empty state ─────────────────────────────────────────────────────────────
function makeBlankForm(categories, units) {
  const baseUnit = units[0] || 'unité';
  return {
    name: '',
    cat: categories[0] || '',
    buyPrice: '',
    qty: '',
    unit: baseUnit,
    minQty: '5',
    // Le premier conditionnement est toujours l'unité de base : c'est lui qui
    // porte le prix de détail et définit ce que compte le stock.
    packagings: [{ ...blankPackaging(baseUnit, '1', ''), isDefault: true }],
    // Vide = prix d'achat saisi à l'unité de base ; sinon l'id du lot acheté.
    buyPackagingId: '',
  };
}

// Motifs proposés pour un ajustement manuel de stock
const ADJUST_REASONS = ['Inventaire', 'Casse', 'Perte/Vol', 'Correction', 'Autre'];

/**
 * Comme fmt(), mais sans arrondir à l'entier.
 *
 * Un carton de 40 payé 12 750 revient à 318,75 la pièce : afficher « 319 »
 * dans la conversion laisserait croire à une valeur ronde et ferait douter
 * du calcul. Ailleurs l'arrondi de fmt() convient, les prix de vente étant
 * saisis en francs entiers.
 */
function fmtExact(value) {
  const n = Number(value) || 0;
  if (Number.isInteger(n)) return fmt(n);
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    fmt(0).replace(/^0/, '');
}

// ─── Unité du prix d'achat ───────────────────────────────────────────────────
/**
 * Un article acheté au carton et revendu à la pièce piégeait la saisie : le
 * prix du carton entré tel quel donnait des marges négatives et un stock
 * surévalué d'un facteur égal au conditionnement. On demande donc l'unité du
 * montant saisi, et on affiche la conversion pour qu'aucun chiffre retenu ne
 * soit une surprise.
 */
function BuyUnitChoice({ form, setForm, resolved }) {
  const baseUnit = form.unit || 'unité';
  const lots = form.packagings.filter((p) => (parseFloat(p.size) || 0) > 1);
  const current = lots.find((p) => p.id === form.buyPackagingId);
  const size = current ? parseFloat(current.size) || 0 : 1;

  const options = [
    { value: '', label: `par ${baseUnit}` },
    ...lots.map((p) => ({ value: p.id, label: `par ${p.label || 'lot'}` })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <Select
        label="Ce prix d'achat est"
        value={form.buyPackagingId}
        onChange={(e) => setForm((f) => ({ ...f, buyPackagingId: e.target.value }))}
        options={options}
      />
      {current && (
        <div style={{ fontSize: '12px', color: size > 0 ? C.green : C.red }}>
          {size > 0 ? (
            <>
              soit <strong>{fmtExact(resolved)}</strong> / {baseUnit} (
              {fmt(form.buyPrice || 0)} ÷ {size})
            </>
          ) : (
            <>Indiquez combien de {baseUnit} contient ce {current.label}.</>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Conditionnements ────────────────────────────────────────────────────────
/**
 * Les conditionnements d'un article et leurs prix de vente.
 *
 * Le premier est l'unité de base : sa taille vaut toujours 1 et il ne peut pas
 * être supprimé, c'est lui qui définit le stock. Les suivants sont des lots —
 * carton, sac, palette — dont on donne le contenu et le prix du lot entier.
 * Chaque ligne affiche son prix ramené à l'unité et sa marge, pour qu'un tarif
 * de gros incohérent se voie avant l'enregistrement.
 */
function PackagingsEditor({ form, setForm, unitCost }) {
  const baseUnit = form.unit || 'unité';

  const patch = (id, field) => (e) =>
    setForm((f) => ({
      ...f,
      packagings: f.packagings.map((p) =>
        p.id === id ? { ...p, [field]: e.target.value } : p
      ),
    }));

  const add = () =>
    setForm((f) => ({ ...f, packagings: [...f.packagings, blankPackaging()] }));

  const remove = (id) =>
    setForm((f) => ({
      ...f,
      packagings: f.packagings.filter((p) => p.id !== id),
      buyPackagingId: f.buyPackagingId === id ? '' : f.buyPackagingId,
    }));

  const draft = { unit: form.unit, packagings: form.packagings };

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: '10px',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Layers size={15} color={C.amber} />
        <strong style={{ fontSize: '13px', color: C.amber }}>
          Conditionnements &amp; prix de vente
        </strong>
      </div>

      <p style={{ margin: 0, fontSize: '12px', color: C.muted, lineHeight: 1.5 }}>
        Le stock est compté en {baseUnit}. Ajoutez un lot pour vendre aussi au
        carton, au sac ou à la palette : vendre un lot retire son contenu du même
        stock.
      </p>

      {form.packagings.map((p, i) => {
        const isBase = i === 0;
        const size = parseFloat(p.size) || 0;
        const perUnit = size > 0 ? (parseFloat(p.price) || 0) / size : null;
        const marge = marginOf({ size, price: p.price }, unitCost);
        const remise = discountOf({ size, price: p.price }, draft);

        return (
          <div
            key={p.id}
            style={{
              border: `1px solid ${isBase ? C.border : C.card2}`,
              borderRadius: '8px',
              padding: '10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              background: isBase ? 'transparent' : C.card2,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: isBase ? C.muted : C.terra,
                }}
              >
                {isBase ? `Unité de base — ${baseUnit}` : `Lot ${i}`}
              </span>
              {!isBase && (
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  title="Retirer ce conditionnement"
                  style={{
                    marginLeft: 'auto',
                    background: 'none',
                    border: 'none',
                    color: C.red,
                    cursor: 'pointer',
                    padding: '2px 4px',
                    display: 'flex',
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="responsive-grid cols-2" style={{ gap: '10px' }}>
              <Input
                label="Nom"
                value={isBase ? baseUnit : p.label}
                onChange={patch(p.id, 'label')}
                disabled={isBase}
                placeholder="ex: carton"
              />
              <Input
                label={`${baseUnit} contenues`}
                value={isBase ? '1' : p.size}
                onChange={patch(p.id, 'size')}
                type="number"
                min="1"
                disabled={isBase}
                placeholder="ex: 40"
              />
            </div>
            <Input
              label={isBase ? `Prix de vente d'${baseUnit === 'unité' ? 'une' : 'un'} ${baseUnit} (FCFA)` : `Prix du ${p.label || 'lot'} entier (FCFA)`}
              value={p.price}
              onChange={patch(p.id, 'price')}
              type="number"
              min="0"
              placeholder="0"
            />

            {size > 0 && parseFloat(p.price) > 0 && (
              <div style={{ fontSize: '12px', color: C.muted }}>
                {!isBase && (
                  <>
                    <strong style={{ color: C.text }}>{fmtExact(perUnit)}</strong> / {baseUnit}
                    {remise !== null && (
                      <>
                        {' — '}
                        <strong style={{ color: remise >= 0 ? C.green : C.red }}>
                          {remise >= 0 ? '−' : '+'}
                          {Math.abs(remise).toFixed(1)}%
                        </strong>{' '}
                        {remise >= 0 ? 'contre le détail' : 'PLUS CHER que le détail'}
                        {' · '}
                      </>
                    )}
                  </>
                )}
                Marge : <MarginLabel margin={marge} />
              </div>
            )}
          </div>
        );
      })}

      <Button variant="ghost" type="button" onClick={add}>
        <Plus size={14} /> Ajouter un conditionnement
      </Button>
    </div>
  );
}


// ─── Product Form Modal ───────────────────────────────────────────────────────
function ProductFormModal({ open, onClose, onSave, initial, categories, units }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(() => initial || makeBlankForm(categories, units));

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) setForm(initial || makeBlankForm(categories, units));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  // Le prix d'achat peut être saisi au lot : tout le reste de l'application
  // raisonne à l'unité de base, on convertit donc ici une fois pour toutes.
  const buyLot = form.packagings.find((p) => p.id === form.buyPackagingId);
  const buyLotSize = buyLot ? parseFloat(buyLot.size) || 0 : 1;
  const resolvedBuyPrice =
    buyLot && buyLotSize > 0
      ? (parseFloat(form.buyPrice) || 0) / buyLotSize
      : parseFloat(form.buyPrice) || 0;

  // Le prix de détail est celui du premier conditionnement, l'unité de base.
  const basePrice = parseFloat(form.packagings[0] && form.packagings[0].price) || 0;
  const margin = calcMargin(resolvedBuyPrice, basePrice);

  function handleSubmit(e) {
    e.preventDefault();
    const baseUnit = form.unit || 'unité';
    const packagings = form.packagings
      .map((p, i) => ({
        id: p.id,
        label: i === 0 ? baseUnit : (p.label || '').trim() || 'lot',
        size: i === 0 ? 1 : parseFloat(p.size) || 0,
        price: parseFloat(p.price) || 0,
        isDefault: i === 0,
      }))
      .filter((p) => p.size > 0);

    onSave({
      name: form.name.trim(),
      cat: form.cat,
      buyPrice: resolvedBuyPrice,
      // sellPrice reste synchronisé sur l'unité de base : le tableau de bord,
      // la comptabilité et les anciennes ventes s'y réfèrent encore.
      sellPrice: basePrice,
      qty: parseFloat(form.qty) || 0,
      unit: baseUnit,
      minQty: parseFloat(form.minQty) || 0,
      packagings,
    });
    onClose();
  }

  const catOptions = categories.map((c) => ({ value: c, label: c }));
  const unitOptions = units.map((u) => ({ value: u, label: u }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier un article' : 'Ajouter un article'}
    >
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="Nom de l'article"
            value={form.name}
            onChange={set('name')}
            placeholder="ex: Ciment Portland 50kg"
            required
          />
          <Select
            label="Catégorie"
            value={form.cat}
            onChange={set('cat')}
            options={catOptions}
            required
          />
          <Input
            label="Prix d'achat (FCFA)"
            value={form.buyPrice}
            onChange={set('buyPrice')}
            type="number"
            min="0"
            step="any"
            placeholder="0"
          />

          <BuyUnitChoice form={form} setForm={setForm} resolved={resolvedBuyPrice} />

          {/* Live margin preview */}
          {form.buyPrice && basePrice > 0 && (
            <div
              style={{
                background: C.card2,
                border: `1px solid ${C.border}`,
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                color: C.muted,
              }}
            >
              <TrendingUp size={14} />
              <span>Marge calculée :</span>
              <strong>
                <MarginLabel margin={margin} />
              </strong>
            </div>
          )}

          {/* Le prix de gros est un prix : sa place est avec les autres, pas
              enterré sous les réglages de stock où personne ne le trouvait. */}
          <PackagingsEditor form={form} setForm={setForm} unitCost={resolvedBuyPrice} />

          <div className="responsive-grid cols-2" style={{ gap: '12px' }}>
            <Input
              label="Quantité en stock"
              value={form.qty}
              onChange={set('qty')}
              type="number"
              min="0"
              placeholder="0"
            />
            <Select label="Unité" value={form.unit} onChange={set('unit')} options={unitOptions} />
          </div>
          <Input
            label="Stock minimum (alerte)"
            value={form.minQty}
            onChange={set('minQty')}
            type="number"
            min="0"
            placeholder="5"
          />
        </div>

        <div
          style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}
        >
          <Button variant="ghost" type="button" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" type="submit">
            {isEdit ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Adjust Stock Modal ───────────────────────────────────────────────────────
function AdjustStockModal({ open, onClose, product, onAdjust }) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(ADJUST_REASONS[0]);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (open) {
      setQty('');
      setReason(ADJUST_REASONS[0]);
      setError('');
    }
  }, [open]);

  if (!product) return null;

  function handleAdjust(direction) {
    const val = parseFloat(qty);
    if (isNaN(val) || val <= 0) {
      setError('Veuillez entrer une quantité valide (> 0)');
      return;
    }
    const delta = direction === 'in' ? val : -val;
    if (direction === 'out' && (product.qty || 0) + delta < 0) {
      setError(`Stock insuffisant. Stock actuel : ${product.qty}`);
      return;
    }
    onAdjust(product, delta, reason);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Ajuster le stock : ${product.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            background: C.card2,
            border: `1px solid ${C.border}`,
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ color: C.muted, fontSize: '13px' }}>Stock actuel</span>
          <span style={{ color: C.text, fontWeight: 700, fontSize: '18px' }}>
            {product.qty} <span style={{ fontSize: '13px', color: C.muted }}>{product.unit}</span>
          </span>
        </div>

        <Input
          label="Quantité à ajuster"
          value={qty}
          onChange={(e) => {
            setQty(e.target.value);
            setError('');
          }}
          type="number"
          min="0"
          placeholder="ex: 10"
        />

        <Select
          label="Motif de l'ajustement"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          options={ADJUST_REASONS}
        />

        {error && (
          <div
            style={{
              color: C.red,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <Button
            variant="green"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => handleAdjust('in')}
          >
            <Plus size={16} /> Entrée (+)
          </Button>
          <Button
            variant="terra"
            style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => handleAdjust('out')}
          >
            <Minus size={16} /> Sortie (−)
          </Button>
        </div>
        <Button
          variant="ghost"
          onClick={onClose}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Annuler
        </Button>
      </div>
    </Modal>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteModal({ open, onClose, product, onConfirm }) {
  if (!product) return null;
  return (
    <Modal open={open} onClose={onClose} title="Confirmer la suppression">
      <div style={{ color: C.text, marginBottom: '20px', lineHeight: 1.6 }}>
        Supprimer <strong style={{ color: C.amber }}>"{product.name}"</strong> ?
        <br />
        <span style={{ color: C.muted, fontSize: '13px' }}>Cette action est irréversible.</span>
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            onConfirm(product.id);
            onClose();
          }}
        >
          <Trash2 size={14} /> Supprimer
        </Button>
      </div>
    </Modal>
  );
}

// ─── Batch Delete Confirm Modal ───────────────────────────────────────────────
function BatchDeleteModal({ open, onClose, count, onConfirm }) {
  return (
    <Modal open={open} onClose={onClose} title="Suppression par lot">
      <div style={{ color: C.text, marginBottom: '20px', lineHeight: 1.6 }}>
        Voulez-vous vraiment supprimer <strong style={{ color: C.red }}>{count} article(s)</strong> sélectionné(s) ?
        <br />
        <span style={{ color: C.muted, fontSize: '13px' }}>Cette action supprimera ces produits du stock définitivement.</span>
      </div>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          <Trash2 size={14} /> Supprimer les {count} articles
        </Button>
      </div>
    </Modal>
  );
}

// ─── Main Stock Page ──────────────────────────────────────────────────────────
export default function Stock() {
  const { products, addProduct, updateProduct, deleteProduct, adjustStock } = useProducts();
  const { settings } = useSettings();
  const { movements, logMovement } = useStockMovements();

  const categories = settings.productCategories || [];
  const units = settings.units || [];

  // Tabs
  const [tab, setTab] = useState('articles'); // 'articles' | 'mouvements'

  // Filters
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');

  // Batch Selection State
  const [selectedIds, setSelectedIds] = useState([]);

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

  // Responsive: detect desktop
  const [isDesktop, setIsDesktop] = useState(true);
  React.useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth > 768);
    handler();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Filtered list
  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
      const matchCat = !filterCat || p.cat === filterCat;
      return matchSearch && matchCat;
    });
  }, [products, search, filterCat]);

  // Selection helpers
  const isAllSelected = filtered.length > 0 && filtered.every((p) => selectedIds.includes(p.id));
  const isSomeSelected = selectedIds.length > 0;

  function toggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (isAllSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((p) => p.id));
    }
  }

  function handleBatchDeleteConfirm() {
    selectedIds.forEach((id) => deleteProduct(id));
    setSelectedIds([]);
  }

  // Summary stats
  const totalValue = useMemo(
    () => products.reduce((sum, p) => sum + (p.qty || 0) * (p.buyPrice || 0), 0),
    [products]
  );
  const lowStockCount = useMemo(
    () => products.filter((p) => (p.qty || 0) <= (p.minQty || 0)).length,
    [products]
  );

  const catOptions = [
    { value: '', label: 'Toutes les catégories' },
    ...categories.map((c) => ({ value: c, label: c })),
  ];

  // 30 derniers mouvements, triés par date décroissante
  const recentMovements = useMemo(
    () =>
      [...movements].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 30),
    [movements]
  );

  function handleSaveAdd(data) {
    addProduct(data);
  }
  function handleSaveEdit(data) {
    if (editProduct) updateProduct(editProduct.id, data);
  }
  function handleAdjustWithReason(product, delta, reason) {
    adjustStock(product.id, delta);
    logMovement({
      productId: product.id,
      productName: product.name,
      type: 'ajustement',
      qty: delta,
      reason,
    });
  }

  // Table column header style
  const thStyle = {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 600,
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: 'nowrap',
  };
  const tdStyle = {
    padding: '12px 14px',
    fontSize: '14px',
    color: C.text,
    borderBottom: `1px solid ${C.border}`,
    verticalAlign: 'middle',
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '28px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Package size={28} color={C.amber} />
          <h1
            style={{
              margin: 0,
              fontFamily: 'Syne, sans-serif',
              fontWeight: 700,
              fontSize: isDesktop ? '28px' : '22px',
              color: C.amber,
            }}
          >
            Gestion du Stock
          </h1>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <Plus size={16} /> Ajouter un article
        </Button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <TabButton active={tab === 'articles'} onClick={() => setTab('articles')}>
          <Package size={14} /> Articles
        </TabButton>
        <TabButton active={tab === 'mouvements'} onClick={() => setTab('mouvements')}>
          <History size={14} /> Mouvements
        </TabButton>
      </div>

      {tab === 'mouvements' ? (
        <MovementsSection movements={recentMovements} />
      ) : (
        <>
          {/* BARRE D'ACTIONS PAR LOT (SI SELECTION ACTIVE) */}
          {isSomeSelected && (
            <div
              style={{
                background: 'linear-gradient(135deg, #2A170A 0%, #1A0D04 100%)',
                border: `1px solid ${C.amber}`,
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    background: C.amber,
                    color: '#000',
                    fontWeight: 800,
                    fontSize: '12px',
                    borderRadius: '50%',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selectedIds.length}
                </span>
                <span style={{ color: C.text, fontSize: '14px', fontWeight: 600 }}>
                  article(s) sélectionné(s)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSelectAll}
                  style={{ fontSize: '13px' }}
                >
                  {isAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setBatchDeleteOpen(true)}
                >
                  <Trash2 size={14} /> Supprimer la sélection
                </Button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: C.muted,
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Fermer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
            <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un article..."
              />
            </div>
            <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
              <Select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
                options={catOptions}
              />
            </div>
          </div>

          {/* Content */}
          {filtered.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
              <Package size={40} color={C.muted} style={{ marginBottom: '12px' }} />
              <p style={{ color: C.muted, margin: 0, fontSize: '15px' }}>
                {products.length === 0
                  ? 'Aucun article en stock. Ajoutez votre premier article.'
                  : 'Aucun article ne correspond à votre recherche.'}
              </p>
            </Card>
          ) : isDesktop ? (
            /* ── Desktop Table ── */
            <Card style={{ padding: 0 }}>
              <div className="table-responsive">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: C.card2 }}>
                      <th style={{ ...thStyle, width: '40px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={toggleSelectAll}
                          style={{
                            accentColor: C.amber,
                            width: '16px',
                            height: '16px',
                            cursor: 'pointer',
                          }}
                        />
                      </th>
                      <th style={thStyle}>Article</th>
                      <th style={thStyle}>Catégorie</th>
                      <th style={thStyle}>Stock</th>
                      <th style={thStyle}>Unité</th>
                      <th style={thStyle}>Prix achat</th>
                      <th style={thStyle}>Prix vente</th>
                      <th style={thStyle}>Marge</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p, i) => {
                      const margin = calcMargin(p.buyPrice, p.sellPrice);
                      const isLow = (p.qty || 0) <= (p.minQty || 0);
                      const isChecked = selectedIds.includes(p.id);

                      return (
                        <tr
                          key={p.id}
                          style={{
                            background: isChecked
                              ? 'rgba(245, 166, 35, 0.08)'
                              : i % 2 === 0
                              ? C.card
                              : C.card2,
                            transition: 'background 0.15s',
                          }}
                        >
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelect(p.id)}
                              style={{
                                accentColor: C.amber,
                                width: '16px',
                                height: '16px',
                                cursor: 'pointer',
                              }}
                            />
                          </td>
                          <td style={tdStyle}>
                            <span style={{ fontWeight: 600 }}>{p.name}</span>
                            {hasBulk(p) && (
                              <Badge variant="warning">
                                <Layers size={10} /> Gros
                              </Badge>
                            )}
                          </td>
                          <td style={tdStyle}>
                            <Badge variant="neutral">{p.cat}</Badge>
                          </td>
                          <td style={tdStyle}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                flexWrap: 'wrap',
                              }}
                            >
                              <span style={{ fontWeight: 700, color: isLow ? C.red : C.text }}>
                                {p.qty || 0}
                              </span>
                              {isLow && (
                                <Badge variant="danger">
                                  <AlertTriangle size={10} /> Stock faible
                                </Badge>
                              )}
                            </div>
                            {decomposeStock(p) && (
                              <div style={{ fontSize: '11px', color: C.muted, marginTop: '3px' }}>
                                {decomposeStock(p)}
                              </div>
                            )}
                          </td>
                          <td style={{ ...tdStyle, color: C.muted }}>{p.unit}</td>
                          <td style={tdStyle}>{fmt(p.buyPrice)}</td>
                          <td style={tdStyle}>
                            {fmt(p.sellPrice)}
                            {normalizePackagings(p)
                              .filter((pk) => pk.size > 1)
                              .map((pk) => (
                                <div
                                  key={pk.id}
                                  style={{ fontSize: '11px', color: C.amber, marginTop: '3px' }}
                                >
                                  {fmt(pk.price)} / {pk.label}
                                </div>
                              ))}
                          </td>
                          <td style={tdStyle}>
                            <MarginLabel margin={margin} />
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button
                                title="Ajuster le stock"
                                onClick={() => setAdjustProduct(p)}
                                style={iconBtnStyle(C.blue)}
                              >
                                <Plus size={14} />
                              </button>
                              <button
                                title="Modifier"
                                onClick={() => setEditProduct(p)}
                                style={iconBtnStyle(C.amber)}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                title="Supprimer"
                                onClick={() => setDeleteTarget(p)}
                                style={iconBtnStyle(C.red)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            /* ── Mobile Cards ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filtered.map((p) => {
                const margin = calcMargin(p.buyPrice, p.sellPrice);
                const isLow = (p.qty || 0) <= (p.minQty || 0);
                const isChecked = selectedIds.includes(p.id);

                return (
                  <Card
                    key={p.id}
                    style={{
                      padding: '16px',
                      border: isChecked ? `1px solid ${C.amber}` : `1px solid ${C.border}`,
                      background: isChecked ? 'rgba(245, 166, 35, 0.05)' : C.card,
                    }}
                  >
                    {/* Top row */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(p.id)}
                          style={{
                            accentColor: C.amber,
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer',
                            marginTop: '2px',
                          }}
                        />
                        <div>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: '15px',
                              color: C.text,
                              marginBottom: '4px',
                            }}
                          >
                            {p.name}
                          </div>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <Badge variant="neutral">{p.cat}</Badge>
                            {hasBulk(p) && (
                              <Badge variant="warning">
                                <Layers size={10} /> Gros
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          title="Ajuster"
                          onClick={() => setAdjustProduct(p)}
                          style={iconBtnStyle(C.blue)}
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          title="Modifier"
                          onClick={() => setEditProduct(p)}
                          style={iconBtnStyle(C.amber)}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          title="Supprimer"
                          onClick={() => setDeleteTarget(p)}
                          style={iconBtnStyle(C.red)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Stats grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        marginTop: '8px',
                      }}
                    >
                      <MobileStatCell
                        label="Stock"
                        value={
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span style={{ fontWeight: 700, color: isLow ? C.red : C.text }}>
                              {p.qty || 0} {p.unit}
                            </span>
                            {isLow && (
                              <Badge variant="danger">
                                <AlertTriangle size={10} /> Faible
                              </Badge>
                            )}
                            {decomposeStock(p) && (
                              <span style={{ fontSize: '11px', color: C.muted, width: '100%' }}>
                                {decomposeStock(p)}
                              </span>
                            )}
                          </div>
                        }
                      />
                      <MobileStatCell label="Marge" value={<MarginLabel margin={margin} />} />
                      <MobileStatCell label="Prix achat" value={fmt(p.buyPrice)} />
                      <MobileStatCell label="Prix vente (détail)" value={fmt(p.sellPrice)} />
                      {normalizePackagings(p)
                        .filter((pk) => pk.size > 1)
                        .map((pk) => (
                          <MobileStatCell
                            key={pk.id}
                            label={`Prix / ${pk.label}`}
                            value={
                              <span style={{ color: C.amber, fontWeight: 700 }}>
                                {fmt(pk.price)}
                              </span>
                            }
                          />
                        ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Summary footer */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : '1fr',
              gap: '12px',
              marginTop: '28px',
            }}
          >
            <SummaryCard
              icon={<Package size={20} color={C.amber} />}
              label="Total articles"
              value={`${products.length} produit${products.length !== 1 ? 's' : ''}`}
            />
            <SummaryCard
              icon={<DollarSign size={20} color={C.green} />}
              label="Valeur totale du stock"
              value={fmt(totalValue)}
              color={C.green}
            />
            <SummaryCard
              icon={<AlertTriangle size={20} color={lowStockCount > 0 ? C.red : C.muted} />}
              label="Articles en stock faible"
              value={`${lowStockCount} article${lowStockCount !== 1 ? 's' : ''}`}
              color={lowStockCount > 0 ? C.red : C.muted}
            />
          </div>
        </>
      )}

      {/* Modals */}
      <ProductFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleSaveAdd}
        initial={null}
        categories={categories}
        units={units}
      />
      <ProductFormModal
        open={!!editProduct}
        onClose={() => setEditProduct(null)}
        onSave={handleSaveEdit}
        initial={
          editProduct
            ? {
                name: editProduct.name,
                cat: editProduct.cat,
                buyPrice: String(editProduct.buyPrice),
                qty: String(editProduct.qty),
                unit: editProduct.unit,
                minQty: String(editProduct.minQty),
                // normalizePackagings convertit au passage les articles créés
                // avant les conditionnements multiples.
                packagings: normalizePackagings(editProduct).map((pk) => ({
                  ...pk,
                  size: String(pk.size),
                  price: String(pk.price),
                })),
                // Seul le coût à l'unité est stocké : on rouvre donc toujours
                // dans ce mode, quel que soit celui de la saisie initiale.
                buyPackagingId: '',
              }
            : null
        }
        categories={categories}
        units={units}
      />
      <AdjustStockModal
        open={!!adjustProduct}
        onClose={() => setAdjustProduct(null)}
        product={adjustProduct}
        onAdjust={handleAdjustWithReason}
      />
      <DeleteModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        product={deleteTarget}
        onConfirm={deleteProduct}
      />
      <BatchDeleteModal
        open={batchDeleteOpen}
        onClose={() => setBatchDeleteOpen(false)}
        count={selectedIds.length}
        onConfirm={handleBatchDeleteConfirm}
      />
    </div>
  );
}

// ─── Movements journal ────────────────────────────────────────────────────────
const MOVEMENT_BADGE = {
  entrée: 'success',
  sortie: 'danger',
  ajustement: 'warning',
};

function MovementsSection({ movements }) {
  if (movements.length === 0) {
    return (
      <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
        <History size={40} color={C.muted} style={{ marginBottom: '12px' }} />
        <p style={{ color: C.muted, margin: 0, fontSize: '15px' }}>Aucun mouvement enregistré.</p>
      </Card>
    );
  }
  return (
    <Card style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {movements.map((m) => {
          const signedQty = m.qty > 0 ? `+${m.qty}` : String(m.qty);
          const qtyColor = m.qty > 0 ? C.green : m.qty < 0 ? C.red : C.muted;
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                borderBottom: `1px solid ${C.border}`,
                fontSize: '13px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ color: C.muted, whiteSpace: 'nowrap', minWidth: '110px' }}>
                {formatDate(m.date)} {formatTime(m.date)}
              </span>
              <span style={{ flex: 1, color: C.text, fontWeight: 600, minWidth: '100px' }}>
                {m.productName}
              </span>
              <Badge variant={MOVEMENT_BADGE[m.type] || 'neutral'}>{m.type}</Badge>
              <span
                style={{
                  fontWeight: 700,
                  color: qtyColor,
                  minWidth: '48px',
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                }}
              >
                {signedQty}
              </span>
              <span style={{ color: C.muted, flex: '1 1 140px', minWidth: '120px' }}>
                {m.reason || '—'}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────
function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 16px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: active ? 'rgba(245,166,35,0.15)' : 'transparent',
        color: active ? C.amber : C.muted,
        border: `1px solid ${active ? C.amber : C.border}`,
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

function MobileStatCell({ label, value }) {
  return (
    <div
      style={{
        background: '#221408',
        borderRadius: '8px',
        padding: '8px 10px',
        border: '1px solid #362210',
      }}
    >
      <div style={{ fontSize: '11px', color: '#8B7B64', marginBottom: '4px', fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: '13px', color: '#F5EDD8', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function SummaryCard({ icon, label, value, color }) {
  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
      <div
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: 'rgba(245,166,35,0.08)',
          border: '1px solid #362210',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '12px', color: '#8B7B64', marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: color || '#F5EDD8' }}>{value}</div>
      </div>
    </Card>
  );
}

function iconBtnStyle(color) {
  return {
    background: `${color}18`,
    border: `1px solid ${color}44`,
    borderRadius: '7px',
    color: color,
    padding: '6px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s',
  };
}
