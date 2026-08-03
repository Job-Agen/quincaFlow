import { NextResponse } from 'next/server';
import { getDb, isDbConfigured } from '../../../../lib/db';
import { hashPassword, createSessionToken, setSessionCookie } from '../../../../lib/authServer';

export async function POST(req) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Neon Postgres non configuré' }, { status: 500 });
  }

  try {
    const { email, password } = await req.json();
    if (!email || !password || password.length < 6) {
      return NextResponse.json(
        { error: 'Renseignez un e-mail valide et un mot de passe d’au moins 6 caractères.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const sql = getDb();
    const existing = await sql`SELECT id FROM users WHERE email = ${cleanEmail}`;
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Cet e-mail est déjà utilisé.' }, { status: 400 });
    }

    const hash = await hashPassword(password);
    const rows = await sql`
      INSERT INTO users (email, password_hash)
      VALUES (${cleanEmail}, ${hash})
      RETURNING id, email
    `;

    const user = rows[0];
    const token = await createSessionToken(user);
    await setSessionCookie(token);

    return NextResponse.json({ user: { id: user.id, email: user.email } });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Erreur lors de l’inscription' }, { status: 500 });
  }
}
