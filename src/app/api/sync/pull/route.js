import { NextResponse } from 'next/server';
import { getSessionUser } from '../../../../lib/authServer';
import { getDb, isDbConfigured } from '../../../../lib/db';
import { SYNCED_KEYS } from '../../../../lib/syncConfig';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Base de données non configurée' }, { status: 500 });
  }

  const user = await getSessionUser();
  if (!user || !user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const userId = user.id;
  const sql = getDb();
  const resultData = {};

  try {
    for (const { key, table, kind } of SYNCED_KEYS) {
      if (kind === 'object') {
        const rows = await sql`SELECT data FROM settings WHERE user_id = ${userId} AND id = 'default'`;
        resultData[key] = rows.length > 0 ? rows[0].data : null;
      } else {
        // dynamic SQL query safely executed via template / Neon table queries
        let rows = [];
        if (table === 'products') rows = await sql`SELECT data FROM products WHERE user_id = ${userId}`;
        else if (table === 'contacts') rows = await sql`SELECT data FROM contacts WHERE user_id = ${userId}`;
        else if (table === 'sales') rows = await sql`SELECT data FROM sales WHERE user_id = ${userId}`;
        else if (table === 'expenses') rows = await sql`SELECT data FROM expenses WHERE user_id = ${userId}`;
        else if (table === 'invoices') rows = await sql`SELECT data FROM invoices WHERE user_id = ${userId}`;
        else if (table === 'stock_movements') rows = await sql`SELECT data FROM stock_movements WHERE user_id = ${userId}`;
        else if (table === 'purchases') rows = await sql`SELECT data FROM purchases WHERE user_id = ${userId}`;
        else if (table === 'credit_payments') rows = await sql`SELECT data FROM credit_payments WHERE user_id = ${userId}`;

        resultData[key] = rows.map((r) => r.data);
      }
    }

    return NextResponse.json({ ok: true, data: resultData });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Erreur lors du pull' }, { status: 500 });
  }
}
