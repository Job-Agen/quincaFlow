import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { requireAuth } from '../../../../lib/auth';
import { deleteIncome, updateIncome } from '../../../../server/incomes';

/** Correction et suppression d'une recette hors vente (§42). */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    return json(await updateIncome(await requireAuth(), id, await readBody(request)));
  });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    return json(await deleteIncome(await requireAuth(), id));
  });
}
