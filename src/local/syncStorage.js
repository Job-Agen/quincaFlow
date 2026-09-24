import { localWrite, STORAGE_KEY } from './storage';
import { today, transact, validateStore } from './ledger';
import { expectedFor, assertAllowed, canonical } from './syncProtocol';
export const ACTIVE_SYNC = 'quincaflow.sync.active.v1';
export const syncKey = (identity) =>
  'quincaflow.sync.v1:' + identity.userId + ':' + identity.businessId;
function same(a, b) {
  return a?.businessId === b?.businessId && a?.userId === b?.userId;
}
export function createSyncRepository({
  storage,
  api,
  onChange = () => {},
  onStatus = () => {},
  online = () => navigator.onLine,
}) {
  let identity = null,
    key = STORAGE_KEY,
    busy = false,
    disposed = false,
    verified = false;
  function cached() {
    const raw = storage.getItem(key);
    if (!raw) return null;
    let envelope;
    try {
      envelope = JSON.parse(raw);
      validateStore(envelope.data);
      validateStore(envelope.base);
      if (!same(envelope, identity) || !Array.isArray(envelope.queue)) throw Error();
    } catch {
      throw Error('Le cache synchronisé est illisible. Exportez-le avant toute récupération.');
    }
    return envelope;
  }
  function put(envelope) {
    try {
      storage.setItem(key, JSON.stringify(envelope));
    } catch {
      throw Error(
        'Sauvegarde locale refusée. Aucune nouvelle saisie n’a été conservée ; exportez vos données et libérez de l’espace.'
      );
    }
    if (!disposed) onChange(envelope.data);
    return envelope.data;
  }
  function status(extra = {}) {
    if (disposed) return;
    const env = identity ? cached() : null;
    onStatus({
      connected: Boolean(identity),
      identity,
      pending: env?.queue.length || 0,
      lastSync: env?.lastSync,
      conflict: env?.conflict,
      ...extra,
    });
  }
  function publish(snapshot, queue) {
    if (!same(snapshot, identity))
      throw Error('La session a changé de boutique. Rechargez la page pour ouvrir le bon carnet.');
    validateStore(snapshot.data);
    const old = cached();
    let data = structuredClone(snapshot.data),
      conflict = null;
    try {
      for (const op of queue) data = transact(data, op.action, op.input, op.id);
    } catch (e) {
      data = old?.data || data;
      conflict = { message: e.message, rejected: false };
    }
    const unchanged =
      old && canonical({ ...old.data, revision: 0 }) === canonical({ ...data, revision: 0 });
    data.revision = unchanged
      ? old.data.revision
      : Math.max(old?.data.revision || 0, data.revision) + 1;
    put({
      ...identity,
      role: snapshot.role,
      base: snapshot.data,
      data,
      queue,
      lastSync: new Date().toISOString(),
      conflict,
    });
    status();
  }
  async function sync() {
    if (busy || disposed) return;
    busy = true;
    try {
      await localWrite(async () => {
        if (disposed) return;
        if (!online()) {
          status({ message: 'Hors ligne : les opérations attendent la connexion.' });
          return;
        }
        status({ syncing: true, message: 'Connexion à votre boutique…' });
        let profile;
        try {
          profile = await api.get('/api/auth/me');
        } catch (e) {
          status({
            requiresLogin: e.status === 401,
            message:
              e.status === 401
                ? 'Connectez-vous pour retrouver et synchroniser votre boutique.'
                : 'Base inaccessible pour le moment. Le carnet reste disponible sur cet appareil.',
          });
          return;
        }
        const nextIdentity = {
          userId: profile.user.id,
          businessId: profile.business.id,
          name: profile.business.name,
        };
        if (identity && verified && !same(identity, nextIdentity)) {
          status({
            requiresReload: true,
            message:
              'Un autre compte est connecté. Rechargez pour ouvrir son carnet ; les opérations en attente restent dans le compte précédent.',
          });
          return;
        }
        if (!identity || !same(identity, nextIdentity)) {
          identity = nextIdentity;
          key = syncKey(identity);
          storage.setItem(ACTIVE_SYNC, JSON.stringify(identity));
          const env = cached();
          if (!disposed) onChange(env?.data || null);
        }
        verified = true;
        let env = cached();
        if (env?.conflict?.rejected) {
          status({ message: env.conflict.message });
          return;
        }
        if (!env?.queue.length) {
          const snapshot = await api.get('/api/sync');
          publish(snapshot, []);
          return;
        }
        for (let i = 0; i < 50; i++) {
          env = cached();
          if (!env.queue.length) break;
          const command = env.queue[0];
          try {
            const result = await api.post('/api/sync', command);
            if (result.ack !== command.id) throw Error('Accusé de réception invalide.');
            publish(result, env.queue.slice(1));
          } catch (e) {
            if ([400, 403, 409, 413].includes(e.status)) {
              put({ ...env, conflict: { message: e.message, rejected: true, id: command.id } });
              status({ message: e.message });
              return;
            }
            throw e;
          }
        }
        status();
      });
    } catch (e) {
      status({ message: e.message, requiresLogin: e.status === 401 });
    } finally {
      busy = false;
    }
  }
  return {
    get key() {
      return key;
    },
    initialize() {
      const active = storage.getItem(ACTIVE_SYNC);
      if (active) {
        try {
          const parsed = JSON.parse(active);
          if (typeof parsed.userId !== 'string' || typeof parsed.businessId !== 'string')
            throw Error();
          identity = parsed;
          key = syncKey(identity);
        } catch {
          throw Error('Identification du cache invalide. Le carnet local est conservé.');
        }
      }
      const data = identity ? cached()?.data : null;
      status();
      return data || null;
    },
    read() {
      if (identity) {
        const env = cached();
        if (!env)
          throw Error(
            'Connectez-vous une première fois pour charger les données de cette boutique.'
          );
        return env.data;
      }
      return null;
    },
    raw() {
      return identity ? storage.getItem(key) : storage.getItem(STORAGE_KEY);
    },
    sync,
    apply(action, input, revision) {
      if (!identity) throw Error('Connectez-vous une première fois pour charger votre boutique.');
      const env = cached();
      if (!env) throw Error('Attendez le chargement de la boutique avant de saisir.');
      if (env.conflict)
        throw Error('Résolvez d’abord le conflit de synchronisation dans la bannière.');
      if (env.data.revision !== revision)
        throw Error('Les données ont été actualisées. Fermez ce formulaire puis recommencez.');
      assertAllowed(env.role, action, input);
      const id = crypto.randomUUID(),
        values = { ...input, date: input.date || today() };
      const command = {
        businessId: identity.businessId,
        userId: identity.userId,
        id,
        action,
        input: values,
        expected: expectedFor(env.data, action, values),
      };
      const data = transact(env.data, action, values, id);
      put({ ...env, data, queue: [...env.queue, command] });
      status();
      setTimeout(() => sync(), 0);
      return data;
    },
    restore() {
      throw Error(
        'L’import d’un carnet complet est désactivé pour ne pas remplacer les données serveur.'
      );
    },
    async discardRejected() {
      await localWrite(async () => {
        const env = cached();
        if (!env?.conflict?.rejected) throw Error('Aucune opération refusée à résoudre.');
        // Never discard an uncertain request. Check the logged-in identity and current server first.
        const profile = await api.get('/api/auth/me');
        if (!same(identity, { userId: profile.user.id, businessId: profile.business.id }))
          throw Error('Reconnectez le compte de cette boutique.');
        const snapshot = await api.get('/api/sync');
        // Discard the rejected operation and its dependent local changes only after explicit confirmation.
        publish(snapshot, []);
      });
    },
    async signOut() {
      await api.post('/api/auth/logout');
      storage.removeItem(ACTIVE_SYNC);
      identity = null;
      key = STORAGE_KEY;
      verified = false;
    },
    dispose() {
      disposed = true;
    },
  };
}
