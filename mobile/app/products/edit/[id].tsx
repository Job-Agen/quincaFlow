import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Chargement, Notice } from '../../../src/ui';
import { FormulaireProduit } from '../../../src/ui/FormulaireProduit';
import { useResource } from '../../../src/lib/useResource';
import { useSession } from '../../../src/lib/session';
import { api } from '../../../src/lib/api';
import type { Product } from '@/types';

/**
 * Modifier un produit (§9, §10).
 *
 * Cet écran manquait, et son absence coûtait cher : les conditionnements ne se
 * saisissaient qu'à la création. Un produit enregistré sans carton ne pouvait
 * plus jamais s'en voir attribuer depuis le téléphone, et ne se vendait donc
 * qu'à l'unité — alors que c'est en gros que la marchandise part.
 *
 * Le stock ne se corrige pas ici : il a son écran, qui enregistre un mouvement
 * justifié (§26). Le modifier au passage d'une correction de prix ferait entrer
 * des quantités sans trace.
 */
export default function ModifierProduit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isOwner } = useSession();
  const { data, loading, error } = useResource<Product>(id ? `/api/products/${id}` : null);

  if (!isOwner) {
    return (
      <View style={styles.page}>
        <Notice tone="warn">Seul le propriétaire modifie un produit et fixe les prix (§5).</Notice>
      </View>
    );
  }

  if (loading && !data) return <Chargement />;
  if (error) {
    return (
      <View style={styles.page}>
        <Notice tone="error">{error.message}</Notice>
      </View>
    );
  }
  if (!data) return null;

  return (
    <FormulaireProduit
      initial={data}
      libelle="Enregistrer les modifications"
      montrerStock={false}
      onEnvoyer={async (corps) => {
        await api.patch(`/api/products/${id}`, corps);
        router.replace(`/products/${id}`);
      }}
    />
  );
}

const styles = StyleSheet.create({ page: { padding: 16, gap: 12 } });
