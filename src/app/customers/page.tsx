'use client';

import ContactsScreen from '@/components/contacts/ContactsScreen';

export default function CustomersPage() {
  return (
    <ContactsScreen
      kind="customers"
      title="Clients"
      addLabel="Nouveau client"
      emptyHint="Une fiche client n'est utile que pour ceux qui reviennent ; le comptoir s'en passe."
    />
  );
}
