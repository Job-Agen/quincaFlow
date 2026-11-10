'use client';

import { use } from 'react';
import AppBar from '@/components/layout/AppBar';
import { Notice, Skeleton } from '@/components/ui';
import PurchaseOrderForm from '@/components/purchases/PurchaseOrderForm';
import { useResource } from '@/client/useResource';
import type { PurchaseOrder } from '@/types';

/**
 * Modifier une commande fournisseur (§58).
 *
 * Le formulaire n'est monté qu'une fois la commande chargée : construit sur des
 * lignes vides puis rempli après coup, il écraserait la saisie en cours du
 * gérant au moment où la réponse arrive.
 */
export default function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error } = useResource<PurchaseOrder>(`/api/purchase-orders/${id}`);

  if (data) return <PurchaseOrderForm initial={data} />;

  return (
    <>
      <AppBar back={`/purchases/${id}`} title="Modifier la commande" />
      <main className="page">
        {error ? <Notice tone="error">{error.message}</Notice> : null}
        {loading ? <Skeleton count={3} height={96} /> : null}
      </main>
    </>
  );
}
