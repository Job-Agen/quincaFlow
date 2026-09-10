'use client';

import { useRouter } from 'next/navigation';
import AppBar from '@/components/layout/AppBar';
import ProductForm from '@/components/products/ProductForm';
import { api } from '@/client/api';
import { useSession } from '@/client/session';

export default function NewProductPage() {
  const router = useRouter();
  const { currency } = useSession();

  return (
    <>
      <AppBar back="/products" title="Nouveau produit" />
      <main className="page">
        <ProductForm
          currency={currency}
          submitLabel="Créer le produit"
          onSubmit={async (body) => {
            const product = await api.post('/api/products', body);
            router.replace(`/products/${product.id}`);
          }}
        />
      </main>
    </>
  );
}
