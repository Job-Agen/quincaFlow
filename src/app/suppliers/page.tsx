'use client';

import ContactsScreen from '@/components/contacts/ContactsScreen';

export default function SuppliersPage() {
  return (
    <ContactsScreen
      kind="suppliers"
      title="Fournisseurs"
      addLabel="Nouveau fournisseur"
      withWhatsapp
      ownerOnly
      emptyHint="Ajoutez vos fournisseurs pour leur passer commande depuis QuincaFlow."
    />
  );
}
