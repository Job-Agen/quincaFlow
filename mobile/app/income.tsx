import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Card, CardHead, Chargement, Empty, Field, Notice } from '../src/ui';
import { useResource } from '../src/lib/useResource';
import { useSession } from '../src/lib/session';
import { api } from '../src/lib/api';
import { CIBLE_TACTILE, couleurs, rayons } from '../src/lib/theme';
import { INCOME_CATEGORIES, INCOME_CATEGORY_LABELS, isRevenue } from '@/domain/income';
import { money, shortDate } from '@/utils/format';
import { toNumber } from '@/utils/money';
import type { IncomeCategory, IncomeRow, TakingsBook } from '@/types';

/**
 * Cahier de recettes (§42).
 *
 * Le même écran que sur le web, et le même domaine : `INCOME_CATEGORIES` et
 * `isRevenue` viennent du `src/` partagé (§41). Une correction de la règle
 * comptable vaut donc pour les deux applications, et les mêmes tests la
 * couvrent.
 *
 * Ouvert au vendeur, contrairement aux rapports et au journal de caisse : il ne
 * montre ni marge ni prix d'achat, et l'argent d'une réparation entre au
 * comptoir — le lui interdire ferait disparaître la recette.
 */
const PERIODES = [
  { valeur: 'month', libelle: 'Ce mois' },
  { valeur: 'last-month', libelle: 'Mois dernier' },
  { valeur: '30d', libelle: '30 jours' },
  { valeur: 'all', libelle: 'Tout' },
];

type EnEdition = Partial<IncomeRow> & { nouvelle?: boolean };

/** Date du jour au format que le serveur attend. */
function aujourdhui(): string {
  const maintenant = new Date();
  const mois = `${maintenant.getMonth() + 1}`.padStart(2, '0');
  const jour = `${maintenant.getDate()}`.padStart(2, '0');
  return `${maintenant.getFullYear()}-${mois}-${jour}`;
}

