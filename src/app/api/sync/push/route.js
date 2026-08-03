import { NextResponse } from 'next/server';
import { getSessionUser } from '../../../../lib/authServer';
import { getDb, isDbConfigured } from '../../../../lib/db';
import { configForKey } from '../../../../lib/syncConfig';

export async function POST(req) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Base de données non configurée' }, { status: 500 });
  }

  const user = await getSessionUser();
  if (!user || !user.id) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const { key, value } = await req.json();
    const cfg = configForKey(key);
    if (!cfg) {
      return NextResponse.json({ error: 'Clé de synchronisation inconnue' }, { status: 400 });
    }

    const userId = user.id;
    const sql = getDb();
    const table = cfg.table;

    if (cfg.kind === 'object') {
      const dataPayload = JSON.stringify(value || {});
      await sql`
        INSERT INTO settings (user_id, id, data, updated_at)
        VALUES (${userId}, 'default', ${dataPayload}::jsonb, NOW())
        ON CONFLICT (user_id, id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `;
      return NextResponse.json({ ok: true });
    }

    const list = Array.isArray(value) ? value : [];
    const validItems = list.filter((item) => item && item.id != null);
    const validIds = validItems.map((item) => String(item.id));

    // Upsert chaque élément valide
    for (const item of validItems) {
      const itemId = String(item.id);
      const dataPayload = JSON.stringify(item);

      if (table === 'products') {
        await sql`
          INSERT INTO products (user_id, id, data, updated_at)
          VALUES (${userId}, ${itemId}, ${dataPayload}::jsonb, NOW())
          ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `;
      } else if (table === 'contacts') {
        await sql`
          INSERT INTO contacts (user_id, id, data, updated_at)
          VALUES (${userId}, ${itemId}, ${dataPayload}::jsonb, NOW())
          ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `;
      } else if (table === 'sales') {
        await sql`
          INSERT INTO sales (user_id, id, data, updated_at)
          VALUES (${userId}, ${itemId}, ${dataPayload}::jsonb, NOW())
          ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `;
      } else if (table === 'expenses') {
        await sql`
          INSERT INTO expenses (user_id, id, data, updated_at)
          VALUES (${userId}, ${itemId}, ${dataPayload}::jsonb, NOW())
          ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `;
      } else if (table === 'invoices') {
        await sql`
          INSERT INTO invoices (user_id, id, data, updated_at)
          VALUES (${userId}, ${itemId}, ${dataPayload}::jsonb, NOW())
          ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `;
      } else if (table === 'stock_movements') {
        await sql`
          INSERT INTO stock_movements (user_id, id, data, updated_at)
          VALUES (${userId}, ${itemId}, ${dataPayload}::jsonb, NOW())
          ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `;
      } else if (table === 'purchases') {
        await sql`
          INSERT INTO purchases (user_id, id, data, updated_at)
          VALUES (${userId}, ${itemId}, ${dataPayload}::jsonb, NOW())
          ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `;
      } else if (table === 'credit_payments') {
        await sql`
          INSERT INTO credit_payments (user_id, id, data, updated_at)
          VALUES (${userId}, ${itemId}, ${dataPayload}::jsonb, NOW())
          ON CONFLICT (user_id, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
        `;
      }
    }

    // Récupérer les identifiants existants en base et supprimer ceux retirés localement
    let existingRows = [];
    if (table === 'products') existingRows = await sql`SELECT id FROM products WHERE user_id = ${userId}`;
    else if (table === 'contacts') existingRows = await sql`SELECT id FROM contacts WHERE user_id = ${userId}`;
    else if (table === 'sales') existingRows = await sql`SELECT id FROM sales WHERE user_id = ${userId}`;
    else if (table === 'expenses') existingRows = await sql`SELECT id FROM expenses WHERE user_id = ${userId}`;
    else if (table === 'invoices') existingRows = await sql`SELECT id FROM invoices WHERE user_id = ${userId}`;
    else if (table === 'stock_movements') existingRows = await sql`SELECT id FROM stock_movements WHERE user_id = ${userId}`;
    else if (table === 'purchases') existingRows = await sql`SELECT id FROM purchases WHERE user_id = ${userId}`;
    else if (table === 'credit_payments') existingRows = await sql`SELECT id FROM credit_payments WHERE user_id = ${userId}`;

    const currentIds = new Set(validIds);
    const toDelete = existingRows.map((r) => r.id).filter((id) => !currentIds.has(id));

    for (const delId of toDelete) {
      if (table === 'products') await sql`DELETE FROM products WHERE user_id = ${userId} AND id = ${delId}`;
      else if (table === 'contacts') await sql`DELETE FROM contacts WHERE user_id = ${userId} AND id = ${delId}`;
      else if (table === 'sales') await sql`DELETE FROM sales WHERE user_id = ${userId} AND id = ${delId}`;
      else if (table === 'expenses') await sql`DELETE FROM expenses WHERE user_id = ${userId} AND id = ${delId}`;
      else if (table === 'invoices') await sql`DELETE FROM invoices WHERE user_id = ${userId} AND id = ${delId}`;
      else if (table === 'stock_movements') await sql`DELETE FROM stock_movements WHERE user_id = ${userId} AND id = ${delId}`;
      else if (table === 'purchases') await sql`DELETE FROM purchases WHERE user_id = ${userId} AND id = ${delId}`;
      else if (table === 'credit_payments') await sql`DELETE FROM credit_payments WHERE user_id = ${userId} AND id = ${delId}`;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Erreur lors du push' }, { status: 500 });
  }
}
