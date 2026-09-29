import { useRouter } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Chargement, Empty, Notice } from '../../src/ui';
import { useResource } from '../../src/lib/useResource';
import { useSession } from '../../src/lib/session';
import { couleurs, rayons } from '../../src/lib/theme';
import { PO_STATUS_LABELS } from '@/domain/purchase';
import { money, shortDate } from '@/utils/format';
import type { PurchaseOrderRow } from '@/types';

/**
 * Commandes fournisseurs (§19).
 *
 * Réservé au propriétaire (§5) : c'est par là que l'argent sort de la boutique.
 * Un vendeur voit l'onglet mais pas son contenu — le masquer complètement
 * laisserait croire à une application amputée.
 */
const TEINTES: Record<string, string> = {
  DRAFT: couleurs.muted,
  SENT: couleurs.blue,
  INVOICE_RECEIVED: couleurs.amber,
  PAID: couleurs.violet,
  PARTIALLY_RECEIVED: couleurs.amber,
  RECEIVED: couleurs.greenDark,
  CANCELLED: couleurs.red,
};

export default function Achats() {
  const router = useRouter();
  const { currency, isOwner } = useSession();
  const { data, loading, error, reload } = useResource<PurchaseOrderRow[]>(
    isOwner ? '/api/purchase-orders' : null
  );

  if (!isOwner) {
    return (
      <View style={styles.page}>
        <Notice tone="warn">
          Seul le propriétaire passe commande chez un fournisseur et enregistre les réceptions.
        </Notice>
      </View>
    );
  }

  if (loading && !data) return <Chargement />;

  return (
    <View style={styles.page}>
      {error ? <Notice tone="error">{error.message}</Notice> : null}

      <FlatList
        data={data || []}
        keyExtractor={(commande) => commande.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        contentContainerStyle={styles.liste}
        ListEmptyComponent={
          <Empty
            title="Aucune commande"
            hint="Préparez une commande pour suivre ce que vous attendez du grossiste."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/purchases/${item.id}`)}
            style={styles.ligne}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.titre}>{item.supplier_name || 'Fournisseur non désigné'}</Text>
              <Text style={styles.sous}>
                {item.reference} · {shortDate(item.created_at)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={styles.montant}>{money(item.total_estimated, currency)}</Text>
              <Text style={[styles.etat, { color: TEINTES[item.status] || couleurs.muted }]}>
                {PO_STATUS_LABELS[item.status]}
              </Text>
            </View>
          </Pressable>
        )}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nouvelle commande"
        onPress={() => router.push('/purchases/new')}
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
  montant: { fontSize: 14, fontWeight: '800', color: couleurs.ink },
  etat: { fontSize: 11, fontWeight: '700' },
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
