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
        name: 'Riz parfumé 25kg',
        cat: 'Alimentation',
        buyPrice: 15000,
        sellPrice: 18500,
        qty: 40,
        unit: 'sac',
        minQty: 10,
        createdAt: daysAgo(10),
      },
      {
        id: crypto.randomUUID(),
        name: 'Huile végétale 5L',
        cat: 'Alimentation',
        buyPrice: 5500,
        sellPrice: 7000,
        qty: 25,
        unit: 'bidon',
        minQty: 8,
        createdAt: daysAgo(10),
      },
      {
        id: crypto.randomUUID(),
        name: 'Lait en poudre 400g',
        cat: 'Alimentation',
        buyPrice: 2200,
        sellPrice: 3000,
        qty: 60,
        unit: 'unité',
        minQty: 15,
        createdAt: daysAgo(9),
      },
      {
        id: crypto.randomUUID(),
        name: 'Pack eau minérale 1,5L x6',
        cat: 'Boissons',
        buyPrice: 1500,
        sellPrice: 2000,
        qty: 50,
        unit: 'paquet',
        minQty: 12,
        createdAt: daysAgo(8),
      },
      {
        id: crypto.randomUUID(),
        name: 'Savon de ménage x12',
        cat: 'Hygiène & Entretien',
        buyPrice: 3000,
        sellPrice: 4200,
        qty: 20,
        unit: 'carton',
        minQty: 5,
        createdAt: daysAgo(7),
      },
      {
        id: crypto.randomUUID(),
        name: 'Eau de javel 1L',
        cat: 'Hygiène & Entretien',
        buyPrice: 500,
        sellPrice: 800,
        qty: 35,
        unit: 'litre',
        minQty: 10,
        createdAt: daysAgo(5),
      },
      {
        id: crypto.randomUUID(),
        name: 'Cahier 200 pages',
        cat: 'Papeterie',
        buyPrice: 400,
        sellPrice: 650,
        qty: 8,
        unit: 'unité',
        minQty: 20,
        createdAt: daysAgo(4),
      },
      {
        id: crypto.randomUUID(),
        name: 'Pile AA (paire)',
        cat: 'Électronique',
        buyPrice: 350,
        sellPrice: 600,
        qty: 4,
        unit: 'paquet',
        minQty: 10,
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
        creditBalance: 37000,
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
        name: 'Grossiste Alimentaire Dakar',
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
        items: [
          { name: 'Riz parfumé 25kg', qty: 2, unitPrice: 18500 },
        ],
        total: 37000,
        clientName: 'Amadou Diallo',
        payment: 'crédit',
        contactId: clientId1,
      },
      {
        id: crypto.randomUUID(),
        date: makeDateTime(0, 14),
        items: [
          { name: 'Huile végétale 5L', qty: 1, unitPrice: 7000 },
          { name: 'Savon de ménage x12', qty: 2, unitPrice: 4200 },
        ],
        total: 15400,
        clientName: 'Fatou Sow',
        payment: 'cash',
      },
      {
        id: crypto.randomUUID(),
        date: makeDateTime(1, 10),
        items: [
          { name: 'Pack eau minérale 1,5L x6', qty: 5, unitPrice: 2000 },
          { name: 'Lait en poudre 400g', qty: 3, unitPrice: 3000 },
        ],
        total: 19000,
        clientName: 'Client anonyme',
        payment: 'mobile money',
      },
      {
        id: crypto.randomUUID(),
        date: makeDateTime(2, 16),
        items: [
          { name: 'Cahier 200 pages', qty: 10, unitPrice: 650 },
          { name: 'Pile AA (paire)', qty: 4, unitPrice: 600 },
          { name: 'Eau de javel 1L', qty: 2, unitPrice: 800 },
        ],
        total: 10500,
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
        description: 'Livraison marchandises grossiste',
        amount: 15000,
      },
      {
        id: crypto.randomUUID(),
        date: daysAgo(5).slice(0, 10),
        cat: 'Salaires',
        description: 'Salaire vendeur',
        amount: 100000,
      },
    ];
    storage.set('qp_expenses', expenses);
    storage.set('qp_invoices', []);
  }, []);

  return null;
}
