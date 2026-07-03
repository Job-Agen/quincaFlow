import { useState, useEffect, useCallback } from 'react';
import storage from '../storage';

export default function useInvoices() {
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    setInvoices(storage.get('qp_invoices', []));
  }, []);

  const save = useCallback((arr) => {
    setInvoices(arr);
    storage.set('qp_invoices', arr);
  }, []);

  const nextInvoiceNumber = useCallback(() => {
    const year = new Date().getFullYear();
    const existing = invoices.filter((i) => i.number && i.number.startsWith(`FAC-${year}-`));
    const max = existing.reduce((acc, i) => {
      const parts = i.number.split('-');
      const n = parseInt(parts[2], 10);
      return n > acc ? n : acc;
    }, 0);
    return `FAC-${year}-${String(max + 1).padStart(4, '0')}`;
  }, [invoices]);

  const addInvoice = useCallback(
    (data) => {
      const newInvoice = {
        ...data,
        id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        number: nextInvoiceNumber(),
        status: 'en attente',
        amountPaid: data.amountPaid ?? 0,
        createdAt: new Date().toISOString(),
      };
      const updated = [newInvoice, ...invoices];
      save(updated);
      return newInvoice;
    },
    [invoices, nextInvoiceNumber, save]
  );

  const updateInvoice = useCallback(
    (id, data) => {
      const updated = invoices.map((inv) => (inv.id === id ? { ...inv, ...data } : inv));
      save(updated);
    },
    [invoices, save]
  );

  const deleteInvoice = useCallback(
    (id) => {
      const updated = invoices.filter((inv) => inv.id !== id);
      save(updated);
    },
    [invoices, save]
  );

  const markPaid = useCallback(
    (id) => {
      const updated = invoices.map((inv) =>
        inv.id === id ? { ...inv, status: 'payée', amountPaid: inv.total } : inv
      );
      save(updated);
    },
    [invoices, save]
  );

  return { invoices, addInvoice, updateInvoice, deleteInvoice, markPaid, nextInvoiceNumber };
}
