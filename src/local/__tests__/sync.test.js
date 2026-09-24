import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncRepository, ACTIVE_SYNC, syncKey } from '../syncStorage';
import { emptyStore, transact } from '../ledger';
import { STORAGE_KEY } from '../storage';
const product = {
  name: 'Ciment existant',
  category: 'Quincaillerie',
  retail: 6500,
  wholesale: 6000,
  cost: 4000,
  stock: 10,
  minStock: 3,
  unit: 'sac',
};
function fixture() {
  const map = new Map();
  const storage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
  let state = transact(emptyStore(), 'product.save', product, 'p1'),
    userId = 'u1',
    businessId = 'b1',
    connected = true,
    loseResponse = false,
    refusal = null;
  const received = new Map(),
    posts = [];
  const snapshot = () => ({ data: structuredClone(state), userId, businessId, role: 'OWNER' });
  const api = {
    get: vi.fn(async (path) =>
      path === '/api/auth/me'
        ? { user: { id: userId }, business: { id: businessId, name: 'Boutique A' } }
        : snapshot()
    ),
    post: vi.fn(async (path, op) => {
      if (path.includes('logout')) return {};
      posts.push(op);
      if (refusal) throw Object.assign(Error('Stock insuffisant'), { status: 409 });
      if (!received.has(op.id)) {
        state = transact(state, op.action, op.input, op.id);
        received.set(op.id, true);
      }
      if (loseResponse) {
        loseResponse = false;
        throw Error('Connexion interrompue après commit');
      }
      return { ...snapshot(), ack: op.id };
    }),
  };
  const statuses = [];
  const options = { storage, api, online: () => connected, onStatus: (s) => statuses.push(s) };
  const repo = createSyncRepository(options);
  return {
    repo,
    storage,
    api,
    posts,
    received,
    statuses,
    options,
    get state() {
      return state;
    },
    offline: () => (connected = false),
    online: () => (connected = true),
    lose: () => (loseResponse = true),
    refuse: () => (refusal = true),
    switchUser: () => {
      userId = 'u2';
      businessId = 'b2';
      state = emptyStore();
    },
  };
}
const sale = {
  lines: [{ productId: 'p1', quantity: 2 }],
  method: 'Espèces',
  paid: '',
  date: '2026-09-23',
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe('Persistent synchronization outbox', () => {
  it('loads the account database and preserves the standalone store', async () => {
    const f = fixture();
    const local = JSON.stringify(emptyStore());
    f.storage.setItem(STORAGE_KEY, local);
    f.repo.initialize();
    await f.repo.sync();
    expect(f.repo.read().products[0].name).toBe('Ciment existant');
    expect(f.storage.getItem(STORAGE_KEY)).toBe(local);
    expect(f.storage.getItem(ACTIVE_SYNC)).toContain('b1');
  });
  it('keeps offline operations through a restart and sends them in order', async () => {
    const f = fixture();
    f.repo.initialize();
    await f.repo.sync();
    f.offline();
    f.repo.apply('sale', sale, f.repo.read().revision);
    expect(f.repo.read().products[0].stock).toBe(8);
    expect(f.posts).toHaveLength(0);
    const next = createSyncRepository(f.options);
    expect(next.initialize().products[0].stock).toBe(8);
    f.online();
    await next.sync();
    expect(f.state.products[0].stock).toBe(8);
    expect(JSON.parse(next.raw()).queue).toHaveLength(0);
    expect(f.received.size).toBe(1);
  });
  it('retries the same id after a lost acknowledgement without duplicating the sale', async () => {
    const f = fixture();
    f.repo.initialize();
    await f.repo.sync();
    f.repo.apply('sale', sale, f.repo.read().revision);
    f.lose();
    await f.repo.sync();
    expect(JSON.parse(f.repo.raw()).queue).toHaveLength(1);
    await f.repo.sync();
    expect(f.posts[0].id).toBe(f.posts[1].id);
    expect(f.state.sales).toHaveLength(1);
    expect(JSON.parse(f.repo.raw()).queue).toHaveLength(0);
  });
  it('preserves refused operations and only removes them through explicit resolution', async () => {
    const f = fixture();
    f.repo.initialize();
    await f.repo.sync();
    f.repo.apply('sale', sale, f.repo.read().revision);
    f.refuse();
    await f.repo.sync();
    const saved = JSON.parse(f.repo.raw());
    expect(saved.conflict.rejected).toBe(true);
    expect(saved.queue).toHaveLength(1);
    expect(() => f.repo.apply('sale', sale, f.repo.read().revision)).toThrow(/conflit/);
    await f.repo.discardRejected();
    expect(JSON.parse(f.repo.raw()).queue).toHaveLength(0);
    expect(f.repo.read().products[0].stock).toBe(10);
  });
  it('does not allow discarding a request whose server outcome is uncertain', async () => {
    const f = fixture();
    f.repo.initialize();
    await f.repo.sync();
    f.repo.apply('sale', sale, f.repo.read().revision);
    f.lose();
    await f.repo.sync();
    await expect(f.repo.discardRejected()).rejects.toThrow(/refusée/);
  });
  it('isolates pending operations when a different user logs in', async () => {
    const f = fixture();
    f.repo.initialize();
    await f.repo.sync();
    f.repo.apply('sale', sale, f.repo.read().revision);
    const firstKey = f.repo.key;
    f.switchUser();
    await f.repo.sync();
    expect(f.posts).toHaveLength(0);
    expect(f.statuses.at(-1).requiresReload).toBe(true);
    const next = createSyncRepository(f.options);
    next.initialize();
    await next.sync();
    expect(next.key).toBe(syncKey({ userId: 'u2', businessId: 'b2' }));
    expect(next.read().products).toHaveLength(0);
    expect(JSON.parse(f.storage.getItem(firstKey)).queue).toHaveLength(1);
    expect(f.posts).toHaveLength(0);
  });
  it('does not queue a write that fails to persist locally', async () => {
    const f = fixture();
    f.repo.initialize();
    await f.repo.sync();
    const old = f.repo.raw();
    f.storage.setItem = () => {
      throw Error('Quota');
    };
    expect(() => f.repo.apply('sale', sale, f.repo.read().revision)).toThrow(
      /Sauvegarde locale refusée/
    );
    expect(f.repo.raw()).toBe(old);
    expect(f.posts).toHaveLength(0);
  });
  it('keeps forms valid during an unchanged periodic refresh', async () => {
    const f = fixture();
    f.repo.initialize();
    await f.repo.sync();
    const revision = f.repo.read().revision;
    await f.repo.sync();
    expect(f.repo.read().revision).toBe(revision);
  });
  it('cannot restore a whole file over the account database', async () => {
    const f = fixture();
    f.repo.initialize();
    await f.repo.sync();
    expect(() => f.repo.restore(JSON.stringify(emptyStore()))).toThrow(/désactivé/);
  });
});
