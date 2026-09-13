import { getSql, one } from '../lib/db';
import { newId } from '../lib/ids';
import { badRequest, notFound } from '../lib/http';
import { str } from '../lib/validate';

/**
 * Clients et fournisseurs (§18, §23).
 *
 * Le client est optionnel sur une vente : obliger le vendeur à créer une fiche
 * pour quelqu'un qui achète trois vis ferait perdre plus de temps que le cahier
 * qu'on remplace. Une vente sans client porte simplement « Client comptoir ».
 */

const TABLES = {
  customers: {
    columns: 'id, name, phone, address, notes, created_at',
    fields: ['name', 'phone', 'address', 'notes'],
    missing: 'Client introuvable.',
  },
  suppliers: {
    columns: 'id, name, phone, whatsapp, address, notes, created_at',
    fields: ['name', 'phone', 'whatsapp', 'address', 'notes'],
    missing: 'Fournisseur introuvable.',
  },
};

/**
 * Le nom de table est interpolé en SQL brut (`sql.unsafe`) : il ne doit donc
 * jamais provenir directement d'un paramètre d'URL. Cette garde ramène toute
 * valeur inattendue à une erreur avant qu'elle n'atteigne la requête.
 */
function specOf(kind) {
  const spec = TABLES[kind];
  if (!spec) throw notFound('Ressource inconnue.');
  return spec;
}

/**
 * Nom du client à porter sur une vente ou une opération hors stock.
 *
 * Un client choisi dans le carnet impose son nom, relu en base : ce que le
 * navigateur envoie n'a pas autorité sur une donnée que la boutique possède
 * déjà. La lecture filtre sur `business_id`, ce qui écarte du même geste le
 * client d'une autre quincaillerie (§29).
 *
 * Sans client désigné, l'opération porte « Client comptoir » : c'est le cas
 * ordinaire, et rien ne justifie d'imposer une fiche pour trois vis.
 */
export async function resolveCustomerName(businessId, customerId, fallback) {
  if (!customerId) {
    return str(fallback, 'client', { required: false }) || 'Client comptoir';
  }
  const row = one(
    await getSql()`
      SELECT name FROM customers WHERE id = ${customerId} AND business_id = ${businessId}
    `
  );
  if (!row) throw badRequest('Client introuvable.');
  return row.name;
}

function readInput(kind, body) {
  const spec = specOf(kind);
  const input = { name: str(body.name, 'nom', { max: 160 }) };
  spec.fields.slice(1).forEach((field) => {
    input[field] = str(body[field], field, {
      required: false,
      max: field === 'notes' ? 1000 : 120,
    });
  });
  return input;
}

export async function listContacts(businessId, kind, { search = '', limit = 200 } = {}) {
  const sql = getSql();
  const spec = specOf(kind);
  const term = search.trim() ? `%${search.trim()}%` : null;
  return sql`
    SELECT ${sql.unsafe(spec.columns)} FROM ${sql.unsafe(kind)}
     WHERE business_id = ${businessId}
       AND (${term}::text IS NULL OR name ILIKE ${term} OR phone ILIKE ${term})
     ORDER BY name
     LIMIT ${Math.min(limit, 500)}
  `;
}

export async function getContact(businessId, kind, id) {
  const sql = getSql();
  const spec = specOf(kind);
  const row = one(
    await sql`
      SELECT ${sql.unsafe(spec.columns)} FROM ${sql.unsafe(kind)}
       WHERE id = ${id} AND business_id = ${businessId}
    `
  );
  if (!row) throw notFound(spec.missing);
  return row;
}

export async function createContact(session, kind, body) {
  const input = readInput(kind, body);
  const id = newId(kind === 'customers' ? 'cus' : 'sup');
  const sql = getSql();

  if (kind === 'customers') {
    await sql`
      INSERT INTO customers (id, business_id, name, phone, address, notes)
      VALUES (${id}, ${session.businessId}, ${input.name}, ${input.phone},
              ${input.address}, ${input.notes})
    `;
  } else {
    await sql`
      INSERT INTO suppliers (id, business_id, name, phone, whatsapp, address, notes)
      VALUES (${id}, ${session.businessId}, ${input.name}, ${input.phone}, ${input.whatsapp},
              ${input.address}, ${input.notes})
    `;
  }

  return getContact(session.businessId, kind, id);
}

export async function updateContact(session, kind, id, body) {
  await getContact(session.businessId, kind, id);
  const input = readInput(kind, body);
  const sql = getSql();

  if (kind === 'customers') {
    await sql`
      UPDATE customers SET name = ${input.name}, phone = ${input.phone},
             address = ${input.address}, notes = ${input.notes}, updated_at = now()
       WHERE id = ${id} AND business_id = ${session.businessId}
    `;
  } else {
    await sql`
      UPDATE suppliers SET name = ${input.name}, phone = ${input.phone},
             whatsapp = ${input.whatsapp}, address = ${input.address},
             notes = ${input.notes}, updated_at = now()
       WHERE id = ${id} AND business_id = ${session.businessId}
    `;
  }

  return getContact(session.businessId, kind, id);
}

/** Commandes passées à un fournisseur (§18). */
export async function supplierOrders(businessId, supplierId, limit = 50) {
  return getSql()`
    SELECT id, reference, status, total_estimated::float8 AS total_estimated, created_at
      FROM purchase_orders
     WHERE business_id = ${businessId} AND supplier_id = ${supplierId}
     ORDER BY created_at DESC
     LIMIT ${limit}
  `;
}
