import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { requireAuth, requireOwner } from '../../../../lib/auth';
import {
  deletePurchaseOrder,
  getPurchaseOrder,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
} from '../../../../server/purchases';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireAuth();
    const { id } = await params;
    return json(await getPurchaseOrder(session.businessId, id));
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await params;
    return json(await updatePurchaseOrderStatus(session, id, await readBody(request)));
  });
}

/**
 * Réécrit la commande : fournisseur, lignes, observations (§58).
 *
 * PUT et non PATCH : les lignes envoyées remplacent celles qui existaient, et
 * PATCH laisserait croire à une fusion. Le PATCH voisin, lui, ne touche qu'au
 * statut administratif.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await params;
    return json(await updatePurchaseOrder(session, id, await readBody(request)));
  });
}

/** Supprime une commande dont rien ne dépend (§58). Propriétaire seulement. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await params;
    await deletePurchaseOrder(session, id);
    return json({ deleted: true });
  });
}
