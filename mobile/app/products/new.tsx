import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Notice } from '../../src/ui';
import { FormulaireProduit } from '../../src/ui/FormulaireProduit';
import { api } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import type { Product } from '@/types';

/**
 * Nouveau produit (§9, §10).
 *
 * Le formulaire est partagé avec l'écran de modification : les conditionnements
 * doivent pouvoir se saisir dans les deux cas, et en tenir deux copies, c'est
 * accepter qu'une seule des deux reçoive la prochaine correction.
 */
export default function NouveauProduit() {
  const router = useRouter();
  const { isOwner } = useSession();

  if (!isOwner) {
    return (
      <View style={styles.page}>
        <Notice tone="warn">Seul le propriétaire crée un produit et fixe les prix (§5).</Notice>
      </View>
    );
  }

  return (
    <FormulaireProduit
      libelle="Enregistrer le produit"
      onEnvoyer={async (corps) => {
        const produit = await api.post<Product>('/api/products', corps);
        router.replace(`/products/${produit.id}`);
      }}
    />
  );
}

const styles = StyleSheet.create({ page: { padding: 16, gap: 12 } });
