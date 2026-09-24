import { requireAuth } from '../../../lib/auth';
import { handle, json, badRequest } from '../../../lib/http';
import { syncSnapshot, syncOperation } from '../../../server/sync';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function privateJson(data) {
  const response = json(data);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export async function GET() {
  return handle(async () => privateJson(await syncSnapshot(await requireAuth())));
}
export async function POST(request) {
  return handle(async () => {
    const session = await requireAuth();
    const raw = await request.text();
    if (raw.length > 1000000) throw badRequest('Opération trop volumineuse.');
    let command;
    try {
      command = JSON.parse(raw);
    } catch {
      throw badRequest('JSON invalide.');
    }
    return privateJson(await syncOperation(session, command));
  });
}
