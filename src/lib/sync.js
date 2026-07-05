'use client';

import { getSupabase } from './supabaseClient';
import storage from '../storage';
import { SYNCED_KEYS, configForKey, toRow, fromRow, SETTINGS_ROW_ID } from './syncConfig';

/**
 * Télécharge toutes les données de l'utilisateur depuis Supabase et les écrit
 * dans le localStorage (écriture "silencieuse" : ne redéclenche pas de push).
 * Retourne { ok, error? }.
 */
export async function pullAll(userId) {
  const supabase = getSupabase();
  if (!supabase || !userId) return { ok: false, error: 'not-configured' };

  try {
    for (const { key, table, kind } of SYNCED_KEYS) {
      const { data, error } = await supabase.from(table).select('*').eq('user_id', userId);
      if (error) return { ok: false, error: error.message };

      if (kind === 'object') {
        const row = data && data[0];
        if (row) storage.setSilent(key, fromRow(row));
      } else {
        storage.setSilent(key, (data || []).map(fromRow));
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Pousse la valeur d'une clé localStorage vers sa table Supabase.
 * - array  : upsert de tous les éléments + suppression des lignes disparues.
 * - object : upsert de la ligne unique (settings).
 */
export async function pushKey(key, value, userId) {
  const supabase = getSupabase();
  if (!supabase || !userId) return { ok: false, error: 'not-configured' };

  const cfg = configForKey(key);
  if (!cfg) return { ok: false, error: 'unsynced-key' };

  try {
    if (cfg.kind === 'object') {
      const row = { ...toRow(value || {}), id: SETTINGS_ROW_ID, user_id: userId };
      const { error } = await supabase.from(cfg.table).upsert(row, { onConflict: 'user_id,id' });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    const list = Array.isArray(value) ? value : [];
    const rows = list
      .filter((it) => it && it.id != null)
      .map((it) => ({ ...toRow(it), id: String(it.id), user_id: userId }));

    if (rows.length > 0) {
      const { error: upErr } = await supabase
        .from(cfg.table)
        .upsert(rows, { onConflict: 'user_id,id' });
      if (upErr) return { ok: false, error: upErr.message };
    }

    // Supprime les lignes de l'utilisateur qui ne sont plus dans le tableau.
    const currentIds = new Set(rows.map((r) => r.id));
    const { data: existing, error: selErr } = await supabase
      .from(cfg.table)
      .select('id')
      .eq('user_id', userId);
    if (selErr) return { ok: false, error: selErr.message };

    const toDelete = (existing || []).map((r) => r.id).filter((id) => !currentIds.has(id));
    if (toDelete.length > 0) {
      const { error: delErr } = await supabase
        .from(cfg.table)
        .delete()
        .eq('user_id', userId)
        .in('id', toDelete);
      if (delErr) return { ok: false, error: delErr.message };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Efface toutes les clés qp_* du localStorage (à la déconnexion). */
export function clearLocalData() {
  for (const { key } of SYNCED_KEYS) {
    storage.remove(key);
  }
}
