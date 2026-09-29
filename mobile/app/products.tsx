import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { Chargement, Empty, Notice } from '../src/ui';
import { useResource } from '../src/lib/useResource';
import { useSession } from '../src/lib/session';
import { CIBLE_TACTILE, couleurs, rayons } from '../src/lib/theme';
import { money, withUnit } from '@/utils/format';
import type { Product } from '@/types';

/**
 * Produits et stock (§9).
 *
 * La recherche est envoyée au serveur, comme sur le web : filtrer côté téléphone
 * supposerait d'avoir chargé tout le catalogue, ce qu'une quincaillerie de huit
 * cents références ne permet pas sur une connexion de comptoir (§35).
 *
 * `FlatList` plutôt qu'une boucle dans un `ScrollView` : elle ne monte que les
 * lignes visibles, et c'est ce qui garde le défilement fluide sur un téléphone
 * d'entrée de gamme.
 */
export default function Produits() {
  const { currency } = useSession();
  const [recherche, setRecherche] = useState('');
  const { data, loading, error, reload } = useResource<Product[]>('/api/products', {
    search: recherche,
  });

  if (loading && !data) return <Chargement />;

  return (
    <View style={styles.page}>
      <TextInput
        accessibilityLabel="Rechercher un produit"
        placeholder="Nom ou code…"
        placeholderTextColor={couleurs.faint}
        value={recherche}
        onChangeText={setRecherche}
        style={styles.recherche}
      />

      {error ? <Notice tone="error">{error.message}</Notice> : null}

      <FlatList
        data={data || []}
        keyExtractor={(produit) => produit.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        ListEmptyComponent={
          <Empty title="Aucun produit" hint="Élargissez la recherche ou ajoutez une fiche." />
        }
        contentContainerStyle={styles.liste}
        renderItem={({ item }) => {
          const enAlerte = item.stock_quantity <= item.low_stock_threshold;
          return (
            <View style={styles.ligne}>
              <View style={{ flex: 1 }}>
                <Text style={styles.titre}>{item.name}</Text>
                <Text style={[styles.sous, enAlerte && { color: couleurs.red }]}>
                  {item.stock_quantity <= 0
                    ? 'Rupture de stock'
                    : `${withUnit(item.stock_quantity, item.base_unit)} en stock`}
                  {item.sku ? ` · ${item.sku}` : ''}
                </Text>
              </View>
              <Text style={styles.prix}>{money(item.selling_price, currency)}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16, gap: 12 },
  recherche: {
    minHeight: CIBLE_TACTILE,
    borderWidth: 1,
    borderColor: couleurs.line,
    borderRadius: rayons.md,
    backgroundColor: couleurs.surface,
    paddingHorizontal: 12,
    fontSize: 16,
    color: couleurs.ink,
  },
  liste: { backgroundColor: couleurs.surface, borderRadius: rayons.md, overflow: 'hidden' },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: couleurs.line,
  },
  titre: { fontSize: 14, fontWeight: '700', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
  prix: { fontSize: 14, fontWeight: '800', color: couleurs.ink },
});
