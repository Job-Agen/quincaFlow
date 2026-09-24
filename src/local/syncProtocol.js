// Deterministic preconditions detect price changes and concurrent form edits.
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function expectedFor(data, action, input) {
  if (action === 'sale' || action === 'purchase')
    return (input.lines || []).map((line) => {
      const p = data.products.find((p) => p.id === line.productId);
      return p
        ? {
            id: p.id,
            retail: p.retail,
            wholesale: p.wholesale,
            cost: p.cost,
            unit: p.unit,
            archived: p.archived,
          }
        : null;
    });
  if (action === 'product.save')
    return input.id ? data.products.find((p) => p.id === input.id) || null : null;
  if (action === 'contact.save')
    return input.id
      ? data[input.kind === 'customer' ? 'customers' : 'suppliers'].find(
          (c) => c.id === input.id
        ) || null
      : null;
  if (action === 'archive') return data[input.collection]?.find((c) => c.id === input.id) || null;
  if (action === 'shop') return data.shop;
  return null;
}
export function assertAllowed(role, action, input) {
  if (role === 'OWNER') return;
  if (
    role === 'SELLER' &&
    (action === 'sale' ||
      (action === 'contact.save' &&
        input.kind === 'customer' &&
        Number(input.openingDebt || 0) === 0))
  )
    return;
  throw Error('Cette opération synchronisée est réservée au propriétaire.');
}
