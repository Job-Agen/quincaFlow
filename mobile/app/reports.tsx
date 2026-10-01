import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Card, CardHead, Chargement, Empty, Notice } from '../src/ui';
import { useResource } from '../src/lib/useResource';
import { useSession } from '../src/lib/session';
import { couleurs, rayons } from '../src/lib/theme';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, isOperating } from '@/domain/report';
import { amount, money, monthLabel, percent, quantity, shortDate, withUnit } from '@/utils/format';
import type { ExpenseBucket, FinancialReport } from '@/types';

/**
 * Rapports financiers (§39).
 *
 * Le tableau de bord regarde la journée ; cet écran regarde une période et va
 * jusqu'au bénéfice net. Deux exigences le gouvernent, les mêmes que sur le
 * web : les lignes doivent reconstituer leur total, et l'écran doit dire ce que
 * le chiffre vaut. Un bénéfice net calculé sans aucune dépense saisie est une
 * marge brute, et le taire serait annoncer au gérant un gain déjà dépensé.
 */
const PERIODES = [
  { valeur: 'month', libelle: 'Ce mois' },
  { valeur: 'last-month', libelle: 'Mois dernier' },
  { valeur: '30d', libelle: '30 jours' },
  { valeur: 'all', libelle: 'Tout' },
];

/**
 * Teinte de chaque poste, fixée par le poste et non par son rang.
 *
 * Mêmes pas que sur le web : une palette catégorielle validée, dont la pire
 * paire voisine reste distinguable en vision des couleurs déficiente. Un mois
 * sans loyer ne doit pas repeindre les autres parts.
 */
const TEINTES: Record<string, string> = {
  RENT: '#2a78d6',
  UTILITIES: '#eb6834',
  SALARY: '#1baf7a',
  STOCK_PURCHASE: '#eda100',
  TRANSPORT: '#e87ba4',
  OTHER: '#008300',
};

const RAYON = 62;
const EPAISSEUR = 22;
const CIRCONFERENCE = 2 * Math.PI * RAYON;
/** Fente entre deux parts : sans elle, deux teintes voisines se lisent comme une. */
const FENTE = 2;

/** Une part de l'anneau : son poids et l'angle où elle commence. */
interface Part {
  categorie: (typeof EXPENSE_CATEGORIES)[number];
  montant: number;
  fraction: number;
  depart: number;
}

