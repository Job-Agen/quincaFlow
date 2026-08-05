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
  hasWholesale,
  packUnitPrice,
  wholesaleDiscount,
  wholesaleMargin,
  packBreakdown,
  packLabelOf,
} from '../utils/pricing';

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
  return {
    name: '',
    cat: categories[0] || '',
    buyPrice: '',
    sellPrice: '',
    qty: '',
    unit: units[0] || '',
    minQty: '5',
    // Conditionnement : laissé vide, l'article ne se vend qu'au détail.
    packLabel: 'carton',
    packSize: '',
    packPrice: '',
  };
}

// Motifs proposés pour un ajustement manuel de stock
const ADJUST_REASONS = ['Inventaire', 'Casse', 'Perte/Vol', 'Correction', 'Autre'];

// ─── Conditionnement (vente en gros) ─────────────────────────────────────────
/**
 * Le conditionnement est optionnel : sans lui l'article ne se vend qu'au détail.
 * L'aperçu ramène le prix du carton à la pièce, seul moyen de voir d'un coup
 * d'œil si le tarif de gros tient la route face au prix d'achat.
 */
function WholesaleFields({ form, set }) {
  const draft = {
    buyPrice: form.buyPrice,
    sellPrice: form.sellPrice,
    packSize: form.packSize,
    packPrice: form.packPrice,
    packLabel: form.packLabel,
  };
  const active = hasWholesale(draft);
  const perUnit = packUnitPrice(draft);
  const discount = wholesaleDiscount(draft);
  const margin = wholesaleMargin(draft);
  const label = (form.packLabel || 'carton').trim() || 'carton';
  const baseUnit = form.unit || 'unité';

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
        <strong style={{ fontSize: '13px', color: C.amber }}>Vente en gros</strong>
        <span style={{ fontSize: '12px', color: C.muted }}>— optionnel</span>
      </div>

      <p style={{ margin: 0, fontSize: '12px', color: C.muted, lineHeight: 1.5 }}>
        Renseignez le conditionnement pour vendre aussi au {label}. Le stock reste
        compté en {baseUnit} : vendre un {label} en retire {form.packSize || 'N'}.
        Laissez vide si l&apos;article ne se vend qu&apos;au détail.
      </p>

      <div className="responsive-grid cols-2" style={{ gap: '12px' }}>
        <Input
          label="Nom du conditionnement"
          value={form.packLabel}
          onChange={set('packLabel')}
          placeholder="carton"
        />
        <Input
          label={`${baseUnit} par ${label}`}
          value={form.packSize}
          onChange={set('packSize')}
          type="number"
          min="0"
          placeholder="ex: 40"
        />
      </div>

      <Input
        label={`Prix de gros — le ${label} entier (FCFA)`}
        value={form.packPrice}
        onChange={set('packPrice')}
        type="number"
        min="0"
        placeholder="ex: 13000"
      />

      {active && (
        <div
          style={{
            background: C.card2,
            border: `1px solid ${C.border}`,
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '13px',
            color: C.muted,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div>
            Revient à <strong style={{ color: C.text }}>{fmt(perUnit)}</strong> la{' '}
            {baseUnit}
            {discount !== null && (
              <>
                {' — '}
                <strong style={{ color: discount >= 0 ? C.green : C.red }}>
                  {discount >= 0 ? '−' : '+'}
                  {Math.abs(discount).toFixed(1)}%
                </strong>{' '}
                {discount >= 0 ? 'contre le détail' : 'PLUS CHER que le détail'}
              </>
            )}
          </div>
          <div>
            Marge en gros : <MarginLabel margin={margin} />
          </div>
        </div>
      )}
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

  const margin = calcMargin(form.buyPrice, form.sellPrice);

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      name: form.name.trim(),
      cat: form.cat,
      buyPrice: parseFloat(form.buyPrice) || 0,
      sellPrice: parseFloat(form.sellPrice) || 0,
      qty: parseFloat(form.qty) || 0,
      unit: form.unit,
      minQty: parseFloat(form.minQty) || 0,
      packLabel: (form.packLabel || '').trim() || 'carton',
      packSize: parseFloat(form.packSize) || 0,
      packPrice: parseFloat(form.packPrice) || 0,
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
          <div className="responsive-grid cols-2" style={{ gap: '12px' }}>
            <Input
              label="Prix d'achat (FCFA)"
              value={form.buyPrice}
              onChange={set('buyPrice')}
              type="number"
              min="0"
              placeholder="0"
            />
            <Input
              label="Prix de vente au détail (FCFA)"
              value={form.sellPrice}
              onChange={set('sellPrice')}
              type="number"
              min="0"
              placeholder="0"
            />
          </div>

          {/* Live margin preview */}
          {form.buyPrice && form.sellPrice && (
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
          <WholesaleFields form={form} set={set} />

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
                            {hasWholesale(p) && (
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
                            {hasWholesale(p) && (
                              <div style={{ fontSize: '11px', color: C.muted, marginTop: '3px' }}>
                                {packBreakdown(p)}
                              </div>
                            )}
                          </td>
                          <td style={{ ...tdStyle, color: C.muted }}>{p.unit}</td>
                          <td style={tdStyle}>{fmt(p.buyPrice)}</td>
                          <td style={tdStyle}>
                            {fmt(p.sellPrice)}
                            {hasWholesale(p) && (
                              <div style={{ fontSize: '11px', color: C.amber, marginTop: '3px' }}>
                                {fmt(p.packPrice)} / {packLabelOf(p)}
                              </div>
                            )}
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
                            {hasWholesale(p) && (
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
                            {packBreakdown(p) && (
                              <span style={{ fontSize: '11px', color: C.muted, width: '100%' }}>
                                {packBreakdown(p)}
                              </span>
                            )}
                          </div>
                        }
                      />
                      <MobileStatCell label="Marge" value={<MarginLabel margin={margin} />} />
                      <MobileStatCell label="Prix achat" value={fmt(p.buyPrice)} />
                      <MobileStatCell label="Prix vente (détail)" value={fmt(p.sellPrice)} />
                      {hasWholesale(p) && (
                        <MobileStatCell
                          label={`Prix de gros / ${packLabelOf(p)}`}
                          value={
                            <span style={{ color: C.amber, fontWeight: 700 }}>
                              {fmt(p.packPrice)}
                            </span>
                          }
                        />
                      )}
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
                sellPrice: String(editProduct.sellPrice),
                qty: String(editProduct.qty),
                unit: editProduct.unit,
                minQty: String(editProduct.minQty),
                packLabel: packLabelOf(editProduct),
                packSize: editProduct.packSize ? String(editProduct.packSize) : '',
                packPrice: editProduct.packPrice ? String(editProduct.packPrice) : '',
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
