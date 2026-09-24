'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Store,
  Home,
  ShoppingCart,
  Package,
  Users,
  Truck,
  Wallet,
  ChartNoAxesCombined,
  Menu,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
  Download,
} from 'lucide-react';
import { COLLECTIONS, validateStore } from './ledger';
import { downloadBackup, localWrite } from './storage';
import { createSyncRepository, ACTIVE_SYNC } from './syncStorage';
import { api } from '@/client/api';
import { Button, Empty, Form, Modal } from './ui';
import { ContactForm, ExpenseForm, PaymentForm, ProductForm, ShopForm, TradeForm } from './forms';
import {
  Cash,
  ContactDetail,
  Contacts,
  Dashboard,
  ProductDetail,
  Products,
  ReceiptView,
  Reports,
  SettingsView,
  TradeDetail,
  Trades,
} from './views';
const NAV = [
  ['home', 'Accueil', Home],
  ['sales', 'Ventes', ShoppingCart],
  ['stock', 'Stock', Package],
  ['customers', 'Clients', Users],
  ['suppliers', 'Fournisseurs', Truck],
  ['purchases', 'Achats', ShoppingCart],
  ['cash', 'Caisse', Wallet],
  ['reports', 'Rapports', ChartNoAxesCombined],
  ['settings', 'Plus', Menu],
];
const TITLES = {
  product: 'Produit',
  customer: 'Client',
  supplier: 'Fournisseur',
  sale: 'Nouvelle vente',
  purchase: 'Nouvel achat fournisseur',
  payment: 'Règlement',
  expense: 'Nouvelle dépense',
  shop: 'Paramètres de la boutique',
  'product-detail': 'Fiche produit',
  'customer-detail': 'Fiche client',
  'supplier-detail': 'Fiche fournisseur',
  'trade-detail': 'Reçu / détail',
  receipt: 'Justificatif',
  'sync-conflict': 'Résoudre la synchronisation',
  archive: 'Supprimer cette fiche',
  restore: 'Restaurer une sauvegarde',
};
export default function LocalApp() {
  const [data, setData] = useState(null),
    [failure, setFailure] = useState(''),
    [page, setPage] = useState('home'),
    [modal, setModal] = useState(null),
    [toasts, setToasts] = useState([]),
    [online, setOnline] = useState(true),
    [offlineReady, setOfflineReady] = useState(false),
    [compact, setCompact] = useState(false),
    [cacheError, setCacheError] = useState(''),
    [syncStatus, setSyncStatus] = useState({ message: 'Vérification de votre connexion…' });
  const repo = useRef(null),
    timers = useRef(new Set());
  const notify = useCallback((message, tone = 'success') => {
    const id = crypto.randomUUID();
    setToasts((rows) => [...rows.slice(-2), { id, message, tone }]);
    const timer = setTimeout(() => {
      setToasts((rows) => rows.filter((row) => row.id !== id));
      timers.current.delete(timer);
    }, 6500);
    timers.current.add(timer);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const timeouts = timers.current;
    function refresh() {
      try {
        const next = repo.current.read();
        if (!cancelled) {
          setData(next);
          setFailure('');
        }
      } catch (e) {
        if (!cancelled) setFailure(e.message);
      }
    }
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        repo.current = createSyncRepository({
          storage: window.localStorage,
          api,
          onChange: (next) => {
            if (!cancelled) {
              setData(next);
              setFailure('');
            }
          },
          onStatus: (next) => {
            if (!cancelled) setSyncStatus(next);
          },
        });
        setData(repo.current.initialize());
        repo.current.sync();
      } catch (e) {
        setFailure(e.message);
      }
      setOnline(navigator.onLine);
      setPage(NAV.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'home');
    });
    function connection() {
      setOnline(navigator.onLine);
      if (navigator.onLine) repo.current?.sync();
    }
    function storage(event) {
      if (event.key === ACTIVE_SYNC) {
        window.location.reload();
        return;
      }
      if (event.key === repo.current?.key || event.key === null) {
        try {
          const before = JSON.parse(event.oldValue || 'null'),
            after = JSON.parse(event.newValue || 'null');
          if (
            before &&
            after &&
            (before.data?.revision ?? before.revision) === (after.data?.revision ?? after.revision)
          )
            return;
        } catch {
          /* Refresh will display a readable cache error. */
        }
        refresh();
        notify('Données actualisées depuis un autre onglet.');
      }
    }
    function hash() {
      setPage(NAV.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'home');
      setModal(null);
    }
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('storage', storage);
    window.addEventListener('hashchange', hash);
    const syncInterval = setInterval(() => repo.current?.sync(), 30000);
    const focus = () => repo.current?.sync();
    window.addEventListener('focus', focus);
    async function prepare() {
      try {
        if (!('serviceWorker' in navigator))
          throw Error('Ce navigateur ne permet pas la préparation hors ligne.');
        await navigator.serviceWorker.register('/sw-local.js', { scope: '/' });
        const registration = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_, reject) => {
            const timer = setTimeout(
              () =>
                reject(
                  Error(
                    'La préparation prend trop de temps. Réouvrez cette page avec une connexion stable.'
                  )
                ),
              30000
            );
            timers.current.add(timer);
          }),
        ]);
        if (cancelled) return;
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          if (!cancelled) setOfflineReady(event.data.ready === true);
          channel.port1.close();
        };
        registration.active?.postMessage({ type: 'STATUS' }, [channel.port2]);
      } catch (e) {
        if (!cancelled) setCacheError(e.message);
      }
    }
    prepare();
    return () => {
      cancelled = true;
      clearInterval(syncInterval);
      window.removeEventListener('focus', focus);
      repo.current?.dispose();
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('storage', storage);
      window.removeEventListener('hashchange', hash);
      for (const timer of timeouts) clearTimeout(timer);
    };
  }, [notify]);
  function navigate(id) {
    window.history.pushState(null, '', '#' + id);
    setPage(id);
    setModal(null);
  }
  function open(type, value = {}) {
    setModal({ type, value, revision: data?.revision });
  }
  async function save(action, input) {
    const next = await localWrite(() => repo.current.apply(action, input, modal?.revision));
    setData(next);
    setModal(null);
    setFailure('');
    notify(
      syncStatus.connected
        ? 'Enregistré sur cet appareil. Synchronisation avec la base en cours ou en attente de réseau.'
        : 'Enregistré sur cet appareil.'
    );
  }
  function backup() {
    try {
      const raw = repo.current?.raw();
      if (!raw && !data) throw Error('Aucune sauvegarde accessible.');
      downloadBackup(raw || JSON.stringify(data));
      notify('Fichier de sauvegarde préparé. Conservez-le dans un endroit sûr.');
    } catch (e) {
      notify(e.message, 'error');
    }
  }
  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 20 * 1024 * 1024) throw Error('Fichier trop volumineux (20 Mo maximum).');
      const raw = await file.text();
      const parsed = validateStore(JSON.parse(raw));
      setModal({ type: 'restore', value: { raw, parsed }, revision: data?.revision });
    } catch (e) {
      notify('Import impossible : ' + e.message, 'error');
    }
  }
  async function restore() {
    const next = await localWrite(() => repo.current.restore(modal.value.raw, modal.revision));
    setData(next);
    setFailure('');
    setModal(null);
    notify('Sauvegarde restaurée sur cet appareil.');
  }
  const shared = { data, open, navigate, notify, synced: syncStatus.connected },
    count = data ? COLLECTIONS.reduce((n, key) => n + data[key].length, 0) : 0;
  const screens = data
    ? {
        home: <Dashboard {...shared} />,
        stock: <Products {...shared} />,
        customers: <Contacts {...shared} kind="customer" />,
        suppliers: <Contacts {...shared} kind="supplier" />,
        sales: <Trades {...shared} />,
        purchases: <Trades {...shared} purchase />,
        cash: <Cash {...shared} />,
        reports: <Reports {...shared} />,
        settings: <SettingsView {...shared} backup={backup} onImport={importFile} />,
      }
    : {};
  function modalContent() {
    const v = modal.value;
    switch (modal.type) {
      case 'sync-conflict':
        return (
          <Form
            label="Abandonner les opérations en attente et recharger la base"
            onSubmit={async () => {
              await repo.current.discardRejected();
              setModal(null);
              notify('Données serveur rechargées.');
            }}
          >
            <p className="local-error">{syncStatus.conflict?.message}</p>
            <p>
              La première opération a été refusée par le serveur. Les {syncStatus.pending}{' '}
              opérations en attente de ce carnet seront retirées de cet appareil. Exportez-les pour
              les vérifier et les ressaisir. Les données déjà enregistrées en base seront
              conservées.
            </p>
            <Button onClick={backup}>Exporter le carnet et les opérations en attente</Button>
          </Form>
        );
      case 'product':
        return <ProductForm product={v.id ? v : null} onSave={save} />;
      case 'customer':
      case 'supplier':
        return <ContactForm kind={modal.type} contact={v.id ? v : null} onSave={save} />;
      case 'sale':
      case 'purchase':
        return (
          <TradeForm
            data={data}
            purchase={modal.type === 'purchase'}
            contactId={v.contactId}
            credit={v.credit}
            onSave={save}
          />
        );
      case 'payment':
        return <PaymentForm {...v} currency={data.shop.currency} onSave={save} />;
      case 'expense':
        return <ExpenseForm onSave={save} />;
      case 'shop':
        return <ShopForm data={data} onSave={save} />;
      case 'product-detail':
        return <ProductDetail product={v} {...shared} />;
      case 'customer-detail':
      case 'supplier-detail':
        return (
          <ContactDetail
            contact={v}
            kind={modal.type === 'customer-detail' ? 'customer' : 'supplier'}
            {...shared}
          />
        );
      case 'trade-detail':
        return <TradeDetail {...v} data={data} />;
      case 'receipt':
        return <ReceiptView receipt={v.receipt} />;
      case 'archive':
        return (
          <Form
            label="Confirmer la suppression"
            onSubmit={() => save('archive', { collection: v.collection, id: v.id })}
          >
            <p>
              Supprimer <strong>{v.name}</strong> du répertoire actif ? Les opérations passées
              restent conservées dans l’historique.
            </p>
            <p className="local-hint">
              Une fiche client ou fournisseur ne peut pas être supprimée tant qu’un solde reste dû.
            </p>
          </Form>
        );
      case 'restore':
        return (
          <Form label="Remplacer mes données locales" onSubmit={restore}>
            <p>
              Importer la boutique <strong>{v.parsed.shop.name}</strong> avec{' '}
              {COLLECTIONS.reduce((n, k) => n + v.parsed[k].length, 0)} enregistrements ?
            </p>
            <p className="local-error">
              Cette opération remplace le carnet actuellement enregistré dans ce navigateur.
            </p>
            <Button tone="soft" onClick={backup}>
              <Download size={18} />
              Exporter le carnet actuel avant remplacement
            </Button>
          </Form>
        );
      default:
        return null;
    }
  }
  return (
    <div className="local-app">
      <aside className="local-sidebar">
        <a className="local-brand" href="/local">
          <Store size={28} />
          <span>
            {data?.shop.name || 'MaQuincaillerie'}
            <small>{syncStatus.connected ? 'BOUTIQUE SYNCHRONISÉE' : 'MON CARNET LOCAL'}</small>
          </span>
        </a>
        <nav aria-label="Navigation principale">
          {NAV.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={21} />
              {label}
            </button>
          ))}
        </nav>
        <div className="local-sidebar-note">
          <CheckCircle2 size={20} />
          <span>
            {syncStatus.connected ? 'Base de données connectée' : 'Carnet sur cet appareil'}
            <small>Disponible hors ligne après chargement</small>
          </span>
        </div>
      </aside>
      <div className="local-shell">
        <header className="local-topbar">
          <Store size={25} />
          <strong>{data?.shop.name || 'MaQuincaillerie'}</strong>
          <span className="local-local-tag">{syncStatus.connected ? 'SYNCHRO' : 'LOCAL'}</span>
        </header>
        <div className={'local-connectivity ' + (compact ? 'compact' : '')}>
          <div>
            {online ? <Wifi size={18} /> : <WifiOff size={18} />}
            <strong>{online ? 'Connecté' : offlineReady ? 'Coupé (OK)' : 'Réseau coupé'}</strong>
            {!compact ? (
              <>
                <span>{count} données locales</span>
                <span className="local-cache-state">
                  {offlineReady
                    ? 'Réouverture hors ligne prête'
                    : cacheError
                      ? 'Hors ligne non préparé'
                      : 'Préparation hors ligne…'}
                </span>
              </>
            ) : null}
          </div>
          <button
            aria-label={
              compact ? 'Développer le statut hors ligne' : 'Réduire le statut hors ligne'
            }
            onClick={() => setCompact((v) => !v)}
          >
            <ChevronDown size={18} style={{ transform: compact ? 'rotate(180deg)' : undefined }} />
          </button>
        </div>
        {cacheError && !compact ? (
          <p className="local-cache-warning">
            Les saisies restent locales. La réouverture sans réseau n’est pas encore disponible :{' '}
            {cacheError}
          </p>
        ) : null}
        <main className="local-main">
          <section
            className="local-sync-panel"
            aria-label="Synchronisation de la boutique"
            aria-live="polite"
          >
            <div>
              <strong>
                {syncStatus.connected ? syncStatus.identity.name : 'Retrouver mes données en base'}
              </strong>
              <p>
                {syncStatus.message ||
                  (syncStatus.pending
                    ? `${syncStatus.pending} opération(s) en attente`
                    : `Synchronisé${syncStatus.lastSync ? ' à ' + new Date(syncStatus.lastSync).toLocaleTimeString('fr-FR') : ''}`)}
              </p>
              {syncStatus.connected ? (
                <small>{syncStatus.pending || 0} opération(s) non synchronisée(s)</small>
              ) : (
                <small>
                  Connectez-vous au compte de votre boutique pour charger ses produits et son
                  historique. Le carnet autonome précédent reste conservé.
                </small>
              )}
            </div>
            <div className="local-sync-actions">
              {syncStatus.connected ? (
                <Button
                  tone="ghost"
                  onClick={async () => {
                    try {
                      await repo.current.signOut();
                      window.location.reload();
                    } catch (e) {
                      notify(e.message, 'error');
                    }
                  }}
                >
                  Se déconnecter
                </Button>
              ) : null}
              {!syncStatus.connected || syncStatus.requiresLogin ? (
                <a className="local-button" href="/login">
                  Se connecter à ma boutique
                </a>
              ) : null}
              {syncStatus.requiresReload ? (
                <Button onClick={() => window.location.reload()}>Ouvrir le compte connecté</Button>
              ) : (
                <Button
                  tone="soft"
                  disabled={syncStatus.syncing}
                  onClick={() => repo.current?.sync()}
                >
                  {syncStatus.syncing ? 'Synchronisation…' : 'Actualiser'}
                </Button>
              )}
              {syncStatus.conflict?.rejected ? (
                <Button tone="danger" onClick={() => open('sync-conflict')}>
                  Résoudre le conflit
                </Button>
              ) : null}
            </div>
          </section>
          {page === 'settings' ? (
            <nav className="local-more-nav" aria-label="Autres rubriques">
              {NAV.filter(([id]) =>
                ['customers', 'suppliers', 'purchases', 'reports'].includes(id)
              ).map(([id, label, Icon]) => (
                <button key={id} onClick={() => navigate(id)}>
                  <Icon size={20} />
                  {label}
                </button>
              ))}
            </nav>
          ) : null}
          {failure ? (
            <div className="local-card">
              <h1>Stockage à vérifier</h1>
              <p className="local-error" role="alert">
                {failure}
              </p>
              <Button onClick={backup}>Exporter les données conservées</Button>
              <label className="local-button soft">
                Restaurer une sauvegarde
                <input
                  className="local-file-hidden"
                  aria-label="Restaurer une sauvegarde"
                  type="file"
                  accept=".json"
                  onChange={importFile}
                />
              </label>
            </div>
          ) : data ? (
            screens[page]
          ) : (
            <Empty>Ouverture de votre carnet local…</Empty>
          )}
        </main>
        <nav className="local-bottom-nav" aria-label="Navigation mobile">
          {NAV.filter(([id]) => ['home', 'sales', 'stock', 'cash', 'settings'].includes(id)).map(
            ([id, label, Icon]) => (
              <button key={id} className={page === id ? 'active' : ''} onClick={() => navigate(id)}>
                <Icon size={21} />
                <span>{label}</span>
              </button>
            )
          )}
        </nav>
      </div>
      {modal ? (
        <Modal
          key={modal.type + (modal.value.id || '')}
          title={TITLES[modal.type]}
          onClose={() => setModal(null)}
        >
          {modalContent()}
        </Modal>
      ) : null}
      <div className="local-toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={'local-toast ' + t.tone}>
            {t.tone === 'error' ? <AlertCircle size={21} /> : <CheckCircle2 size={21} />}
            <span>{t.message}</span>
            <button
              aria-label="Fermer la notification"
              onClick={() => setToasts((rows) => rows.filter((row) => row.id !== t.id))}
            >
              <X size={17} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
