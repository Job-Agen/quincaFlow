'use client';

import { use } from 'react';
import PurchaseOrderDocument from '@/components/purchases/PurchaseOrderDocument';

/** La route du bon de commande (§43) : elle ne fait que déballer son paramètre. */
export default function PurchaseOrderDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  return <PurchaseOrderDocument id={use(params).id} />;
}
