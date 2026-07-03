import { useState, useCallback } from 'react';
import storage from '../storage';

function generateId() {
  return `sale_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useSales() {
  const [sales, setSales] = useState(() => storage.get('qp_sales', []));

  const addSale = useCallback((saleData) => {
    const newSale = {
      ...saleData,
      id: saleData.id || generateId(),
      date: saleData.date || new Date().toISOString(),
    };
    setSales((prev) => {
      const updated = [newSale, ...prev];
      storage.set('qp_sales', updated);
      return updated;
    });
    return newSale;
  }, []);

  const deleteSale = useCallback((id) => {
    setSales((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      storage.set('qp_sales', updated);
      return updated;
    });
  }, []);

  return { sales, addSale, deleteSale };
}

export default useSales;
