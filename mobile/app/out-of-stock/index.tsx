import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chargement, Empty, Notice } from '../../src/ui';
import { useResource } from '../../src/lib/useResource';
import { useSession } from '../../src/lib/session';
import { couleurs, rayons } from '../../src/lib/theme';
import { OOS_STATUS_LABELS } from '@/domain/outOfStock';
import { money, shortDate, quantity } from '@/utils/format';
import type { OutOfStockRow } from '@/types';

/**
 * Ventes hors stock (§16).
 *
 * Le client demande un article que la boutique n'a pas ; on va le chercher chez
 * un confrère et on le revend avec une marge. L'article ne transite jamais par
 * le stock — aucun mouvement n'est écrit (§17), et c'est délibéré : le compter
 * en entrée puis en sortie gonflerait un stock qu'on n'a jamais eu.
 */
export default function HorsStock() {
  const router = useRouter();
  const { currency } = useSession();
  const { data, loading, error, reload } = useResource<OutOfStockRow[]>('/api/out-of-stock-sales');

  if (loading && !data) return <Chargement />;

  return (
    <View style={styles.page}>
      {error ? <Notice tone="error">{error.message}</Notice> : null}

      <FlatList
        data={data || []}
        keyExtractor={(operation) => operation.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        contentContainerStyle={styles.liste}
        ListEmptyComponent={
          <Empty
            title="Aucune opération"
            hint="Quand un client demande un article que vous n’avez pas, notez-le ici."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/out-of-stock/${item.id}`)}
            style={styles.ligne}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.titre}>{item.product_name}</Text>
              <Text style={styles.sous}>
                {quantity(item.quantity)} × {money(item.selling_price, currency)} ·{' '}
                {shortDate(item.created_at)}
              </Text>
              <Text style={styles.sous}>
                {item.customer_name || 'Client comptoir'}
                {item.other_seller ? ` · chez ${item.other_seller}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={styles.marge}>+{money(item.gross_margin, currency)}</Text>
              <Text style={styles.etat}>{OOS_STATUS_LABELS[item.status]}</Text>
            </View>
          </Pressable>
        )}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nouvelle vente hors stock"
        onPress={() => router.push('/out-of-stock/new')}
        style={styles.fab}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16, gap: 12 },
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
  marge: { fontSize: 14, fontWeight: '800', color: couleurs.greenDark },
  etat: { fontSize: 11, fontWeight: '700', color: couleurs.amber },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 56,
    height: 56,
    borderRadius: rayons.full,
    backgroundColor: couleurs.blue,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
