import { useState, useEffect } from 'react';
import storage from '../storage';

const STORAGE_KEY = 'qp_products';

export default function useProducts() {
  const [products, setProducts] = useState(() => storage.get(STORAGE_KEY, []));

  // Persist whenever products change
  useEffect(() => {
    storage.set(STORAGE_KEY, products);
  }, [products]);

  function addProduct(data) {
    const newProduct = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setProducts((prev) => [...prev, newProduct]);
    return newProduct;
  }

  function updateProduct(id, data) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)));
  }

  function deleteProduct(id) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  function adjustStock(id, delta) {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const newQty = Math.max(0, (p.qty || 0) + delta);
        return { ...p, qty: newQty };
      })
    );
  }

  return { products, addProduct, updateProduct, deleteProduct, adjustStock };
}
