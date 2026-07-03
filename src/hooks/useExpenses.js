import { useState, useEffect, useCallback } from 'react';
import storage from '../storage';

/**
 * useExpenses
 * Manages expenses stored in localStorage under 'qp_expenses'.
 * Returns { expenses, addExpense, deleteExpense }
 */
export default function useExpenses() {
  const [expenses, setExpenses] = useState(() => storage.get('qp_expenses', []));

  // Keep storage in sync whenever expenses change
  useEffect(() => {
    storage.set('qp_expenses', expenses);
  }, [expenses]);

  const addExpense = useCallback((data) => {
    const newExpense = {
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: data.date,
      cat: data.cat,
      description: data.description || '',
      amount: Number(data.amount),
    };
    setExpenses((prev) => [newExpense, ...prev]);
    return newExpense;
  }, []);

  const deleteExpense = useCallback((id) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { expenses, addExpense, deleteExpense };
}
