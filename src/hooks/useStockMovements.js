import { useState, useCallback } from 'react';
import storage from '../storage';

const STORAGE_KEY = 'qp_stock_movements';

export default function useStockMovements() {
  const [movements, setMovements] = useState(() => storage.get(STORAGE_KEY, []));

  const logMovement = useCallback(({ productId, productName, type, qty, reason, refId }) => {
    const movement = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      productId,
      productName,
      type, // 'entrée' | 'sortie' | 'ajustement'
      qty,
      reason: reason || '',
      refId: refId || null,
    };
    setMovements((prev) => {
      const updated = [movement, ...prev];
      storage.set(STORAGE_KEY, updated);
      return updated;
    });
    return movement;
  }, []);

  return { movements, logMovement };
}
