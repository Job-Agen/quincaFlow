import type { NextRequest } from 'next/server';
import { handle, json, readBody } from '../../../../../lib/http';
import { requireOwner } from '../../../../../lib/auth';
import { attachDocument } from '../../../../../server/purchases';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireOwner();
    const { id } = await params;
    return json(await attachDocument(session, id, await readBody(request)), 201);
  });
}
