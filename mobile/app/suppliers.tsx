import ContactsScreen from '../src/ui/ContactsScreen';

/**
 * Fournisseurs (§18).
 *
 * Réservé au propriétaire en écriture : c'est avec eux que l'argent sort de la
 * boutique (§5).
 */
export default function Fournisseurs() {
  return (
    <ContactsScreen
      kind="suppliers"
      titreAjout="Nouveau fournisseur"
      avecWhatsapp
      proprietaireSeul
      videHint="Enregistrez vos grossistes pour passer commande plus vite."
    />
  );
}