export default function CahierDeRecettes() {
  const { currency } = useSession();
  const [periode, setPeriode] = useState('month');
  const [edition, setEdition] = useState<EnEdition | null>(null);
  const [souci, setSouci] = useState<string | null>(null);

  const cahier = useResource<TakingsBook>('/api/takings', { period: periode });
  const liste = useResource<IncomeRow[]>('/api/incomes', { period: periode });

  const livre = cahier.data;
  const recettes = liste.data || [];

  function recharger() {
    cahier.reload();
    liste.reload();
  }

  async function supprimer(recette: IncomeRow) {
    setSouci(null);
    try {
      await api.delete(`/api/incomes/${recette.id}`);
      setEdition(null);
      recharger();
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Suppression impossible.');
    }
  }

  if (cahier.loading && !livre) return <Chargement />;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.pastilles}>
          {PERIODES.map((p) => (
            <Pressable
              key={p.valeur}
              accessibilityRole="button"
              accessibilityState={{ selected: p.valeur === periode }}
              onPress={() => setPeriode(p.valeur)}
              style={[styles.pastille, p.valeur === periode && styles.pastilleActive]}
            >
              <Text style={[styles.pastilleTexte, p.valeur === periode && { color: '#fff' }]}>
                {p.libelle}
              </Text>
            </Pressable>
          ))}
        </View>

        {souci ? <Notice tone="error">{souci}</Notice> : null}
        {cahier.error ? <Notice tone="error">{cahier.error.message}</Notice> : null}

        {livre ? (
          <>
            <View style={styles.tuiles}>
              <View style={[styles.tuile, { backgroundColor: couleurs.greenSoft }]}>
                <Text style={styles.tuileLibelle}>Total encaissé</Text>
                <Text style={styles.tuileValeur}>{money(livre.total, currency)}</Text>
              </View>
              <View style={[styles.tuile, { backgroundColor: couleurs.blueSoft }]}>
                <Text style={styles.tuileLibelle}>Ventes</Text>
                <Text style={styles.tuileValeur}>{money(livre.salesTotal, currency)}</Text>
              </View>
            </View>

            {/* La nuance qui évite de compter deux fois la même vente (§42). */}
            {livre.otherTotal > livre.otherRevenue ? (
              <Notice>
                {money(livre.otherTotal - livre.otherRevenue, currency)} de remboursements de dette
                sont entrés en caisse sans compter dans le chiffre d’affaires : ces ventes ont déjà
                été comptées le jour où elles ont eu lieu.
              </Notice>
            ) : null}

            <Card>
              <CardHead title="Jour par jour" />
              {livre.days.length === 0 ? (
                <Empty
                  title="Rien d’encaissé"
                  hint="Les ventes y tombent toutes seules. Ajoutez ici ce qui entre autrement."
                />
              ) : (
                livre.days.map((jour) => (
                  <View key={jour.day} style={styles.ligne}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.titre}>{shortDate(jour.day)}</Text>
                      <Text style={styles.sous}>
                        {jour.salesCount > 0
                          ? `${jour.salesCount} vente${jour.salesCount > 1 ? 's' : ''} · ${money(jour.salesAmount, currency)}`
                          : 'Aucune vente'}
                        {jour.otherCount > 0
                          ? ` · ${jour.otherCount} hors vente · ${money(jour.otherAmount, currency)}`
                          : ''}
                      </Text>
                    </View>
                    <Text style={styles.montant}>{money(jour.total, currency)}</Text>
                  </View>
                ))
              )}
            </Card>
          </>
        ) : null}

        <Card>
          <CardHead title="Recettes hors vente" />
          {recettes.length === 0 ? (
            <Empty
              title="Aucune recette saisie"
              hint="Service rendu, livraison, location, remboursement d’une ardoise."
            />
          ) : (
            recettes.map((recette) => (
              <Pressable
                key={recette.id}
                accessibilityRole="button"
                onPress={() => setEdition(recette)}
                style={styles.ligne}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.titre}>{recette.label}</Text>
                  <Text style={styles.sous}>
                    {INCOME_CATEGORY_LABELS[recette.category]} · {shortDate(recette.received_on)}
                    {isRevenue(recette.category) ? '' : ' · hors chiffre d’affaires'}
                  </Text>
                </View>
                <Text style={styles.montant}>{money(recette.amount, currency)}</Text>
              </Pressable>
            ))
          )}
          {livre && livre.otherTotal > 0 ? (
            <View style={styles.total}>
              <Text style={styles.totalLibelle}>Total hors vente</Text>
              <Text style={styles.totalValeur}>{money(livre.otherTotal, currency)}</Text>
            </View>
          ) : null}
        </Card>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nouvelle recette"
        onPress={() =>
          setEdition({ nouvelle: true, category: 'SERVICE', received_on: aujourdhui() })
        }
        style={styles.fab}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {edition ? (
        <FeuilleRecette
          recette={edition}
          onFermer={() => setEdition(null)}
          onEnregistre={() => {
            setEdition(null);
            recharger();
          }}
          onSupprimer={supprimer}
        />
      ) : null}
    </View>
  );
}

