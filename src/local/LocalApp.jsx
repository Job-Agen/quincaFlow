'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Store,
  Home,
  ShoppingCart,
  Package,
  Wallet,
  Menu,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronDown,
} from 'lucide-react';
import { MoreMenu } from './MoreMenu';
import Link from 'next/link';
import { ROUTES, pageFor, activeSection, subscribeLocation, browserLocation } from './navigation';
import { DailyReceipts, ClosureForm, ClosureDetail } from './DailyReceipts';
import { COLLECTIONS } from './ledger';
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
  ['cash', 'Caisse', Wallet],
  ['more', 'Plus', Menu],
];
const TITLES = {
  product: 'Produit',
  customer: 'Client',
  supplier: 'Fournisseur',
  sale: 'Nouvelle vente',
  purchase: 'Nouvel achat fournisseur',
  payment: 'Règlement',
  expense: 'Nouvelle dépense',
  'day-close': 'Valider la journée',
  'closure-detail': 'Journée clôturée',
  shop: 'Paramètres de la boutique',
  'product-detail': 'Fiche produit',
  'customer-detail': 'Fiche client',
  'supplier-detail': 'Fiche fournisseur',
  'trade-detail': 'Reçu / détail',
  receipt: 'Justificatif',
  'sync-conflict': 'Résoudre la synchronisation',
  archive: 'Supprimer cette fiche',
};
export default function CommerceApp({ pathname = '/', children }) {
  const [data, setData] = useState(null),
    [failure, setFailure] = useState(''),
    [modal, setModal] = useState(null),
    [toasts, setToasts] = useState([]),
    [online, setOnline] = useState(true),
    [offlineReady, setOfflineReady] = useState(false),
    [compact, setCompact] = useState(false),
    [cacheError, setCacheError] = useState(''),
    [syncStatus, setSyncStatus] = useState({ message: 'Vérification de votre connexion…' });
  const currentLocation = useSyncExternalStore(subscribeLocation, browserLocation, () => '/');
  const [currentPath, currentHash = ''] = currentLocation.split('#');
  const page = pageFor(currentPath, currentHash);
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
      readLocation();
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
    function readLocation() {
      const next = pageFor(location.pathname, location.hash);
      if (location.pathname.replace(/\/$/, '') === '/local')
        window.history.replaceState(null, '', ROUTES[next]);
      window.dispatchEvent(new Event('commerce:navigate'));
      setModal(null);
    }
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('storage', storage);
    window.addEventListener('hashchange', readLocation);
    window.addEventListener('popstate', readLocation);
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
      window.removeEventListener('hashchange', readLocation);
      window.removeEventListener('popstate', readLocation);
      for (const timer of timeouts) clearTimeout(timer);
    };
  }, [notify]);
  useEffect(() => {
    repo.current?.sync();
  }, [pathname]);
  const active = activeSection(page, currentPath);
  function navigate(id) {
    window.history.pushState(null, '', ROUTES[id]);
    window.dispatchEvent(new Event('commerce:navigate'));
    setModal(null);
  }
  async function signOut() {
    try {
      await repo.current.signOut();
      window.location.assign('/login');
    } catch (e) {
      notify(e.message, 'error');
    }
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
  const shared = { data, open, navigate, notify, synced: syncStatus.connected },
    count = data
      ? COLLECTIONS.reduce((n, key) => n + data[key].length, 0) + (data.dailyClosures?.length || 0)
      : 0;
  const screens = data
    ? {
        home: <Dashboard {...shared} />,
        stock: <Products {...shared} />,
        customers: <Contacts {...shared} kind="customer" />,
        suppliers: <Contacts {...shared} kind="supplier" />,
        sales: <Trades {...shared} />,
        purchases: <Trades {...shared} purchase />,
        cash: <Cash {...shared} />,
        receipts: <DailyReceipts {...shared} />,
        reports: <Reports {...shared} />,
        more: <MoreMenu {...shared} role={syncStatus.role} signOut={signOut} />,
        backup: <SettingsView {...shared} backup={backup} />,
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
      case 'day-close':
        return <ClosureForm data={data} date={v.date} onSave={save} />;
      case 'closure-detail':
        return <ClosureDetail data={data} closure={v} />;
      case 'expense':
        return <ExpenseForm date={v.date} onSave={save} />;
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
      default:
        return null;
    }
  }
  return (
    <div
      className="local-app"
      onClick={(event) => {
        const anchor = event.target.closest('a[href]');
        if (!online && anchor) {
          const url = new URL(anchor.href, location.href);
          if (url.origin === location.origin && pageFor(url.pathname) === 'detail') {
            event.preventDefault();
            notify(
              'Cette rubrique nécessite une connexion. Vos ventes, votre caisse et vos données chargées restent disponibles.',
              'error'
            );
          }
        }
      }}
    >
      <aside className="local-sidebar">
        <Link
          className="local-brand"
          href="/"
          prefetch={false}
          onClick={(event) => {
            event.preventDefault();
            navigate('home');
          }}
        >
          <Store size={28} />
          <span>
            {data?.shop.name || 'MaQuincaillerie'}
            <small>GESTION DE VOTRE BOUTIQUE</small>
          </span>
        </Link>
        <nav aria-label="Navigation principale">
          {NAV.map(([id, label, Icon]) => (
            <button
              key={id}
              className={active === id ? 'active' : ''}
              aria-current={active === id ? 'page' : undefined}
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
            {syncStatus.connected ? 'Boutique reliée à la base' : 'Connexion à votre boutique'}
            <small>Disponible hors ligne après chargement</small>
          </span>
        </div>
      </aside>
      <div className="local-shell">
        <header className="local-topbar">
          <Store size={25} />
          <strong>{data?.shop.name || 'MaQuincaillerie'}</strong>
          <span className="local-local-tag">
            {syncStatus.pending ? 'En attente' : 'Ma boutique'}
          </span>
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
          <details
            open={
              !syncStatus.connected ||
              Boolean(syncStatus.conflict || syncStatus.requiresLogin || syncStatus.requiresReload)
            }
            className="local-sync-details"
            aria-label="Synchronisation de la boutique"
            aria-live="polite"
          >
            <summary>
              {syncStatus.pending
                ? `${syncStatus.pending} opération(s) à synchroniser`
                : syncStatus.connected
                  ? 'Sauvegarde et connexion'
                  : 'Se connecter à la boutique'}
            </summary>
            <div className="local-sync-panel">
              <div>
                <strong>
                  {syncStatus.connected
                    ? syncStatus.identity.name
                    : 'Retrouver mes données en base'}
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
                    historique.
                  </small>
                )}
              </div>
              <div className="local-sync-actions">
                {!syncStatus.connected || syncStatus.requiresLogin ? (
                  <a className="local-button" href="/login">
                    Se connecter à ma boutique
                  </a>
                ) : null}
                {syncStatus.requiresReload ? (
                  <Button onClick={() => window.location.reload()}>
                    Ouvrir le compte connecté
                  </Button>
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
            </div>
          </details>
          {['cash', 'receipts'].includes(page) ? (
            <nav className="local-section-tabs" aria-label="Rubriques de la caisse">
              <Button tone={page === 'cash' ? '' : 'soft'} onClick={() => navigate('cash')}>
                Journal de caisse
              </Button>
              <Button tone={page === 'receipts' ? '' : 'soft'} onClick={() => navigate('receipts')}>
                Recettes et clôtures
              </Button>
            </nav>
          ) : null}
          {failure ? (
            <div className="local-card">
              <h1>Stockage à vérifier</h1>
              <p className="local-error" role="alert">
                {failure}
              </p>
              <Button onClick={backup}>Exporter les données conservées</Button>
            </div>
          ) : page === 'detail' ? (
            <div className="local-embedded">{children}</div>
          ) : data ? (
            screens[page]
          ) : (
            <Empty>
              Une première connexion est nécessaire pour charger votre boutique. Ensuite, les
              données chargées restent accessibles en cas de coupure Internet.
            </Empty>
          )}
        </main>
        <nav className="local-bottom-nav" aria-label="Navigation mobile">
          {NAV.map(([id, label, Icon]) => (
            <button key={id} className={active === id ? 'active' : ''} onClick={() => navigate(id)}>
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
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
