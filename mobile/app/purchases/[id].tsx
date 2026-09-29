import { useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, CardHead, Chargement, Notice } from '../../src/ui';
import { useResource } from '../../src/lib/useResource';
import { useSession } from '../../src/lib/session';
import { api } from '../../src/lib/api';
import { CIBLE_TACTILE, couleurs, rayons } from '../../src/lib/theme';
import { PO_STATUS_LABELS, remainingOf } from '@/domain/purchase';
import { dateTime, money, quantity, withUnit } from '@/utils/format';
import type { PurchaseOrder, PurchaseOrderStatus } from '@/types';

/**
 * Commande fournisseur et sa réception (§20 à §22).
 *
 * **La livraison partielle est le cas normal**, pas l'exception : le grossiste
 * livre 30 des 50 sacs commandés, et le reste arrive la semaine suivante. Chaque
 * ligne se reçoit donc pour ce qui est réellement arrivé, et le reliquat reste
 * visible jusqu'à la livraison suivante.
 *
 * `remainingOf` vient du domaine partagé : le reste à livrer affiché ici est
 * celui que le serveur vérifiera, et une saisie au-delà sera refusée avec un
 * message métier plutôt qu'une erreur de contrainte.
 */
const SUITES: Partial<Record<PurchaseOrderStatus, PurchaseOrderStatus[]>> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['INVOICE_RECEIVED', 'CANCELLED'],
  INVOICE_RECEIVED: ['PAID', 'CANCELLED'],
  PAID: [],
  PARTIALLY_RECEIVED: [],
};

export default function Commande() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currency } = useSession();
  const { data, loading, error, reload } = useResource<PurchaseOrder>(
    id ? `/api/purchase-orders/${id}` : null
  );

  const [recus, setRecus] = useState<Record<string, string>>({});
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  const aRecevoir = useMemo(
    () =>
      Object.entries(recus)
        .map(([itemId, valeur]) => ({ itemId, quantity: Number(valeur.replace(',', '.')) }))
        .filter((ligne) => Number.isFinite(ligne.quantity) && ligne.quantity > 0),
    [recus]
  );

  if (loading && !data) return <Chargement />;
  if (error) {
    return (
      <View style={styles.page}>
        <Notice tone="error">{error.message}</Notice>
      </View>
    );
  }
  if (!data) return null;

  const close = data.status === 'RECEIVED' || data.status === 'CANCELLED';
  const suites = SUITES[data.status] || [];

  async function avancer(statut: PurchaseOrderStatus) {
    setOccupe(true);
    setSouci(null);
    try {
      await api.patch(`/api/purchase-orders/${id}`, { status: statut });
      reload();
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Changement refusé.');
    } finally {
      setOccupe(false);
    }
  }

  async function recevoir() {
    setOccupe(true);
    setSouci(null);
    setFait(null);
    try {
      await api.post(`/api/purchase-orders/${id}/receive`, { lines: aRecevoir });
      setRecus({});
      setFait('Réception enregistrée. Le stock et le coût moyen ont été mis à jour.');
      reload();
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Réception refusée.');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      {souci ? <Notice tone="error">{souci}</Notice> : null}
      {fait ? <Notice>{fait}</Notice> : null}

      <Card>
        <Text style={styles.reference}>{data.reference}</Text>
        <Text style={styles.fournisseur}>{data.supplier_name || 'Fournisseur non désigné'}</Text>
        <Text style={styles.sous}>{dateTime(data.created_at)}</Text>
        <View style={styles.etatBloc}>
          <Text style={styles.etatTexte}>{PO_STATUS_LABELS[data.status]}</Text>
          <Text style={styles.montant}>{money(data.total_estimated, currency)}</Text>
        </View>
        {data.notes ? <Text style={styles.sous}>{data.notes}</Text> : null}
      </Card>

      <Card>
        <CardHead title="Lignes commandées" />
        {data.items.map((ligne) => {
          const reste = remainingOf(ligne);
          return (
            <View key={ligne.id} style={styles.ligne}>
              <View style={{ flex: 1 }}>
                <Text style={styles.titre}>{ligne.product_name}</Text>
                <Text style={styles.sous}>
                  {withUnit(ligne.quantity_ordered, ligne.unit_label)} ×{' '}
                  {money(ligne.unit_cost, currency)}
                </Text>
                <Text style={[styles.sous, reste > 0 && { color: couleurs.amber }]}>
                  Reçu {quantity(ligne.quantity_received)} / {quantity(ligne.quantity_ordered)}
                  {reste > 0 ? ` · reste ${quantity(reste)}` : ' · complet'}
                </Text>
              </View>

              {!close && reste > 0 ? (
                <TextInput
                  accessibilityLabel={`Quantité reçue — ${ligne.product_name}`}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={couleurs.faint}
                  value={recus[ligne.id] || ''}
                  onChangeText={(valeur) =>
                    setRecus((actuels) => ({ ...actuels, [ligne.id]: valeur }))
                  }
                  style={styles.saisie}
                />
              ) : null}
            </View>
          );
        })}

        {!close ? (
          <Button onPress={recevoir} disabled={aRecevoir.length === 0} busy={occupe}>
            Enregistrer la réception
          </Button>
        ) : null}
        {!close ? (
          <Text style={styles.aide}>
            Saisissez ce qui est réellement arrivé. Le coût moyen du produit sera recalculé à partir
            de ce que vous avez payé, et le reliquat restera visible ici.
          </Text>
        ) : null}
      </Card>

      {data.receipts.length > 0 ? (
        <Card>
          <CardHead title="Réceptions" />
          {data.receipts.map((reception) => (
            <View key={reception.id} style={styles.ligne}>
              <View style={{ flex: 1 }}>
                <Text style={styles.titre}>{reception.reference}</Text>
                <Text style={styles.sous}>{dateTime(reception.received_at)}</Text>
                {reception.notes ? <Text style={styles.sous}>{reception.notes}</Text> : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {suites.length > 0 ? (
        <Card>
          <CardHead title="Avancement" />
          <View style={styles.pastilles}>
            {suites.map((statut) => (
              <Pressable
                key={statut}
                accessibilityRole="button"
                onPress={() => avancer(statut)}
                disabled={occupe}
                style={[styles.pastille, statut === 'CANCELLED' && { borderColor: couleurs.red }]}
              >
                <Text
                  style={[styles.pastilleTexte, statut === 'CANCELLED' && { color: couleurs.red }]}
                >
                  {PO_STATUS_LABELS[statut]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 40 },
  reference: { fontSize: 12, fontWeight: '700', color: couleurs.muted },
  fournisseur: { fontSize: 18, fontWeight: '800', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
  etatBloc: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.surface2,
  },
  etatTexte: { fontSize: 13, fontWeight: '700', color: couleurs.ink2 },
  montant: { fontSize: 15, fontWeight: '800', color: couleurs.ink },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  titre: { fontSize: 14, fontWeight: '700', color: couleurs.ink },
  saisie: {
    width: 74,
    minHeight: CIBLE_TACTILE,
    borderWidth: 1,
    borderColor: couleurs.line,
    borderRadius: rayons.sm,
    paddingHorizontal: 8,
    fontSize: 16,
    textAlign: 'center',
    color: couleurs.ink,
    backgroundColor: couleurs.surface,
  },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pastille: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: rayons.full,
    borderWidth: 1,
    borderColor: couleurs.line,
  },
  pastilleTexte: { fontSize: 13, fontWeight: '700', color: couleurs.ink2 },
  aide: { fontSize: 12, lineHeight: 18, color: couleurs.muted },
});
