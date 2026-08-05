'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Truck,
  Plus,
  Trash2,
  PackageCheck,
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react';

import usePurchases from '../hooks/usePurchases';
import useProducts from '../hooks/useProducts';
import useContacts from '../hooks/useContacts';
import useSettings from '../hooks/useSettings';
import useStockMovements from '../hooks/useStockMovements';
import { normalizePackagings, weightedAverageCost } from '../utils/packaging';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Badge from '../components/ui/Badge';
import { fmt } from '../utils/formatCurrency';
import { formatDate } from '../utils/dateHelpers';

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

function currentMonthPrefix() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ─── Modal : nouvelle commande ────────────────────────────────────────────────
function NewPurchaseModal({ open, onClose, suppliers, products, settings, onSave }) {
  const [supplierId, setSupplierId] = useState('');
  const [freeName, setFreeName] = useState('');
  const [lines, setLines] = useState([]);
  const [error, setError] = useState('');

  // Éditeur de ligne
  const [lineMode, setLineMode] = useState('existant'); // 'existant' | 'nouveau'
  const [lineProductId, setLineProductId] = useState('');
  const [lineName, setLineName] = useState('');
  const [lineCat, setLineCat] = useState('');
  const [lineUnit, setLineUnit] = useState('');
  const [lineSellPrice, setLineSellPrice] = useState('');
  const [lineQty, setLineQty] = useState('');
  const [lineCost, setLineCost] = useState('');
  const [linePackagingId, setLinePackagingId] = useState('');

  const categories = settings.productCategories || [];
  const units = settings.units || [];

  useEffect(() => {
    if (open) {
      setSupplierId('');
      setFreeName('');
      setLines([]);
      setError('');
      resetLineEditor('existant');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function resetLineEditor(mode) {
    setLineMode(mode);
    setLineProductId('');
    setLineName('');
    setLineCat(categories[0] || '');
    setLineUnit(units[0] || '');
    setLineSellPrice('');
    setLineQty('');
    setLineCost('');
  }

  const selectedProduct = products.find((p) => p.id === lineProductId) || null;
  const selectedPackagings = selectedProduct ? normalizePackagings(selectedProduct) : [];
  const linePackaging = selectedPackagings.find((pk) => pk.id === linePackagingId) || null;

  function handleProductSelect(e) {
    const id = e.target.value;
    setLineProductId(id);
    const product = products.find((p) => p.id === id);
    if (product) {
      setLineCost(String(product.buyPrice || ''));
      // On propose l'unité de base : c'est dans cette unité qu'est le coût connu.
      const base = normalizePackagings(product)[0];
      setLinePackagingId(base ? base.id : '');
    }
  }

  function handleAddLine() {
    const qty = parseFloat(lineQty);
    const unitCost = parseFloat(lineCost);
    if (!qty || qty <= 0) {
      setError('Veuillez saisir une quantité valide (> 0).');
      return;
    }
    if (isNaN(unitCost) || unitCost < 0) {
      setError('Veuillez saisir un coût unitaire valide.');
      return;
    }
    if (lineMode === 'existant') {
      const product = products.find((p) => p.id === lineProductId);
      if (!product) {
        setError('Veuillez sélectionner un produit.');
        return;
      }
      const pk = normalizePackagings(product).find((x) => x.id === linePackagingId);
      const size = pk ? pk.size : 1;
      setLines((prev) => [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          qty,
          unitCost,
          packagingLabel: pk ? pk.label : product.unit || 'unité',
          packagingSize: size,
          // Unités de base réellement entrées en stock à la réception.
          baseUnits: qty * size,
        },
      ]);
    } else {
      const name = lineName.trim();
      if (!name) {
        setError('Veuillez saisir le nom du nouveau produit.');
        return;
      }
      setLines((prev) => [
        ...prev,
        {
          productId: null,
          name,
          qty,
          unitCost,
          newProduct: {
            cat: lineCat || categories[0] || 'Autres',
            unit: lineUnit || units[0] || 'pièce',
            sellPrice: parseFloat(lineSellPrice) || 0,
          },
        },
      ]);
    }
    setError('');
    resetLineEditor(lineMode);
  }

  function removeLine(index) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0),
    [lines]
  );

  function handleSubmit() {
    const selected = suppliers.find((s) => s.id === supplierId);
    const supplierName = selected ? selected.name : freeName.trim();
    if (!supplierName) {
      setError('Veuillez sélectionner ou saisir un fournisseur.');
      return;
    }
    if (lines.length === 0) {
      setError('Ajoutez au moins une ligne d’article.');
      return;
    }
    onSave({
      supplierName,
      supplierId: selected ? selected.id : null,
      items: lines,
      total,
    });
    onClose();
  }

  const supplierOptions = [
    { value: '', label: '— Saisie libre —' },
    ...suppliers.map((s) => ({ value: s.id, label: s.name })),
  ];
  const productOptions = [
    { value: '', label: '— Choisir un produit —' },
    ...products.map((p) => ({ value: p.id, label: p.name })),
  ];

  const modeBtn = (mode, label) => (
    <button
      type="button"
      onClick={() => resetLineEditor(mode)}
      style={{
        flex: 1,
        padding: '7px 10px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        background: lineMode === mode ? 'rgba(245,166,35,0.15)' : 'transparent',
        color: lineMode === mode ? C.amber : C.muted,
        border: `1px solid ${lineMode === mode ? C.amber : C.border}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle commande fournisseur">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
        {/* Fournisseur */}
        <Select
          label="Fournisseur"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          options={supplierOptions}
        />
        {!supplierId && (
          <Input
            label="Nom du fournisseur (saisie libre)"
            value={freeName}
            onChange={(e) => setFreeName(e.target.value)}
            placeholder="ex: Grossiste Central"
          />
        )}

        {/* Éditeur de ligne */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: '10px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: C.muted,
            }}
          >
            Ajouter un article
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {modeBtn('existant', 'Produit existant')}
            {modeBtn('nouveau', 'Nouveau produit')}
          </div>

          {lineMode === 'existant' ? (
            <Select
              label="Produit"
              value={lineProductId}
              onChange={handleProductSelect}
              options={productOptions}
            />
          ) : (
            <>
              <Input
                label="Nom du produit"
                value={lineName}
                onChange={(e) => setLineName(e.target.value)}
                placeholder="ex: Sucre en morceaux 1kg"
              />
              <div className="responsive-grid cols-2" style={{ gap: '10px' }}>
                <Select
                  label="Catégorie"
                  value={lineCat}
                  onChange={(e) => setLineCat(e.target.value)}
                  options={categories}
                />
                <Select
                  label="Unité"
                  value={lineUnit}
                  onChange={(e) => setLineUnit(e.target.value)}
                  options={units}
                />
              </div>
              <Input
                label="Prix de vente"
                type="number"
                min="0"
                value={lineSellPrice}
                onChange={(e) => setLineSellPrice(e.target.value)}
                placeholder="0"
              />
            </>
          )}

          {lineMode === 'existant' && selectedPackagings.length > 1 && (
            <Select
              label="Conditionnement acheté"
              value={linePackagingId}
              onChange={(e) => setLinePackagingId(e.target.value)}
              options={selectedPackagings.map((pk) => ({
                value: pk.id,
                label: pk.size > 1 ? `${pk.label} (${pk.size})` : pk.label,
              }))}
            />
          )}

          <div className="responsive-grid cols-2" style={{ gap: '10px' }}>
            <Input
              label={`Quantité${linePackaging && linePackaging.size > 1 ? ` (en ${linePackaging.label}s)` : ''}`}
              type="number"
              min="0"
              value={lineQty}
              onChange={(e) => setLineQty(e.target.value)}
              placeholder="0"
            />
            <Input
              label={`Coût${linePackaging && linePackaging.size > 1 ? ` du ${linePackaging.label}` : ' unitaire'}`}
              type="number"
              min="0"
              value={lineCost}
              onChange={(e) => setLineCost(e.target.value)}
              placeholder="0"
            />
          </div>

          {linePackaging && linePackaging.size > 1 && parseFloat(lineQty) > 0 && (
            <div style={{ fontSize: '12px', color: C.green }}>
              entrée en stock : <strong>{parseFloat(lineQty) * linePackaging.size}</strong>{' '}
              {selectedProduct ? selectedProduct.unit || 'unité' : 'unité'}
              {parseFloat(lineCost) > 0 && (
                <>
                  {' — soit '}
                  <strong>
                    {(parseFloat(lineCost) / linePackaging.size).toLocaleString('fr-FR', {
                      maximumFractionDigits: 2,
                    })}
                  </strong>{' '}
                  l&apos;unité
                </>
              )}
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={handleAddLine}
            style={{ alignSelf: 'flex-end' }}
          >
            <Plus size={14} /> Ajouter la ligne
          </Button>
        </div>

        {/* Lignes ajoutées */}
        {lines.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {lines.map((l, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  background: C.card,
                  border: `1px solid ${C.border}`,
                  borderRadius: '8px',
                  fontSize: '13px',
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ flex: 1, color: C.text, fontWeight: 600, minWidth: '100px' }}>
                  {l.name}
                  {!l.productId && (
                    <Badge variant="info" style={{ marginLeft: '6px' }}>
                      nouveau
                    </Badge>
                  )}
                </span>
                <span style={{ color: C.muted, whiteSpace: 'nowrap' }}>
                  {l.qty} × {fmt(l.unitCost)}
                </span>
                <span style={{ color: C.amber, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {fmt(l.qty * l.unitCost)}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  title="Retirer la ligne"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: C.red,
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 10px',
                fontSize: '14px',
                fontWeight: 700,
                color: C.text,
              }}
            >
              <span>Total de la commande</span>
              <span style={{ color: C.amber }}>{fmt(total)}</span>
            </div>
          </div>
        )}

        {error && <p style={{ color: C.red, fontSize: '13px', margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <Button variant="ghost" type="button" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" type="button" onClick={handleSubmit}>
            Enregistrer la commande
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal : confirmation de suppression ──────────────────────────────────────
function DeletePurchaseModal({ purchase, onClose, onConfirm }) {
  if (!purchase) return null;
  return (
    <Modal open={!!purchase} onClose={onClose} title="Confirmer la suppression">
      <div style={{ color: C.text, marginBottom: '20px', lineHeight: 1.6 }}>
        Supprimer la commande de{' '}
        <strong style={{ color: C.amber }}>{purchase.supplierName}</strong> du{' '}
        {formatDate(purchase.date)} ({fmt(purchase.total)}) ?
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
            onConfirm(purchase.id);
            onClose();
          }}
        >
          <Trash2 size={14} /> Supprimer
        </Button>
      </div>
    </Modal>
  );
}

// ─── Carte KPI ────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, color }) {
  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
      <div
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '10px',
          background: 'rgba(245,166,35,0.08)',
          border: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '12px', color: C.muted, marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: color || C.text }}>{value}</div>
      </div>
    </Card>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Achats() {
  const { purchases, addPurchase, receivePurchase, deletePurchase } = usePurchases();
  const { products, addProduct, updateProduct, adjustStock } = useProducts();
  const { contacts } = useContacts();
  const { settings } = useSettings();
  const { logMovement } = useStockMovements();

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const suppliers = useMemo(
    () => contacts.filter((c) => c.type === 'fournisseur'),
    [contacts]
  );

  const sorted = useMemo(
    () => [...purchases].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [purchases]
  );

  const monthPrefix = currentMonthPrefix();
  const totalMonth = useMemo(
    () =>
      purchases
        .filter(
          (p) => p.status === 'reçu' && (p.receivedAt || p.date || '').startsWith(monthPrefix)
        )
        .reduce((sum, p) => sum + (p.total || 0), 0),
    [purchases, monthPrefix]
  );
  const pendingCount = useMemo(
    () => purchases.filter((p) => p.status === 'commandé').length,
    [purchases]
  );

  function handleSave(data) {
    addPurchase(data);
    setNotice('Commande enregistrée — en attente de réception.');
  }

  function handleReceive(purchase) {
    receivePurchase(purchase.id);
    purchase.items.forEach((item) => {
      const existing = item.productId ? products.find((p) => p.id === item.productId) : null;
      let productId = item.productId;
      // Les unités de base entrant réellement en stock : un carton de 40 en
      // apporte 40, pas 1. Les anciennes commandes n'ont pas ce champ.
      const size = item.packagingSize || 1;
      const baseUnits = item.baseUnits != null ? item.baseUnits : item.qty * size;
      const costPerBaseUnit = size > 0 ? item.unitCost / size : item.unitCost;

      if (existing) {
        adjustStock(existing.id, +baseUnits);
        // Coût moyen pondéré : réassortir à un autre prix ne doit pas écraser
        // la valeur du stock déjà détenu, sinon les marges sautent à chaque achat.
        updateProduct(existing.id, {
          buyPrice: weightedAverageCost(
            existing.qty || 0,
            existing.buyPrice || 0,
            baseUnits,
            costPerBaseUnit
          ),
        });
      } else {
        const np = item.newProduct || {};
        const created = addProduct({
          name: item.name,
          cat: np.cat || settings.productCategories[0] || 'Autres',
          unit: np.unit || settings.units[0] || 'pièce',
          sellPrice: np.sellPrice || costPerBaseUnit,
          buyPrice: costPerBaseUnit,
          qty: baseUnits,
          minQty: 5,
        });
        productId = created.id;
      }
      logMovement({
        productId,
        productName: item.name,
        type: 'entrée',
        qty: +baseUnits,
        reason:
          size > 1
            ? `Réception achat (${item.qty} ${item.packagingLabel}) — ${purchase.supplierName}`
            : 'Réception achat — ' + purchase.supplierName,
        refId: purchase.id,
      });
    });
    setNotice('Commande de ' + purchase.supplierName + ' réceptionnée — stock mis à jour.');
  }

  return (
    <div className="page-container">
      {/* En-tête */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Truck size={28} color={C.amber} />
          <div>
            <h1
              style={{
                margin: 0,
                fontFamily: 'Syne, sans-serif',
                fontWeight: 800,
                fontSize: '28px',
                color: C.amber,
              }}
            >
              Achats fournisseurs
            </h1>
            <p style={{ color: C.muted, fontSize: '13px', margin: '4px 0 0' }}>
              Commandes et réceptions de marchandises
            </p>
          </div>
        </div>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Nouvelle commande
        </Button>
      </div>

      {/* Message de confirmation */}
      {notice && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(46,170,107,0.12)',
            border: '1px solid rgba(46,170,107,0.35)',
            borderRadius: '10px',
            padding: '10px 14px',
            color: C.green,
            fontSize: '14px',
            marginBottom: '20px',
          }}
        >
          <CheckCircle2 size={16} /> {notice}
        </div>
      )}

      {/* KPI */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <KpiCard
          icon={<PackageCheck size={20} color={C.green} />}
          label="Achats reçus ce mois"
          value={fmt(totalMonth)}
          color={C.green}
        />
        <KpiCard
          icon={<Clock size={20} color={pendingCount > 0 ? C.amber : C.muted} />}
          label="Commandes en attente"
          value={`${pendingCount} commande${pendingCount !== 1 ? 's' : ''}`}
          color={pendingCount > 0 ? C.amber : C.muted}
        />
      </div>

      {/* Liste des commandes */}
      {sorted.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '48px 20px' }}>
          <Truck size={40} color={C.muted} style={{ marginBottom: '12px' }} />
          <p style={{ color: C.muted, margin: 0, fontSize: '15px' }}>
            Aucune commande fournisseur.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {sorted.map((p) => {
            const isExpanded = expandedId === p.id;
            const isPending = p.status === 'commandé';
            return (
              <Card key={p.id} style={{ padding: 0, overflow: 'hidden' }}>
                {/* Ligne principale */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '14px 16px',
                    cursor: 'pointer',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: '1 1 160px', minWidth: '140px' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: C.text }}>
                      {p.supplierName}
                    </div>
                    <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>
                      {formatDate(p.date)} · {p.items.length} article
                      {p.items.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <span
                    style={{
                      fontWeight: 700,
                      color: C.amber,
                      fontSize: '15px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fmt(p.total)}
                  </span>
                  <Badge variant={isPending ? 'warning' : 'success'}>
                    {isPending ? 'Commandé' : 'Reçu'}
                  </Badge>
                  <div
                    style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isPending && (
                      <>
                        <Button variant="green" size="sm" onClick={() => handleReceive(p)}>
                          <PackageCheck size={14} /> Réceptionner
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(p)}>
                          <Trash2 size={13} /> Supprimer
                        </Button>
                      </>
                    )}
                  </div>
                  <span style={{ color: C.muted, display: 'flex', alignItems: 'center' }}>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </div>

                {/* Détail des articles */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: `1px solid ${C.border}`,
                      background: C.card2,
                      padding: '12px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    {p.items.map((item, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          fontSize: '13px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ flex: 1, color: C.text, minWidth: '100px' }}>
                          {item.name}
                          {!item.productId && (
                            <Badge variant="info" style={{ marginLeft: '6px' }}>
                              nouveau
                            </Badge>
                          )}
                        </span>
                        <span style={{ color: C.muted, whiteSpace: 'nowrap' }}>
                          {item.qty} × {fmt(item.unitCost)}
                        </span>
                        <span
                          style={{ color: C.text, fontWeight: 600, whiteSpace: 'nowrap' }}
                        >
                          {fmt(item.qty * item.unitCost)}
                        </span>
                      </div>
                    ))}
                    {p.receivedAt && (
                      <div style={{ fontSize: '12px', color: C.green, marginTop: '4px' }}>
                        Réceptionnée le {formatDate(p.receivedAt)}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modales */}
      <NewPurchaseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        suppliers={suppliers}
        products={products}
        settings={settings}
        onSave={handleSave}
      />
      <DeletePurchaseModal
        purchase={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deletePurchase}
      />
    </div>
  );
}
