import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, CardHead, Chargement, Notice } from '../../src/ui';
import { useResource } from '../../src/lib/useResource';
import { useSession } from '../../src/lib/session';
import { api } from '../../src/lib/api';
import { couleurs, rayons } from '../../src/lib/theme';
import { OOS_FLOW, OOS_STATUS_LABELS, flowIndex } from '@/domain/outOfStock';
import { dateTime, money, quantity } from '@/utils/format';
import type { OutOfStockRow, OutOfStockStatus } from '@/types';

/**
 * Suivi d'une vente hors stock (§17).
 *
 * Le workflow avance d'une étape à la fois : sauter de « à récupérer » à
 * « terminé » masquerait qu'aucun paiement n'a été constaté, ni côté client ni
 * côté confrère. Le serveur refuse le saut ; l'écran n'offre donc que l'étape
 * suivante, pour ne pas proposer un geste qui sera rejeté.
 */
export default function SuiviHorsStock() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currency } = useSession();
  const { data, loading, error, reload } = useResource<OutOfStockRow>(
    id ? `/api/out-of-stock-sales/${id}` : null
  );
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  if (loading && !data) return <Chargement />;
  if (error) {
    return (
      <View style={styles.page}>
        <Notice tone="error">{error.message}</Notice>
      </View>
    );
  }
  if (!data) return null;

  const position = flowIndex(data.status);
  const suivante = position >= 0 ? OOS_FLOW[position + 1] : undefined;
  const annulee = data.status === 'CANCELLED';

  async function avancer(etape: OutOfStockStatus) {
    setOccupe(true);
    setSouci(null);
    try {
      await api.patch(`/api/out-of-stock-sales/${id}`, { status: etape });
      reload();
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Étape refusée.');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {souci ? <Notice tone="error">{souci}</Notice> : null}

      <Card>
        <Text style={styles.reference}>{data.reference}</Text>
        <Text style={styles.produit}>{data.product_name}</Text>
        <Text style={styles.sous}>
          {quantity(data.quantity)} × {money(data.selling_price, currency)} ·{' '}
          {dateTime(data.created_at)}
        </Text>
        <Text style={styles.sous}>
          {data.customer_name || 'Client comptoir'}
          {data.other_seller ? ` · récupéré chez ${data.other_seller}` : ''}
        </Text>

        <View style={styles.margeBloc}>
          <View>
            <Text style={styles.margeLibelle}>Marge de l’opération</Text>
            <Text style={styles.sous}>
              {money(data.selling_price, currency)} − {money(data.cost_price, currency)} par unité
            </Text>
          </View>
          <Text style={styles.margeValeur}>{money(data.gross_margin, currency)}</Text>
        </View>
      </Card>

      <Card>
        <CardHead title="Avancement" />
        {annulee ? (
          <Notice tone="warn">Opération annulée.</Notice>
        ) : (
          OOS_FLOW.map((etape, index) => {
            const franchie = index <= position;
            return (
              <View key={etape} style={styles.etape}>
                <View
                  style={[
                    styles.pastille,
                    franchie && { backgroundColor: couleurs.green, borderColor: couleurs.green },
                  ]}
                >
                  {franchie ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Text
                  style={[
                    styles.etapeTexte,
                    franchie && { color: couleurs.ink, fontWeight: '700' },
                  ]}
                >
                  {OOS_STATUS_LABELS[etape]}
                </Text>
              </View>
            );
          })
        )}
      </Card>

      {suivante && !annulee ? (
        <Button onPress={() => avancer(suivante)} busy={occupe}>
          {OOS_STATUS_LABELS[suivante]}
        </Button>
      ) : null}

      {!annulee && data.status !== 'COMPLETED' ? (
        <Button variant="ghost" onPress={() => avancer('CANCELLED')} busy={occupe}>
          Annuler l’opération
        </Button>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 40 },
  reference: { fontSize: 12, fontWeight: '700', color: couleurs.muted },
  produit: { fontSize: 18, fontWeight: '800', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
  margeBloc: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.greenSoft,
  },
  margeLibelle: { fontSize: 13, fontWeight: '700', color: couleurs.ink2 },
  margeValeur: { fontSize: 19, fontWeight: '800', color: couleurs.greenDark },
  etape: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  pastille: {
    width: 22,
    height: 22,
    borderRadius: rayons.full,
    borderWidth: 1.5,
    borderColor: couleurs.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etapeTexte: { fontSize: 14, color: couleurs.muted },
});
