import { useState, useCallback } from 'react';
import storage from '../storage';

const STORAGE_KEY = 'qp_credit_payments';

export default function useCredits() {
  const [payments, setPayments] = useState(() => storage.get(STORAGE_KEY, []));

  const addPayment = useCallback(({ contactId, amount, note }) => {
    const payment = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      contactId,
      amount: Number(amount),
      note: note || '',
    };
    setPayments((prev) => {
      const updated = [payment, ...prev];
      storage.set(STORAGE_KEY, updated);
      return updated;
    });
    return payment;
  }, []);

  const deletePayment = useCallback((id) => {
    setPayments((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      storage.set(STORAGE_KEY, updated);
      return updated;
    });
  }, []);

  return { payments, addPayment, deletePayment };
}