function FeuilleRecette({
  recette,
  onFermer,
  onEnregistre,
  onSupprimer,
}: {
  recette: EnEdition;
  onFermer: () => void;
  onEnregistre: () => void;
  onSupprimer: (recette: IncomeRow) => void;
}) {
  const { currency } = useSession();
  const [forme, setForme] = useState({
    category: (recette.category || 'SERVICE') as IncomeCategory,
    label: recette.label || '',
    amount: recette.amount != null ? String(recette.amount) : '',
    receivedOn: recette.received_on || aujourdhui(),
    note: recette.note || '',
  });
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  const valide = forme.label.trim().length > 0 && toNumber(forme.amount) > 0;

  async function enregistrer() {
    setOccupe(true);
    setSouci(null);
    try {
      const charge = { ...forme, amount: toNumber(forme.amount) };
      if (recette.nouvelle) await api.post('/api/incomes', charge);
      else await api.patch(`/api/incomes/${recette.id}`, charge);
      onEnregistre();
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Enregistrement impossible.');
      setOccupe(false);
    }
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onFermer}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: couleurs.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.entete}>
          <Text style={styles.enteteTitre}>
            {recette.nouvelle ? 'Nouvelle recette' : 'Modifier la recette'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            onPress={onFermer}
            hitSlop={10}
          >
            <Ionicons name="close" size={24} color={couleurs.ink2} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.formulaire} keyboardShouldPersistTaps="handled">
          {souci ? <Notice tone="error">{souci}</Notice> : null}

          <View style={styles.pastilles}>
            {INCOME_CATEGORIES.map((poste) => (
              <Pressable
                key={poste}
                accessibilityRole="button"
                accessibilityState={{ selected: forme.category === poste }}
                onPress={() => setForme((f) => ({ ...f, category: poste }))}
                style={[styles.pastille, forme.category === poste && styles.pastilleActive]}
              >
                <Text style={[styles.pastilleTexte, forme.category === poste && { color: '#fff' }]}>
                  {INCOME_CATEGORY_LABELS[poste]}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Dit au moment de la saisie, pas après coup dans un rapport. */}
          {!isRevenue(forme.category) ? (
            <Notice>
              Entre en caisse, mais pas dans le chiffre d’affaires : la vente a déjà été comptée le
              jour où elle a eu lieu.
            </Notice>
          ) : null}

          <Field
            label="Libellé"
            placeholder="Découpe de fer, livraison chantier…"
            value={forme.label}
            onChangeText={(v) => setForme((f) => ({ ...f, label: v }))}
          />
          <Field
            label={`Montant (${currency})`}
            keyboardType="decimal-pad"
            value={forme.amount}
            onChangeText={(v) => setForme((f) => ({ ...f, amount: v }))}
          />
          <Field
            label="Date de la recette"
            hint="Le jour où l’argent est entré, pas celui de la saisie."
            placeholder="AAAA-MM-JJ"
            value={forme.receivedOn}
            onChangeText={(v) => setForme((f) => ({ ...f, receivedOn: v }))}
          />
          <Field
            label="Note"
            multiline
            value={forme.note}
            onChangeText={(v) => setForme((f) => ({ ...f, note: v }))}
          />

          <Button onPress={enregistrer} disabled={!valide} busy={occupe}>
            Enregistrer
          </Button>

          {!recette.nouvelle && recette.id ? (
            <Button variant="ghost" onPress={() => onSupprimer(recette as IncomeRow)}>
              Supprimer
            </Button>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 100 },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pastille: {
    minHeight: 36,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: rayons.full,
    borderWidth: 1,
    borderColor: couleurs.line,
    backgroundColor: couleurs.surface,
  },
  pastilleActive: { backgroundColor: couleurs.blue, borderColor: couleurs.blue },
  pastilleTexte: { fontSize: 12, fontWeight: '700', color: couleurs.ink2 },
  tuiles: { flexDirection: 'row', gap: 12 },
  tuile: { flex: 1, padding: 14, borderRadius: rayons.md, gap: 4 },
  tuileLibelle: { fontSize: 12, fontWeight: '700', color: couleurs.ink2 },
  tuileValeur: { fontSize: 19, fontWeight: '800', color: couleurs.ink },
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
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: couleurs.line,
  },
  totalLibelle: { fontSize: 15, fontWeight: '800', color: couleurs.ink },
  totalValeur: { fontSize: 17, fontWeight: '800', color: couleurs.blue },
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
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    minHeight: CIBLE_TACTILE + 12,
    backgroundColor: couleurs.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: couleurs.line,
  },
  enteteTitre: { fontSize: 17, fontWeight: '800', color: couleurs.ink },
  formulaire: { padding: 16, gap: 14, paddingBottom: 40 },
});
