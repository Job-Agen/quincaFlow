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
} from 'lucide-react';

import useProducts from '../hooks/useProducts';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { fmt } from '../utils/formatCurrency';
import { PRODUCT_CATEGORIES, UNITS } from '../constants/categories';

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
const BLANK_FORM = {
  name: '',
  cat: PRODUCT_CATEGORIES[0],
  buyPrice: '',
  sellPrice: '',
  qty: '',
  unit: UNITS[0],
  minQty: '5',
};

// ─── Product Form Modal ───────────────────────────────────────────────────────
function ProductFormModal({ open, onClose, onSave, initial }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(initial || BLANK_FORM);

  // Reset form when modal opens
  React.useEffect(() => {
    if (open) setForm(initial || BLANK_FORM);
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
    });
    onClose();
  }

  const catOptions = PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }));
  const unitOptions = UNITS.map((u) => ({ value: u, label: u }));

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
              label="Prix de vente (FCFA)"
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
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (open) {
      setQty('');
      setError('');
    }
  }, [open]);

  function handleAdjust(direction) {
    const n = parseFloat(qty);
    if (!n || n <= 0) {
      setError('Veuillez saisir une quantité valide (> 0).');
      return;
    }
    const delta = direction === 'in' ? n : -n;
    if ((product.qty || 0) + delta < 0) {
      setError(`Stock insuffisant. Stock actuel : ${product.qty} ${product.unit}.`);
      return;
    }
    onAdjust(product.id, delta);
    onClose();
  }

  if (!product) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Ajuster le stock — ${product.name}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            background: C.card2,
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            border: `1px solid ${C.border}`,
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

// ─── Main Stock Page ──────────────────────────────────────────────────────────
export default function Stock() {
  const { products, addProduct, updateProduct, deleteProduct, adjustStock } = useProducts();

  // Filters
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [adjustProduct, setAdjustProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

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
    ...PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c })),
  ];

  function handleSaveAdd(data) {
    addProduct(data);
  }
  function handleSaveEdit(data) {
    if (editProduct) updateProduct(editProduct.id, data);
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
                return (
                  <tr key={p.id} style={{ background: i % 2 === 0 ? C.card : C.card2 }}>
                    <td style={tdStyle}>
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
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
                    </td>
                    <td style={{ ...tdStyle, color: C.muted }}>{p.unit}</td>
                    <td style={tdStyle}>{fmt(p.buyPrice)}</td>
                    <td style={tdStyle}>{fmt(p.sellPrice)}</td>
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
            return (
              <Card key={p.id} style={{ padding: '16px' }}>
                {/* Top row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '10px',
                  }}
                >
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
                    <Badge variant="neutral">{p.cat}</Badge>
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
                      </div>
                    }
                  />
                  <MobileStatCell label="Marge" value={<MarginLabel margin={margin} />} />
                  <MobileStatCell label="Prix achat" value={fmt(p.buyPrice)} />
                  <MobileStatCell label="Prix vente" value={fmt(p.sellPrice)} />
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

      {/* Modals */}
      <ProductFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={handleSaveAdd}
        initial={null}
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
              }
            : null
        }
      />
      <AdjustStockModal
        open={!!adjustProduct}
        onClose={() => setAdjustProduct(null)}
        product={adjustProduct}
        onAdjust={adjustStock}
      />
      <DeleteModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        product={deleteTarget}
        onConfirm={deleteProduct}
      />
    </div>
  );
}

// ─── Small helper components ──────────────────────────────────────────────────
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
