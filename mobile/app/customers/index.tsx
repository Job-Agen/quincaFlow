import ContactsScreen from '../../src/ui/ContactsScreen';
import Debiteurs from '../../src/ui/Debiteurs';

/** Clients et carnet de crédit (§23, §45). Un vendeur peut en inscrire un au comptoir. */
export default function Clients() {
  return (
    <ContactsScreen
      kind="customers"
      titreAjout="Nouveau client"
      videHint="Un client enregistré se retrouve ensuite sur ses ventes passées."
      // La ligne mène au carnet de crédit du client : c'est la dette qu'on vient
      // consulter, et la fiche se modifie depuis là.
      ficheDe={(client) => `/customers/${client.id}`}
      entete={<Debiteurs />}
    />
  );
}
