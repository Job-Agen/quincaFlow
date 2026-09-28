import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../lib/http';
import { requireOwner } from '../../../../lib/auth';
import { removeMember, resetMemberPassword } from '../../../../server/members';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    await resetMemberPassword(await requireOwner(), id, await readBody(request));
    return json({ ok: true });
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    await removeMember(await requireOwner(), id);
    return json({ ok: true });
  });
}
