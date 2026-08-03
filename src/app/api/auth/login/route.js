import { NextResponse } from 'next/server';
import { getDb, isDbConfigured } from '../../../../lib/db';
import { verifyPassword, createSessionToken, setSessionCookie } from '../../../../lib/authServer';

export async function POST(req) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Neon Postgres non configuré' }, { status: 500 });
  }

  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Renseignez un e-mail et un mot de passe.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const sql = getDb();
    const rows = await sql`SELECT id, email, password_hash FROM users WHERE email = ${cleanEmail}`;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'E-mail ou mot de passe incorrect.' }, { status: 401 });
    }

    const user = rows[0];
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'E-mail ou mot de passe incorrect.' }, { status: 401 });
    }

    const token = await createSessionToken({ id: user.id, email: user.email });
    await setSessionCookie(token);

    return NextResponse.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Erreur lors de la connexion' }, { status: 500 });
  }
}
