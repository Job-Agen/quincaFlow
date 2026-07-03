'use client';

import { useEffect } from 'react';
import storage from '../../storage';

export default function SeedData() {
  useEffect(() => {
    if (storage.get('qp_products', []).length !== 0) return;

    const now = new Date();
    const daysAgo = (n) => new Date(now - n * 86400000).toISOString();

    const products = [
      {
        id: crypto.randomUUID(),
        name: 'Ciment Portland 50kg',
        cat: 'Ciment',
        buyPrice: 4800,
        sellPrice: 6000,
        qty: 120,
        unit: 'sac',
        minQty: 20,
        createdAt: daysAgo(10),
      },
      {
        id: crypto.randomUUID(),
        name: 'Fer à béton 12mm',
        cat: 'Ferronnerie',
        buyPrice: 12000,
        sellPrice: 15500,
        qty: 45,
        unit: 'barre',
        minQty: 10,
        createdAt: daysAgo(10),
      },
      {
        id: crypto.randomUUID(),
        name: 'Parpaing creux 20cm',
        cat: 'Briques & Parpaings',
        buyPrice: 450,
        sellPrice: 600,
        qty: 800,
        unit: 'unité',
        minQty: 100,
        createdAt: daysAgo(9),
      },
      {
        id: crypto.randomUUID(),
        name: 'Tuyau PVC 110mm',
        cat: 'Tuyaux & Plomberie',
        buyPrice: 3500,
        sellPrice: 4800,
        qty: 30,
        unit: 'm',
        minQty: 10,
        createdAt: daysAgo(8),
      },
      {
        id: crypto.randomUUID(),
        name: 'Carrelage 60x60',
        cat: 'Carrelage',
        buyPrice: 8500,
        sellPrice: 11000,
        qty: 60,
        unit: 'm²',
        minQty: 15,
        createdAt: daysAgo(7),
      },
      {
        id: crypto.randomUUID(),
        name: 'Peinture acrylique 25L',
        cat: 'Peinture',
        buyPrice: 22000,
        sellPrice: 28500,
        qty: 18,
        unit: 'bidon',
        minQty: 5,
        createdAt: daysAgo(5),
      },
      {
        id: crypto.randomUUID(),
        name: 'Sable fin',
        cat: 'Granulats',
        buyPrice: 15000,
        sellPrice: 20000,
        qty: 8,
        unit: 'm³',
        minQty: 5,
        createdAt: daysAgo(4),
      },
      {
        id: crypto.randomUUID(),
        name: 'Gravier concassé',
        cat: 'Granulats',
        buyPrice: 18000,
        sellPrice: 24000,
        qty: 3,
        unit: 'm³',
        minQty: 5,
        createdAt: daysAgo(3),
      },
    ];
    storage.set('qp_products', products);

    const clientId1 = crypto.randomUUID();
    const clientId2 = crypto.randomUUID();
    const contacts = [
      {
        id: clientId1,
        name: 'Amadou Diallo',
        phone: '77 123 45 67',
        address: 'Rue 12, Médina, Dakar',
        type: 'client',
        creditBalance: 45000,
      },
      {
        id: clientId2,
        name: 'Fatou Sow',
        phone: '78 987 65 43',
        address: 'HLM Grand Yoff, Dakar',
        type: 'client',
        creditBalance: 0,
      },
      {
        id: crypto.randomUUID(),
        name: 'Matériaux Dakar SA',
        phone: '33 821 00 11',
        address: 'Zone Industrielle, Dakar',
        type: 'fournisseur',
        creditBalance: 0,
      },
    ];
    storage.set('qp_contacts', contacts);

    const makeDateTime = (daysBack, hour) => {
      const d = new Date(now);
      d.setDate(d.getDate() - daysBack);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };

    const sales = [
      {
        id: crypto.randomUUID(),
        date: makeDateTime(0, 9),
        items: [{ name: 'Ciment Portland 50kg', qty: 10, unitPrice: 6000 }],
        total: 60000,
        clientName: 'Amadou Diallo',
        payment: 'crédit',
      },
      {
        id: crypto.randomUUID(),
        date: makeDateTime(0, 14),
        items: [
          { name: 'Fer à béton 12mm', qty: 5, unitPrice: 15500 },
          { name: 'Parpaing creux 20cm', qty: 100, unitPrice: 600 },
        ],
        total: 137500,
        clientName: 'Fatou Sow',
        payment: 'cash',
      },
      {
        id: crypto.randomUUID(),
        date: makeDateTime(1, 10),
        items: [{ name: 'Carrelage 60x60', qty: 15, unitPrice: 11000 }],
        total: 165000,
        clientName: 'Client anonyme',
        payment: 'mobile money',
      },
      {
        id: crypto.randomUUID(),
        date: makeDateTime(2, 16),
        items: [
          { name: 'Tuyau PVC 110mm', qty: 10, unitPrice: 4800 },
          { name: 'Peinture acrylique 25L', qty: 2, unitPrice: 28500 },
        ],
        total: 105000,
        clientName: 'Amadou Diallo',
        payment: 'cash',
      },
    ];
    storage.set('qp_sales', sales);

    const expenses = [
      {
        id: crypto.randomUUID(),
        date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
        cat: 'Loyer',
        description: 'Loyer boutique mensuel',
        amount: 150000,
      },
      {
        id: crypto.randomUUID(),
        date: daysAgo(3).slice(0, 10),
        cat: 'Transport',
        description: 'Livraison marchandises',
        amount: 25000,
      },
      {
        id: crypto.randomUUID(),
        date: daysAgo(5).slice(0, 10),
        cat: 'Salaires',
        description: 'Salaire vendeur',
        amount: 200000,
      },
    ];
    storage.set('qp_expenses', expenses);
    storage.set('qp_invoices', []);
  }, []);

  return null;
}
