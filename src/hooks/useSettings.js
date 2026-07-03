import { useState, useCallback } from 'react';
import storage from '../storage';
import {
  DEFAULT_PRODUCT_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_UNITS,
} from '../constants/categories';
import { setCurrency } from '../utils/formatCurrency';

const STORAGE_KEY = 'qp_settings';

export const DEFAULT_SETTINGS = {
  storeName: 'Ma Boutique',
  tagline: 'Gestion de boutique',
  currency: 'FCFA',
  productCategories: DEFAULT_PRODUCT_CATEGORIES,
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES,
  units: DEFAULT_UNITS,
};

export default function useSettings() {
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    ...storage.get(STORAGE_KEY, {}),
  }));

  const saveSettings = useCallback((partial) => {
    setSettings((prev) => {
      const updated = { ...prev, ...partial };
      storage.set(STORAGE_KEY, updated);
      if (partial.currency) setCurrency(partial.currency);
      return updated;
    });
  }, []);

  return { settings, saveSettings, DEFAULT_SETTINGS };
}
