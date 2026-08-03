import { NextResponse } from 'next/server';
import { getSessionUser } from '../../../../lib/authServer';
import { isDbConfigured } from '../../../../lib/db';

export async function GET() {
  const configured = isDbConfigured();
  if (!configured) {
    return NextResponse.json({ user: null, configured: false });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ user: null, configured: true });
  }

  return NextResponse.json({ user: { id: user.id, email: user.email }, configured: true });
}