function Anneau({
  postes,
  total,
  devise,
}: {
  postes: ExpenseBucket[];
  total: number;
  devise: string;
}) {
  if (total <= 0) return null;

  // Chaque part démarre là où la précédente s'arrête. Le cumul se lit dans la
  // part déjà placée plutôt que dans une variable réassignée pendant le rendu :
  // le compilateur React refuse la seconde forme, et il a raison — un rendu
  // interrompu laisserait le curseur à mi-course.
  const parts = EXPENSE_CATEGORIES.reduce<Part[]>((placees, categorie) => {
    const montant = postes.find((p) => p.category === categorie)?.amount ?? 0;
    if (montant <= 0) return placees;
    const precedente = placees[placees.length - 1];
    const depart = precedente ? precedente.depart + precedente.fraction : 0;
    return [...placees, { categorie, montant, fraction: montant / total, depart }];
  }, []);

  const description = `Répartition des dépenses : ${parts
    .map(
      (p) =>
        `${EXPENSE_CATEGORY_LABELS[p.categorie]}, ${money(p.montant, devise)}, ` +
        `${percent(Math.round(p.fraction * 1000) / 10)}`
    )
    .join(' ; ')}.`;

  return (
    <View style={styles.anneau}>
      <Svg width={160} height={160} viewBox="0 0 160 160" accessibilityLabel={description}>
        <Circle
          cx={80}
          cy={80}
          r={RAYON}
          fill="none"
          stroke={couleurs.line}
          strokeWidth={EPAISSEUR}
        />
        {parts.map((part) => {
          const longueur = part.fraction * CIRCONFERENCE;
          // Une part plus courte que la fente resterait invisible : on lui laisse
          // un filet plutôt que de la faire disparaître.
          const tracee = parts.length === 1 ? longueur : Math.max(longueur - FENTE, 1.5);
          return (
            <Circle
              key={part.categorie}
              cx={80}
              cy={80}
              r={RAYON}
              fill="none"
              stroke={TEINTES[part.categorie]}
              strokeWidth={EPAISSEUR}
              strokeDasharray={`${tracee} ${CIRCONFERENCE - tracee}`}
              strokeDashoffset={-part.depart * CIRCONFERENCE}
              // L'anneau démarre en haut, comme une horloge.
              transform="rotate(-90 80 80)"
            />
          );
        })}
      </Svg>

      {/* La légende porte les mêmes chiffres : trois des six teintes n'atteignent
          pas 3:1 de contraste sur fond blanc, et c'est elle qui rend l'anneau
          lisible — pour tout le monde. */}
      <View style={styles.legende}>
        {parts.map((part) => (
          <View key={part.categorie} style={styles.legendeLigne}>
            <View style={[styles.pastilleCouleur, { backgroundColor: TEINTES[part.categorie] }]} />
            <Text style={styles.legendeLibelle} numberOfLines={1}>
              {EXPENSE_CATEGORY_LABELS[part.categorie]}
            </Text>
            <Text style={styles.legendeMontant}>{money(part.montant, devise)}</Text>
            <Text style={styles.legendePart}>{percent(Math.round(part.fraction * 1000) / 10)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Rapports() {
  const router = useRouter();
  const { currency, isOwner } = useSession();
  const [periode, setPeriode] = useState('month');
  const { data, loading, error, reload } = useResource<FinancialReport>(
    isOwner ? '/api/reports' : null,
    { period: periode }
  );

  if (!isOwner) {
    return (
      <View style={styles.page}>
        <Notice tone="warn">
          Seul le propriétaire consulte les résultats financiers de la boutique.
        </Notice>
      </View>
    );
  }

  if (loading && !data) return <Chargement />;

  const totaux = data?.totals;
  const nombreCharges = (data?.expensesByCategory || [])
    .filter((poste) => isOperating(poste.category))
    .reduce((somme, poste) => somme + poste.count, 0);

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
    >
      <View style={styles.pastilles}>
        {PERIODES.map((option) => (
          <Pressable
            key={option.valeur}
            accessibilityRole="button"
            accessibilityState={{ selected: option.valeur === periode }}
            onPress={() => setPeriode(option.valeur)}
            style={[styles.pastille, option.valeur === periode && styles.pastilleActive]}
          >
            <Text style={[styles.pastilleTexte, option.valeur === periode && { color: '#fff' }]}>
              {option.libelle}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Notice tone="error">{error.message}</Notice> : null}

      {data && totaux ? (
        <>
          <View style={styles.tuiles}>
            <Tuile
              libelle="Chiffre d’affaires"
              valeur={totaux.revenue}
              devise={currency}
              fond="#dbf4e6"
            />
            <Tuile
              libelle="Marge brute"
              valeur={totaux.grossMargin}
              devise={currency}
              fond="#fff3d6"
            />
            <Tuile
              libelle="Dépenses déduites"
              valeur={totaux.operatingExpenses}
              devise={currency}
              fond="#f0e3ff"
            />
            <Tuile
              libelle="Bénéfice net"
              valeur={totaux.netProfit}
              devise={currency}
              fond={totaux.netProfit < 0 ? '#ffe0e0' : '#dcecff'}
              alerte={totaux.netProfit < 0}
            />
          </View>

          <Card>
            <CardHead title="Du chiffre d’affaires au bénéfice" />
            <Cascade libelle="Ventes en boutique" valeur={money(totaux.salesRevenue, currency)} />
            <Cascade
              libelle="Ventes hors stock"
              valeur={money(totaux.outOfStockRevenue, currency)}
            />
            <Cascade libelle="Chiffre d’affaires" valeur={money(totaux.revenue, currency)} fort />
            <Cascade
              libelle="Coût des marchandises vendues"
              valeur={`− ${money(totaux.costOfGoods, currency)}`}
              negatif
            />
            <Cascade
              libelle={`Marge brute · ${percent(totaux.marginRate)}`}
              valeur={money(totaux.grossMargin, currency)}
              fort
            />
            <Cascade
              libelle={`Dépenses de fonctionnement · ${nombreCharges} saisie${nombreCharges > 1 ? 's' : ''}`}
              valeur={`− ${money(totaux.operatingExpenses, currency)}`}
              negatif
            />
            <View style={styles.beneficeLigne}>
              <Text style={styles.beneficeLibelle}>Bénéfice net</Text>
              <Text
                style={[styles.beneficeValeur, totaux.netProfit < 0 && { color: couleurs.red }]}
              >
                {money(totaux.netProfit, currency)}
              </Text>
            </View>

            {totaux.stockPurchases > 0 ? (
              <Notice>
                {money(totaux.stockPurchases, currency)} d’achat de stock sont sortis de votre
                caisse sans être déduits ici : la marchandise est comptée à son coût le jour où elle
                est vendue, et la retirer deux fois ferait apparaître une perte qui n’existe pas.
              </Notice>
            ) : null}

            {data.expenseCount === 0 ? (
              <Notice tone="warn">
                Aucune dépense n’est enregistrée sur cette période : le bénéfice net affiché est
                donc votre marge brute. Saisissez loyer, énergie, salaires et transport pour obtenir
                un chiffre réel.
              </Notice>
            ) : (
              <Text style={styles.aide}>
                Le bénéfice net n’est juste que si toutes les dépenses de la période ont été
                saisies.
              </Text>
            )}

            <Pressable accessibilityRole="button" onPress={() => router.push('/expenses')}>
              <Text style={styles.lien}>Saisir une dépense</Text>
            </Pressable>
          </Card>

          <Card>
            <CardHead title="Répartition des dépenses" />
            {data.expensesByCategory.length === 0 ? (
              <Empty
                title="Aucune dépense"
                hint="Notez loyer, énergie, salaires et transport pour obtenir un bénéfice réel."
              />
            ) : (
              <>
                <Anneau
                  postes={data.expensesByCategory}
                  total={totaux.expenses}
                  devise={currency}
                />
                <View style={styles.totalSorti}>
                  <Text style={styles.totalSortiLibelle}>Total sorti de caisse</Text>
                  <Text style={styles.totalSortiValeur}>{money(totaux.expenses, currency)}</Text>
                </View>
              </>
            )}
          </Card>

          <Card>
            <CardHead title={data.granularity === 'day' ? 'Ventes par jour' : 'Ventes par mois'} />
            {data.buckets.length === 0 ? (
              <Empty title="Aucune vente sur la période" hint="Changez de période." />
            ) : (
              data.buckets.map((tranche) => {
                const operations = tranche.salesCount + tranche.outOfStockCount;
                return (
                  <View key={tranche.bucket} style={styles.ligne}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.titre}>
                        {data.granularity === 'day'
                          ? shortDate(tranche.bucket)
                          : monthLabel(tranche.bucket)}
                      </Text>
                      <Text style={styles.sous}>
                        {operations} opération{operations > 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.montant}>{money(tranche.revenue, currency)}</Text>
                      <Text style={styles.sous}>marge {money(tranche.margin, currency)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </Card>

          <Card>
            <CardHead title="Rentabilité par produit" />
            {data.products.length === 0 ? (
              <Empty
                title="Aucun produit vendu"
                hint="La rentabilité se calcule à partir des ventes de la période."
              />
            ) : (
              [...data.products]
                .sort((a, b) => b.margin - a.margin)
                .map((produit) => (
                  <View
                    key={`${produit.productId ?? 'x'}-${produit.productName}`}
                    style={styles.ligne}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.titre}>{produit.productName}</Text>
                      <Text style={styles.sous}>
                        {produit.quantity > 0
                          ? `Quantité vendue : ${withUnit(produit.quantity, produit.baseUnit)}`
                          : 'Vendu hors stock uniquement'}
                        {produit.outOfStockQuantity > 0 && produit.quantity > 0
                          ? ` · ${quantity(produit.outOfStockQuantity)} hors stock`
                          : ''}
                      </Text>
                      <Text style={styles.sous}>
                        Ventes {money(produit.revenue, currency)} · coût{' '}
                        {money(produit.cost, currency)}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.montant, produit.margin < 0 && { color: couleurs.red }]}>
                        {money(produit.margin, currency)}
                      </Text>
                      <Text style={styles.sous}>{percent(produit.marginRate)}</Text>
                    </View>
                  </View>
                ))
            )}
            {data.productCount > data.products.length ? (
              <Text style={styles.aide}>
                {data.products.length} produits affichés sur {data.productCount}, les plus gros
                chiffres d’affaires d’abord.
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function Tuile({
  libelle,
  valeur,
  devise,
  fond,
  alerte,
}: {
  libelle: string;
  valeur: number;
  devise: string;
  fond: string;
  alerte?: boolean;
}) {
  return (
    <View style={[styles.tuile, { backgroundColor: fond }]}>
      <Text style={styles.tuileLibelle}>{libelle}</Text>
      <Text style={[styles.tuileValeur, alerte && { color: couleurs.red }]}>
        {amount(valeur, 0)}
      </Text>
      <Text style={styles.tuileUnite}>{devise}</Text>
    </View>
  );
}

function Cascade({
  libelle,
  valeur,
  fort,
  negatif,
}: {
  libelle: string;
  valeur: string;
  fort?: boolean;
  negatif?: boolean;
}) {
  return (
    <View style={[styles.cascade, fort && styles.cascadeForte]}>
      <Text style={[styles.cascadeLibelle, fort && { fontWeight: '800', color: couleurs.ink }]}>
        {libelle}
      </Text>
      <Text
        style={[
          styles.cascadeValeur,
          fort && { fontWeight: '800' },
          negatif && { color: couleurs.red },
        ]}
      >
        {valeur}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 40 },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  tuiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tuile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 96,
    borderRadius: rayons.md,
    padding: 14,
    justifyContent: 'center',
    gap: 3,
  },
  tuileLibelle: { fontSize: 11, fontWeight: '600', color: couleurs.ink2 },
  tuileValeur: { fontSize: 21, fontWeight: '800', color: couleurs.ink },
  tuileUnite: { fontSize: 11, color: couleurs.ink2 },
  cascade: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  cascadeForte: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: couleurs.line },
  cascadeLibelle: { fontSize: 13, color: couleurs.ink2, flex: 1 },
  cascadeValeur: { fontSize: 13, fontWeight: '700', color: couleurs.ink },
  beneficeLigne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: couleurs.line,
  },
  beneficeLibelle: { fontSize: 16, fontWeight: '800', color: couleurs.ink },
  beneficeValeur: { fontSize: 20, fontWeight: '800', color: couleurs.blue },
  anneau: { alignItems: 'center', gap: 14 },
  legende: { width: '100%', gap: 2 },
  legendeLigne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: couleurs.line,
  },
  pastilleCouleur: { width: 11, height: 11, borderRadius: 3 },
  legendeLibelle: { flex: 1, fontSize: 13, color: couleurs.ink },
  legendeMontant: { fontSize: 13, fontWeight: '700', color: couleurs.ink },
  legendePart: { fontSize: 12, color: couleurs.muted, minWidth: 52, textAlign: 'right' },
  totalSorti: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  totalSortiLibelle: { fontSize: 14, fontWeight: '800', color: couleurs.ink },
  totalSortiValeur: { fontSize: 14, fontWeight: '800', color: couleurs.ink },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  titre: { fontSize: 14, fontWeight: '700', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
  montant: { fontSize: 14, fontWeight: '800', color: couleurs.ink },
  aide: { fontSize: 12, lineHeight: 18, color: couleurs.muted },
  lien: { fontSize: 13, fontWeight: '700', color: couleurs.blue, paddingVertical: 6 },
});
