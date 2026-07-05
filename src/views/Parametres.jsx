'use client';

import React, { useRef, useState } from 'react';
import { Download, Upload, Trash2, X, Plus, Save, LogOut } from 'lucide-react';
import useSettings from '../hooks/useSettings';
import { exportAll, importAll, resetAll } from '../utils/backup';
import { COLORS, FONTS } from '../constants/theme';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import { useSession } from '../components/auth/SyncGate';

const APP_VERSION = '0.1.0';

// ── Sub-components ────────────────────────────────────────────────────────────

function Chip({ label, onRemove, removable }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        background: COLORS.card2,
        border: `1px solid ${COLORS.border}`,
        borderRadius: '99px',
        fontSize: '13px',
        color: COLORS.text,
      }}
    >
      {label}
      {removable && (
        <button
          onClick={onRemove}
          title={`Supprimer « ${label} »`}
          aria-label={`Supprimer ${label}`}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: COLORS.muted,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.red)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.muted)}
        >
          <X size={13} />
        </button>
      )}
    </span>
  );
}

function ListEditor({ title, items, onChange, placeholder }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function handleAdd(e) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Veuillez saisir une valeur.');
      return;
    }
    if (items.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      setError('Cette valeur existe déjà.');
      return;
    }
    onChange([...items, trimmed]);
    setValue('');
    setError('');
  }

  function handleRemove(item) {
    if (items.length <= 1) return;
    onChange(items.filter((i) => i !== item));
  }

  return (
    <Card title={title}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
        {items.map((item) => (
          <Chip
            key={item}
            label={item}
            removable={items.length > 1}
            onRemove={() => handleRemove(item)}
          />
        ))}
      </div>
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
          />
        </div>
        <Button type="submit" variant="secondary" size="md">
          <Plus size={15} /> Ajouter
        </Button>
      </form>
      {error && <p style={{ color: COLORS.red, fontSize: '12px', margin: '8px 0 0' }}>{error}</p>}
      {items.length === 1 && (
        <p style={{ color: COLORS.muted, fontSize: '11px', margin: '8px 0 0' }}>
          La dernière valeur ne peut pas être supprimée.
        </p>
      )}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Parametres() {
  const { settings, saveSettings } = useSettings();
  const { user, configured, signOut } = useSession();

  const [storeForm, setStoreForm] = useState({
    storeName: settings.storeName,
    tagline: settings.tagline,
    currency: settings.currency,
  });
  const [savedMsg, setSavedMsg] = useState('');
  const [importError, setImportError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const fileInputRef = useRef(null);

  // ── Boutique ────────────────────────────────────────────────────────────────

  function handleSaveStore(e) {
    e.preventDefault();
    saveSettings({
      storeName: storeForm.storeName.trim() || 'Ma Boutique',
      tagline: storeForm.tagline.trim(),
      currency: storeForm.currency.trim() || 'FCFA',
    });
    setSavedMsg('Informations enregistrées.');
    setTimeout(() => setSavedMsg(''), 3000);
  }

  // ── Données ─────────────────────────────────────────────────────────────────

  function handleExport() {
    const backup = exportAll();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `boutique-sauvegarde-${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setImportError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const result = importAll(parsed);
        if (result.ok) {
          window.location.reload();
        } else {
          setImportError(result.error || "L'import a échoué.");
        }
      } catch {
        setImportError('Le fichier sélectionné n’est pas un JSON valide.');
      }
    };
    reader.onerror = () => setImportError('Impossible de lire le fichier.');
    reader.readAsText(file);
  }

  function handleReset() {
    resetAll();
    window.location.reload();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      {/* ── EN-TÊTE ─────────────────────────────────── */}
      <div style={{ marginBottom: '28px' }}>
        <h1
          style={{
            fontFamily: FONTS.heading,
            fontSize: '28px',
            fontWeight: 800,
            color: COLORS.amber,
            margin: 0,
          }}
        >
          Paramètres
        </h1>
        <p style={{ color: COLORS.muted, fontSize: '13px', margin: '4px 0 0' }}>
          Personnalisation de la boutique et gestion des données
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* ── BOUTIQUE ─────────────────────────────── */}
        <Card title="Boutique">
          <form onSubmit={handleSaveStore}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                marginBottom: '14px',
              }}
            >
              <Input
                label="Nom de la boutique"
                type="text"
                placeholder="Ma Boutique"
                value={storeForm.storeName}
                onChange={(e) => setStoreForm((p) => ({ ...p, storeName: e.target.value }))}
              />
              <Input
                label="Slogan"
                type="text"
                placeholder="Gestion de boutique"
                value={storeForm.tagline}
                onChange={(e) => setStoreForm((p) => ({ ...p, tagline: e.target.value }))}
              />
              <Input
                label="Devise (ex. FCFA, €, MAD)"
                type="text"
                placeholder="FCFA"
                value={storeForm.currency}
                onChange={(e) => setStoreForm((p) => ({ ...p, currency: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Button type="submit" variant="primary" size="md">
                <Save size={15} /> Enregistrer
              </Button>
              {savedMsg && (
                <span style={{ color: COLORS.green, fontSize: '13px' }}>{savedMsg}</span>
              )}
            </div>
          </form>
        </Card>

        {/* ── CATÉGORIES & UNITÉS ──────────────────── */}
        <ListEditor
          title="Catégories produits"
          items={settings.productCategories}
          onChange={(next) => saveSettings({ productCategories: next })}
          placeholder="Nouvelle catégorie produit…"
        />
        <ListEditor
          title="Catégories dépenses"
          items={settings.expenseCategories}
          onChange={(next) => saveSettings({ expenseCategories: next })}
          placeholder="Nouvelle catégorie de dépense…"
        />
        <ListEditor
          title="Unités"
          items={settings.units}
          onChange={(next) => saveSettings({ units: next })}
          placeholder="Nouvelle unité (ex. douzaine)…"
        />

        {/* ── DONNÉES ──────────────────────────────── */}
        <Card title="Données">
          <p style={{ color: COLORS.muted, fontSize: '13px', margin: '0 0 14px' }}>
            Exportez régulièrement vos données pour les mettre en lieu sûr. L’import remplace les
            données actuelles par celles du fichier.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <Button variant="primary" size="md" onClick={handleExport}>
              <Download size={15} /> Exporter (JSON)
            </Button>
            <Button variant="secondary" size="md" onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} /> Importer
            </Button>
            <Button variant="danger" size="md" onClick={() => setConfirmReset(true)}>
              <Trash2 size={15} /> Réinitialiser
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
          {importError && (
            <p style={{ color: COLORS.red, fontSize: '13px', margin: '12px 0 0' }}>{importError}</p>
          )}
        </Card>

        {/* ── COMPTE ───────────────────────────────── */}
        {configured && user && (
          <Card title="Compte">
            <div style={{ fontSize: '13px', color: COLORS.text, lineHeight: 1.7 }}>
              <div style={{ marginBottom: '12px' }}>
                <span style={{ color: COLORS.muted }}>Connecté en tant que : </span>
                {user.email}
              </div>
              <Button variant="ghost" size="md" onClick={signOut}>
                <LogOut size={15} /> Se déconnecter
              </Button>
            </div>
          </Card>
        )}

        {/* ── À PROPOS ─────────────────────────────── */}
        <Card title="À propos">
          <div style={{ fontSize: '13px', color: COLORS.text, lineHeight: 1.7 }}>
            <div>
              <span style={{ color: COLORS.muted }}>Version : </span>
              {APP_VERSION}
            </div>
            <p style={{ color: COLORS.muted, margin: '8px 0 0' }}>
              {configured
                ? 'Vos données sont synchronisées de façon sécurisée sur votre compte Supabase : elles sont sauvegardées dans le cloud et accessibles depuis n’importe quel appareil après connexion. L’export JSON de la section « Données » reste utile comme sauvegarde supplémentaire.'
                : 'Les données sont stockées localement dans ce navigateur (localStorage). Elles ne quittent jamais votre appareil, mais peuvent être perdues si vous videz les données du navigateur. Pensez à faire un export JSON régulier depuis la section « Données » ci-dessus.'}
            </p>
          </div>
        </Card>
      </div>

      {/* ── MODAL RÉINITIALISATION ─────────────────── */}
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Réinitialiser l’application"
      >
        <p style={{ color: COLORS.text, fontSize: '14px', margin: '0 0 8px', maxWidth: '420px' }}>
          Cette action supprimera définitivement <strong>toutes</strong> les données de la boutique
          : produits, ventes, dépenses, contacts, factures, achats, crédits et paramètres.
        </p>
        <p style={{ color: COLORS.red, fontSize: '13px', margin: '0 0 20px' }}>
          Cette action est irréversible. Faites un export avant si nécessaire.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <Button variant="ghost" size="md" onClick={() => setConfirmReset(false)}>
            Annuler
          </Button>
          <Button variant="danger" size="md" onClick={handleReset}>
            <Trash2 size={15} /> Tout supprimer
          </Button>
        </div>
      </Modal>
    </div>
  );
}
