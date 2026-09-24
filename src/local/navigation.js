export const ROUTES = {
  home: '/',
  sales: '/sales',
  stock: '/products',
  customers: '/customers',
  suppliers: '/suppliers',
  purchases: '/purchases',
  cash: '/cash',
  receipts: '/cash/closing',
  reports: '/reports',
  more: '/more',
  backup: '/backup',
};
export function pageFor(pathname, hash = '') {
  if (pathname.replace(/\/$/, '') === '/local') {
    const old = hash.replace(/^#/, '');
    return old === 'settings' ? 'more' : Object.hasOwn(ROUTES, old) ? old : 'home';
  }
  const path = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  return Object.keys(ROUTES).find((key) => ROUTES[key] === path) || 'detail';
}
export function activeSection(page, pathname = '') {
  if (page === 'receipts') return 'cash';
  if (['home', 'sales', 'stock', 'cash'].includes(page)) return page;
  if (
    pathname.startsWith('/sales/') ||
    pathname.startsWith('/out-of-stock') ||
    pathname === '/history'
  )
    return 'sales';
  if (pathname.startsWith('/products/')) return 'stock';
  return 'more';
}

export function subscribeLocation(callback) {
  for (const event of ['popstate', 'hashchange', 'commerce:navigate'])
    window.addEventListener(event, callback);
  return () => {
    for (const event of ['popstate', 'hashchange', 'commerce:navigate'])
      window.removeEventListener(event, callback);
  };
}
export const browserLocation = () => window.location.pathname + window.location.hash;
