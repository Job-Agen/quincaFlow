import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chargement, Empty, Notice } from '../src/ui';
import { useResource } from '../src/lib/useResource';
import { useSession } from '../src/lib/session';
import { couleurs, rayons } from '../src/lib/theme';
import { dayLabel, money, time } from '@/utils/format';
import type { CashEntryWithBalance, CashJournal } from '@/types';

/**
 * Journal de caisse (§40).
 *
 * Le §39 dit combien la boutique a gagné ; celui-ci dit où l'argent est passé.
 * Un mois de gros réassort vide la caisse tout en étant rentable, et le gérant
 * qui ne voit que sa marge ne comprend pas pourquoi son tiroir est vide.
 *
 * Le sens de l'opération se lit au signe autant qu'à la couleur : un journal
 * doit se tenir sans distinguer le vert du rouge.
 */
const PERIODES = [
  { valeur: 'month', libelle: 'Ce mois' },
  { valeur: 'last-month', libelle: 'Mois dernier' },
  { valeur: '30d', libelle: '30 jours' },
  { valeur: 'all', libelle: 'Tout' },
];

const SENS = [
  { valeur: '', libelle: 'Tout' },
  { valeur: 'IN', libelle: 'Entrées' },
  { valeur: 'OUT', libelle: 'Sorties' },
];

export default function Caisse() {
  const router = useRouter();
  const { currency, isOwner } = useSession();
  const [periode, setPeriode] = useState('month');
  const [sens, setSens] = useState('');

  const { data, loading, error, reload } = useResource<CashJournal>(isOwner ? '/api/cash' : null, {
    period: periode,
    direction: sens,
  });

  const jours = useMemo(() => {
    const groupes: { libelle: string; lignes: CashEntryWithBalance[] }[] = [];
    (data?.entries || []).forEach((ligne) => {
      const libelle = dayLabel(ligne.occurredAt);
      const dernier = groupes[groupes.length - 1];
      if (dernier && dernier.libelle === libelle) dernier.lignes.push(ligne);
      else groupes.push({ libelle, lignes: [ligne] });
    });
    return groupes;
  }, [data]);

  if (!isOwner) {
    return (
      <View style={styles.page}>
        <Notice tone="warn">Seul le propriétaire consulte le journal de caisse.</Notice>
      </View>
    );
  }

  if (loading && !data) return <Chargement />;

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
    >
      <Pastilles options={PERIODES} valeur={periode} onChange={setPeriode} />

      {error ? <Notice tone="error">{error.message}</Notice> : null}

      {data ? (
        <>
          <Card>
            <View style={styles.totaux}>
              <Total
                libelle="Entrées"
                valeur={money(data.cashIn, currency)}
                teinte={couleurs.greenDark}
              />
              <Total
                libelle="Sorties"
                valeur={money(data.cashOut, currency)}
                teinte={couleurs.red}
              />
              <Total
                libelle="Solde"
                valeur={money(data.balance, currency)}
                teinte={data.balance < 0 ? couleurs.red : couleurs.ink}
              />
            </View>
            {/* Dire ce que le solde vaut : sans solde d'ouverture, ce n'est pas
                le contenu du tiroir, et le laisser croire serait pire que rien. */}
            <Notice>
              Ce solde est celui des opérations de la période — encaissements moins dépenses. Ce
              n’est pas le fond de caisse : QuincaFlow ne connaît pas ce que contenait le tiroir au
              départ.
            </Notice>
          </Card>

          <Pastilles options={SENS} valeur={sens} onChange={setSens} />

          {data.entries.length === 0 ? (
            <Card>
              <Empty
                title="Aucun mouvement"
                hint="Les encaissements de vos ventes et vos dépenses apparaîtront ici."
              />
            </Card>
          ) : null}

          {jours.map((jour) => (
            <Card key={jour.libelle}>
              <Text style={styles.jour}>{jour.libelle}</Text>
              {jour.lignes.map((ligne) => {
                const entrante = ligne.direction === 'IN';
                const contenu = (
                  <>
                    <View
                      style={[
                        styles.icone,
                        { backgroundColor: entrante ? couleurs.greenSoft : couleurs.redSoft },
                      ]}
                    >
                      <Ionicons
                        name={entrante ? 'arrow-down' : 'arrow-up'}
                        size={15}
                        color={entrante ? couleurs.greenDark : couleurs.red}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.titre}>{ligne.label}</Text>
                      <Text style={styles.sous}>
                        {time(ligne.occurredAt)} · {ligne.detail}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text
                        style={[
                          styles.montant,
                          { color: entrante ? couleurs.greenDark : couleurs.red },
                        ]}
                      >
                        {entrante ? '+' : '−'} {money(ligne.amount, currency)}
                      </Text>
                      <Text style={styles.solde}>solde {money(ligne.balance, currency)}</Text>
                    </View>
                  </>
                );

                return ligne.saleId ? (
                  <Pressable
                    key={ligne.id}
                    accessibilityRole="button"
                    onPress={() => router.push(`/sales/${ligne.saleId}`)}
                    style={styles.ligne}
                  >
                    {contenu}
                  </Pressable>
                ) : (
                  <View key={ligne.id} style={styles.ligne}>
                    {contenu}
                  </View>
                );
              })}
            </Card>
          ))}

          {data.truncated ? (
            <Notice tone="warn">
              Seuls les mouvements les plus récents de la période sont affichés. Les totaux du haut,
              eux, portent sur toute la période.
            </Notice>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function Pastilles({
  options,
  valeur,
  onChange,
}: {
  options: readonly { valeur: string; libelle: string }[];
  valeur: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.pastilles}>
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
    </View>
  );
}

function Total({ libelle, valeur, teinte }: { libelle: string; valeur: string; teinte: string }) {
  return (
    <View style={styles.total}>
      <Text style={styles.totalLibelle}>{libelle}</Text>
      <Text style={[styles.totalValeur, { color: teinte }]}>{valeur}</Text>
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
  totaux: { flexDirection: 'row', gap: 8 },
  total: {
    flex: 1,
    padding: 10,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.surface2,
    alignItems: 'center',
    gap: 3,
  },
  totalLibelle: { fontSize: 11, fontWeight: '600', color: couleurs.muted },
  totalValeur: { fontSize: 14, fontWeight: '800' },
  jour: { fontSize: 13, fontWeight: '800', color: couleurs.ink2 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  icone: {
    width: 30,
    height: 30,
    borderRadius: rayons.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titre: { fontSize: 14, fontWeight: '700', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
  montant: { fontSize: 14, fontWeight: '800' },
  solde: { fontSize: 11, color: couleurs.muted },
});
