import ContactsScreen from '../src/ui/ContactsScreen';

/** Clients (§23). Un vendeur peut en inscrire un au comptoir. */
export default function Clients() {
  return (
    <ContactsScreen
      kind="customers"
      titreAjout="Nouveau client"
      videHint="Un client enregistré se retrouve ensuite sur ses ventes passées."
    />
  );
}
