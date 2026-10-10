import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { requireOwner } from '../../../../lib/auth';
import { deleteExpense, updateExpense } from '../../../../server/expenses';

/** Correction et suppression d'une dépense (§39). */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    return json(await updateExpense(await requireOwner(), id, await readBody(request)));
  });
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await context.params;
    return json(await deleteExpense(await requireOwner(), id));
  });
}
