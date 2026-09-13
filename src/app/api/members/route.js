import { handle, json, readBody } from '../../../lib/http';
import { requireAuth, requireOwner } from '../../../lib/auth';
import { addSeller, listMembers } from '../../../server/members';

/** Tout le monde voit qui travaille ici ; seul le propriétaire ajoute. */
export async function GET() {
  return handle(async () => json(await listMembers((await requireAuth()).businessId)));
}

export async function POST(request) {
  return handle(async () =>
    json(await addSeller(await requireOwner(), await readBody(request)), 201)
  );
}
