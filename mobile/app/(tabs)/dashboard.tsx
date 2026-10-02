import { Link } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, CardHead, Chargement, Empty, Notice } from '../../src/ui';
import { useResource } from '../../src/lib/useResource';
import { useSession } from '../../src/lib/session';
import { couleurs, rayons } from '../../src/lib/theme';
import { amount, money, withUnit } from '@/utils/format';
import type { DashboardSummary } from '@/types';

/**
 * Tableau de bord (§8).
 *
 * Les cinq indicateurs du PRD, dans son ordre, et rien d'autre : pas de
 * graphique, pas d'analyse. Il répond à une seule question — « que s'est-il
 * passé dans ma boutique aujourd'hui ? ».
 */

interface Tuile {
  cle: keyof DashboardSummary;
  libelle: string;
  fond: string;
  montant?: boolean;
}

const TUILES: readonly Tuile[] = [
  { cle: 'revenue', libelle: 'Ventes du jour', fond: '#dbf4e6', montant: true },
  { cle: 'margin', libelle: 'Marge brute estimée', fond: '#fff3d6', montant: true },
  { cle: 'salesCount', libelle: 'Nombre de ventes', fond: '#f0e3ff' },
  { cle: 'outOfStockCount', libelle: 'Ventes hors stock', fond: '#dcecff' },
  { cle: 'lowStockCount', libelle: 'Produits en stock faible', fond: '#fff3d6' },
];

export default function TableauDeBord() {
  const { profil, currency, fermerSession } = useSession();
  const { data, loading, error, reload } = useResource<DashboardSummary>('/api/dashboard');

  if (loading && !data) return <Chargement />;

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
    >
      <View>
        <Text style={styles.bonjour}>Bonjour {profil?.user.name} !</Text>
        <Text style={styles.sous}>{profil?.business.name}</Text>
      </View>

      {error ? <Notice tone="error">{error.message}</Notice> : null}

      {data ? (
        <>
          <View style={styles.tuiles}>
            {TUILES.map(({ cle, libelle, fond, montant }) => (
              <View key={cle} style={[styles.tuile, { backgroundColor: fond }]}>
                <Text style={styles.tuileLibelle}>{libelle}</Text>
                <Text style={styles.tuileValeur}>
                  {montant ? amount(data[cle], 0) : String(data[cle])}
                </Text>
                {montant ? <Text style={styles.tuileUnite}>{currency}</Text> : null}
              </View>
            ))}
          </View>

          <Link href="/sale" asChild>
            <Text style={styles.actionPrincipale}>＋ Nouvelle vente</Text>
          </Link>

          <Card>
            <CardHead
              title="Stock faible"
              action={
                <Link href="/products" style={styles.lien}>
                  Voir tout
                </Link>
              }
            />
            {data.lowStock.length === 0 ? (
              <Empty title="Aucune alerte" hint="Tous vos produits sont au-dessus du seuil." />
            ) : (
              data.lowStock.map((produit) => (
                <View key={produit.id} style={styles.ligne}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ligneTitre}>{produit.name}</Text>
                    <Text style={styles.ligneSous}>
                      {produit.stock_quantity <= 0
                        ? 'Rupture de stock'
                        : `Il reste ${withUnit(produit.stock_quantity, produit.base_unit)}`}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </Card>

          {data.recent.length > 0 ? (
            <Card>
              <CardHead title="Activité récente" />
              {data.recent.map((operation) => (
                <View key={`${operation.kind}-${operation.id}`} style={styles.ligne}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ligneTitre}>
                      {operation.kind === 'SALE' ? 'Vente' : 'Hors stock'} {operation.reference}
                    </Text>
                  </View>
                  <Text style={styles.montant}>{money(operation.amount, currency)}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          <Text style={styles.deconnexion} onPress={fermerSession}>
            Se déconnecter
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14 },
  bonjour: { fontSize: 20, fontWeight: '800', color: couleurs.ink },
  sous: { fontSize: 13, color: couleurs.muted },
  tuiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tuile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 104,
    borderRadius: rayons.md,
    padding: 14,
    justifyContent: 'center',
    gap: 4,
  },
  tuileLibelle: { fontSize: 11, fontWeight: '600', color: couleurs.ink2 },
  tuileValeur: { fontSize: 22, fontWeight: '800', color: couleurs.ink },
  tuileUnite: { fontSize: 11, color: couleurs.ink2 },
  actionPrincipale: {
    backgroundColor: couleurs.green,
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    paddingVertical: 15,
    borderRadius: rayons.md,
    overflow: 'hidden',
  },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  ligneTitre: { fontSize: 14, fontWeight: '700', color: couleurs.ink },
  ligneSous: { fontSize: 12, color: couleurs.muted },
  montant: { fontSize: 14, fontWeight: '800', color: couleurs.ink },
  lien: { color: couleurs.blue, fontWeight: '700', fontSize: 13 },
  deconnexion: {
    textAlign: 'center',
    color: couleurs.muted,
    fontSize: 13,
    paddingVertical: 14,
  },
});
