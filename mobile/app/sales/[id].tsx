import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chargement, Notice } from '../../src/ui';
import { useResource } from '../../src/lib/useResource';
import { useSession } from '../../src/lib/session';
import { api } from '../../src/lib/api';
import { couleurs, rayons } from '../../src/lib/theme';
import { PAYMENT_METHOD_LABELS } from '@/domain/sale';
import { dateTime, money, withUnit } from '@/utils/format';
import type { Sale } from '@/types';

/**
 * Reçu d'une vente (§15).
 *
 * Le document remis au client porte `invoice_reference` (FA-2026-0001), distinct
 * de la référence d'opération (VE-0001) : confondre les deux obligerait à
 * renuméroter l'un le jour où l'autre change de format (§28).
 *
 * Le partage passe par la feuille du système plutôt que par une impression : au
 * Togo, un reçu se transmet par WhatsApp, et la boutique n'a pas d'imprimante.
 */
export default function Recu() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profil, currency, isOwner } = useSession();
  const { data, loading, error, reload } = useResource<Sale>(id ? `/api/sales/${id}` : null);
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

  const annulee = data.status === 'CANCELLED';
  const reste = Number(data.total) - Number(data.amount_paid);

  /** Le reçu en texte : lisible tel quel dans une conversation WhatsApp. */
  function texteDuRecu(vente: Sale): string {
    const lignes = vente.items.map(
      (article) =>
        `• ${article.product_name} — ${withUnit(article.quantity, article.unit_label)} × ` +
        `${money(article.unit_price, currency)} = ${money(article.line_total, currency)}`
    );
    return [
      profil?.business.name || 'MaQuincaillerie',
      `Reçu ${vente.invoice_reference}`,
      dateTime(vente.created_at),
      vente.customer_name ? `Client : ${vente.customer_name}` : 'Client comptoir',
      '',
      ...lignes,
      '',
      Number(vente.discount) > 0 ? `Remise : ${money(vente.discount, currency)}` : '',
      `TOTAL : ${money(vente.total, currency)}`,
      `Payé : ${money(vente.amount_paid, currency)} (${PAYMENT_METHOD_LABELS[vente.payment_method]})`,
      reste > 0.005 ? `Reste dû : ${money(reste, currency)}` : '',
      '',
      'Merci de votre confiance.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  async function partager() {
    try {
      await Share.share({ message: texteDuRecu(data!) });
    } catch {
      // Un partage refusé ou annulé n'est pas une erreur à signaler.
    }
  }

  function demanderAnnulation() {
    Alert.alert(
      'Annuler cette vente ?',
      'Le stock sera restitué. La vente restera visible dans l’historique, marquée annulée.',
      [
        { text: 'Non', style: 'cancel' },
        { text: 'Annuler la vente', style: 'destructive', onPress: () => void annuler() },
      ]
    );
  }

  async function annuler() {
    setOccupe(true);
    setSouci(null);
    try {
      await api.post(`/api/sales/${id}/cancel`, { reason: 'Annulée depuis le mobile' });
      reload();
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Annulation impossible.');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {souci ? <Notice tone="error">{souci}</Notice> : null}
      {annulee ? (
        <Notice tone="warn">
          Vente annulée. Le stock a été restitué ; elle reste dans l’historique pour que les
          chiffres du jour restent explicables.
        </Notice>
      ) : null}

      <Card style={styles.facture}>
        <View style={styles.entete}>
          <Text style={styles.boutique}>{profil?.business.name}</Text>
          {profil?.business.phone ? <Text style={styles.sous}>{profil.business.phone}</Text> : null}
          {profil?.business.address ? (
            <Text style={styles.sous}>{profil.business.address}</Text>
          ) : null}
        </View>

        <View style={styles.meta}>
          <Text style={styles.reference}>{data.invoice_reference}</Text>
          <Text style={styles.sous}>{dateTime(data.created_at)}</Text>
          <Text style={styles.sous}>{data.customer_name || 'Client comptoir'}</Text>
        </View>

        {data.items.map((article) => (
          <View key={article.id} style={styles.article}>
            <View style={{ flex: 1 }}>
              <Text style={styles.articleNom}>{article.product_name}</Text>
              <Text style={styles.sous}>
                {withUnit(article.quantity, article.unit_label)} ×{' '}
                {money(article.unit_price, currency)}
              </Text>
            </View>
            <Text style={styles.articleTotal}>{money(article.line_total, currency)}</Text>
          </View>
        ))}

        <View style={styles.totaux}>
          <Ligne libelle="Sous-total" valeur={money(data.subtotal, currency)} />
          {Number(data.discount) > 0 ? (
            <Ligne libelle="Remise" valeur={`− ${money(data.discount, currency)}`} />
          ) : null}
          <View style={styles.grandTotal}>
            <Text style={styles.grandTotalLibelle}>Total</Text>
            <Text style={styles.grandTotalValeur}>{money(data.total, currency)}</Text>
          </View>
          <Ligne
            libelle={`Payé · ${PAYMENT_METHOD_LABELS[data.payment_method]}`}
            valeur={money(data.amount_paid, currency)}
          />
          {reste > 0.005 ? (
            <Ligne libelle="Reste dû" valeur={money(reste, currency)} accent={couleurs.red} />
          ) : null}
        </View>

        <Text style={styles.merci}>Merci de votre confiance.</Text>
      </Card>

      <Button onPress={partager}>Partager le reçu</Button>

      {/* Seul le propriétaire annule une vente (§5, §25) : c'est un geste qui
          touche au stock et aux chiffres du jour. */}
      {isOwner && !annulee ? (
        <Button variant="ghost" onPress={demanderAnnulation} busy={occupe}>
          Annuler cette vente
        </Button>
      ) : null}
    </ScrollView>
  );
}

function Ligne({ libelle, valeur, accent }: { libelle: string; valeur: string; accent?: string }) {
  return (
    <View style={styles.ligne}>
      <Text style={styles.ligneLibelle}>{libelle}</Text>
      <Text style={[styles.ligneValeur, accent ? { color: accent } : null]}>{valeur}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 32 },
  facture: { gap: 14 },
  entete: { alignItems: 'center', gap: 2 },
  boutique: { fontSize: 17, fontWeight: '800', color: couleurs.navy },
  meta: {
    gap: 2,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  reference: { fontSize: 15, fontWeight: '800', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
  article: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  articleNom: { fontSize: 14, fontWeight: '600', color: couleurs.ink },
  articleTotal: { fontSize: 14, fontWeight: '800', color: couleurs.ink },
  totaux: {
    gap: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: couleurs.line,
  },
  ligne: { flexDirection: 'row', justifyContent: 'space-between' },
  ligneLibelle: { fontSize: 13, color: couleurs.ink2 },
  ligneValeur: { fontSize: 13, fontWeight: '700', color: couleurs.ink },
  grandTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.blueSoft,
  },
  grandTotalLibelle: { fontSize: 15, fontWeight: '800', color: couleurs.navy },
  grandTotalValeur: { fontSize: 19, fontWeight: '800', color: couleurs.blueDark },
  merci: { fontSize: 12, color: couleurs.muted, textAlign: 'center' },
});
