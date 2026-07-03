import { useState, useCallback } from 'react';
import storage from '../storage';

const STORAGE_KEY = 'qp_purchases';

export default function usePurchases() {
  const [purchases, setPurchases] = useState(() => storage.get(STORAGE_KEY, []));

  const save = useCallback((updater) => {
    setPurchases((prev) => {
      const updated = typeof updater === 'function' ? updater(prev) : updater;
      storage.set(STORAGE_KEY, updated);
      return updated;
    });
  }, []);

  const addPurchase = useCallback(
    (data) => {
      const newPurchase = {
        supplierName: '',
        supplierId: null,
        items: [],
        total: 0,
        ...data,
        id: crypto.randomUUID(),
        date: data.date || new Date().toISOString(),
        status: data.status || 'commandé',
        receivedAt: null,
      };
      save((prev) => [newPurchase, ...prev]);
      return newPurchase;
    },
    [save]
  );

  const receivePurchase = useCallback(
    (id) => {
      save((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: 'reçu', receivedAt: new Date().toISOString() } : p
        )
      );
    },
    [save]
  );

  const deletePurchase = useCallback(
    (id) => {
      save((prev) => prev.filter((p) => p.id !== id));
    },
    [save]
  );

  return { purchases, addPurchase, receivePurchase, deletePurchase };
}
