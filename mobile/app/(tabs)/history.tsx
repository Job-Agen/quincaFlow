import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, Chargement, Empty, Notice } from '../../src/ui';
import { useResource } from '../../src/lib/useResource';
import { useSession } from '../../src/lib/session';
import { couleurs, rayons } from '../../src/lib/theme';
import { dayLabel, money, time } from '@/utils/format';
import { OOS_STATUS_LABELS } from '@/domain/outOfStock';
import { PO_STATUS_LABELS } from '@/domain/purchase';
import type { HistoryEntry, HistoryKind, OutOfStockStatus, PurchaseOrderStatus } from '@/types';

/**
 * Historique unifié (§24).
 *
 * Le commerçant ne raisonne pas par table : il cherche « ce qui s'est passé
 * mardi ». Ventes, ventes hors stock, commandes et réceptions arrivent donc dans
 * un même flux groupé par jour, comme sur le web.
 */

const PERIODES = [
  { valeur: 'today', libelle: "Aujourd'hui" },
  { valeur: '7d', libelle: '7 jours' },
  { valeur: '30d', libelle: '30 jours' },
  { valeur: 'all', libelle: 'Tout' },
];

const NATURES = [
  { valeur: '', libelle: 'Tout' },
  { valeur: 'SALE', libelle: 'Ventes' },
  { valeur: 'OUT_OF_STOCK', libelle: 'Hors stock' },
  { valeur: 'PURCHASE_ORDER', libelle: 'Commandes' },
];

const MOTS: Record<HistoryKind, string> = {
  SALE: 'Vente',
  OUT_OF_STOCK: 'Hors stock',
  PURCHASE_ORDER: 'Commande',
  RECEIPT: 'Réception',
};

/** Le statut se lit différemment selon la nature : chaque flux a le sien. */
function statut(entree: HistoryEntry): { texte: string; couleur: string } {
  if (entree.kind === 'SALE') {
    if (entree.status === 'CANCELLED') return { texte: 'Annulée', couleur: couleurs.red };
    if (entree.payment_status === 'PAID') return { texte: 'Payée', couleur: couleurs.greenDark };
    if (entree.payment_status === 'PARTIAL') return { texte: 'Partielle', couleur: couleurs.amber };
    return { texte: 'Impayée', couleur: couleurs.amber };
  }
  if (entree.kind === 'OUT_OF_STOCK') {
    const mot = OOS_STATUS_LABELS[entree.status as OutOfStockStatus] || entree.status;
    return {
      texte: mot,
      couleur: entree.status === 'COMPLETED' ? couleurs.greenDark : couleurs.amber,
    };
  }
  if (entree.kind === 'PURCHASE_ORDER') {
    return {
      texte: PO_STATUS_LABELS[entree.status as PurchaseOrderStatus] || entree.status,
      couleur: couleurs.muted,
    };
  }
  return { texte: 'Reçue', couleur: couleurs.greenDark };
}

/** Filtre en pastilles : plus lisible que six onglets sur un écran de 360 px. */
function Filtre<T extends string>({
  options,
  valeur,
  onChange,
}: {
  options: readonly { valeur: T; libelle: string }[];
  valeur: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pastilles}
    >
      {options.map((option) => (
        <Pressable
          key={option.valeur}
          accessibilityRole="button"
          accessibilityState={{ selected: option.valeur === valeur }}
          onPress={() => onChange(option.valeur)}
          style={[styles.pastille, option.valeur === valeur && styles.pastilleActive]}
        >
          <Text style={[styles.pastilleTexte, option.valeur === valeur && { color: '#fff' }]}>
            {option.libelle}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export default function Historique() {
  const router = useRouter();
  const { currency } = useSession();
  const [periode, setPeriode] = useState('7d');
  const [nature, setNature] = useState('');

  const { data, loading, error, reload } = useResource<HistoryEntry[]>('/api/history', {
    period: periode,
    kind: nature,
  });

  // Le regroupement par jour est fait ici : le serveur rend un flux trié, et
  // découper à l'affichage évite une requête par journée montrée.
  const jours = useMemo(() => {
    const groupes: { libelle: string; entrees: HistoryEntry[] }[] = [];
    (data || []).forEach((entree) => {
      const libelle = dayLabel(entree.created_at);
      const dernier = groupes[groupes.length - 1];
      if (dernier && dernier.libelle === libelle) dernier.entrees.push(entree);
      else groupes.push({ libelle, entrees: [entree] });
    });
    return groupes;
  }, [data]);

  if (loading && !data) return <Chargement />;

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
    >
      <Filtre options={PERIODES} valeur={periode} onChange={setPeriode} />
      <Filtre options={NATURES} valeur={nature} onChange={setNature} />

      {error ? <Notice tone="error">{error.message}</Notice> : null}

      {data && data.length === 0 ? (
        <Card>
          <Empty title="Aucune opération" hint="Élargissez la période ou changez de filtre." />
        </Card>
      ) : null}

      {jours.map((jour) => (
        <Card key={jour.libelle}>
          <Text style={styles.jour}>{jour.libelle}</Text>
          {jour.entrees.map((entree) => {
            const etat = statut(entree);
            // Seules une vente et une opération hors stock ouvrent un écran ; une
            // réception n'en a pas, et une ligne qui ne mène nulle part ne doit
            // pas se présenter comme cliquable.
            const cible =
              entree.kind === 'SALE'
                ? `/sales/${entree.id}`
                : entree.kind === 'OUT_OF_STOCK'
                  ? `/out-of-stock/${entree.id}`
                  : entree.kind === 'PURCHASE_ORDER'
                    ? `/purchases/${entree.id}`
                    : null;

            const contenu = (
              <>
                <View style={{ flex: 1 }}>
                  <Text style={styles.titre}>
                    {MOTS[entree.kind]} {entree.reference}
                  </Text>
                  <Text style={styles.sous}>
                    {time(entree.created_at)}
                    {entree.party ? ` · ${entree.party}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.montant}>{money(entree.amount, currency)}</Text>
                  <Text style={[styles.etat, { color: etat.couleur }]}>{etat.texte}</Text>
                </View>
              </>
            );

            const cle = `${entree.kind}-${entree.id}`;
            return cible ? (
              <Pressable
                key={cle}
                accessibilityRole="button"
                onPress={() => router.push(cible as never)}
                style={styles.ligne}
              >
                {contenu}
              </Pressable>
            ) : (
              <View key={cle} style={styles.ligne}>
                {contenu}
              </View>
            );
          })}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 32 },
  pastilles: { gap: 8, paddingRight: 8 },
  pastille: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: rayons.full,
    borderWidth: 1,
    borderColor: couleurs.line,
    backgroundColor: couleurs.surface,
  },
  pastilleActive: { backgroundColor: couleurs.blue, borderColor: couleurs.blue },
  pastilleTexte: { fontSize: 12, fontWeight: '700', color: couleurs.ink2 },
  jour: { fontSize: 13, fontWeight: '800', color: couleurs.ink2 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  titre: { fontSize: 14, fontWeight: '700', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
  montant: { fontSize: 14, fontWeight: '800', color: couleurs.ink },
  etat: { fontSize: 11, fontWeight: '700' },
});
