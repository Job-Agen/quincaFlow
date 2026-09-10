import { handle, json } from '../../../../lib/http';
import { requireAuth } from '../../../../lib/auth';
import { profile } from '../../../../server/accounts';

export async function GET() {
  return handle(async () => json(await profile(await requireAuth())));
}
