'use client';

import ContactsScreen from '@/components/contacts/ContactsScreen';
import DebtorsCard from '@/components/credit/DebtorsCard';

export default function CustomersPage() {
  return (
    <ContactsScreen
      kind="customers"
      title="Clients"
      addLabel="Nouveau client"
      emptyHint="Une fiche client n'est utile que pour ceux qui reviennent ; le comptoir s'en passe."
      // La ligne mène au carnet de crédit du client, non au formulaire : c'est
      // la dette qu'on vient consulter, et la fiche se modifie depuis là (§45).
      hrefFor={(client) => `/customers/${client.id}`}
      header={<DebtorsCard />}
    />
  );
}
