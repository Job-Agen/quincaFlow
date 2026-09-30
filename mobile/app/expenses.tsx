import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, CardHead, Chargement, Empty, Field, Notice } from '../src/ui';
import { useResource } from '../src/lib/useResource';
import { useSession } from '../src/lib/session';
import { api } from '../src/lib/api';
import { CIBLE_TACTILE, couleurs, rayons } from '../src/lib/theme';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, isOperating } from '@/domain/report';
import { money, shortDate } from '@/utils/format';
import { toNumber } from '@/utils/money';
import type { ExpenseCategory, ExpenseRow, Receipt } from '@/types';

/**
 * Dépenses (§40).
 *
 * C'est l'écran sans lequel « bénéfice net » resterait un mot : la marge brute
 * ne déduit que les marchandises (§13), et le loyer ne se déduit que s'il est
 * noté. La saisie est tenue courte — poste, libellé, montant, date — pour
 * qu'elle se fasse vraiment, tous les jours, au comptoir.
 */
const PERIODES = [
  { valeur: 'month', libelle: 'Ce mois' },
  { valeur: 'last-month', libelle: 'Mois dernier' },
  { valeur: '30d', libelle: '30 jours' },
  { valeur: 'all', libelle: 'Tout' },
];

type EnEdition = Partial<ExpenseRow> & { nouvelle?: boolean };

/** Date du jour au format que le serveur attend. */
function aujourdhui(): string {
  const maintenant = new Date();
  const mois = `${maintenant.getMonth() + 1}`.padStart(2, '0');
  const jour = `${maintenant.getDate()}`.padStart(2, '0');
  return `${maintenant.getFullYear()}-${mois}-${jour}`;
}

export default function Depenses() {
  const { currency, isOwner } = useSession();
  const [periode, setPeriode] = useState('month');
  const [edition, setEdition] = useState<EnEdition | null>(null);
  const { data, loading, error, reload } = useResource<ExpenseRow[]>(
    isOwner ? '/api/expenses' : null,
    { period: periode }
  );

  if (!isOwner) {
    return (
      <View style={styles.page}>
        <Notice tone="warn">Seul le propriétaire enregistre les dépenses de la boutique.</Notice>
      </View>
    );
  }

  if (loading && !data) return <Chargement />;

  const depenses = data || [];
  const total = depenses.reduce((somme, depense) => somme + Number(depense.amount), 0);
  // L'achat de stock est une sortie de caisse, pas une charge : le distinguer
  // évite qu'un mois de réassort soit lu comme un mois de frais (§39).
  const stock = depenses
    .filter((depense) => !isOperating(depense.category))
    .reduce((somme, depense) => somme + Number(depense.amount), 0);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.page}>
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

        <Card>
          <CardHead title="Dépenses de la période" />
          {depenses.length === 0 ? (
            <Empty
              title="Aucune dépense"
              hint="Loyer, énergie, salaires, transport : ce qui n’est pas noté ici ne sera pas déduit du bénéfice."
            />
          ) : (
            <>
              {depenses.map((depense) => (
                <Pressable
                  key={depense.id}
                  accessibilityRole="button"
                  onPress={() => setEdition(depense)}
                  style={styles.ligne}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.titreLigne}>
                      <Text style={styles.titre}>{depense.label}</Text>
                      {depense.has_receipt ? (
                        <Ionicons name="attach" size={14} color={couleurs.muted} />
                      ) : null}
                    </View>
                    <Text style={styles.sous}>
                      {EXPENSE_CATEGORY_LABELS[depense.category]} · {shortDate(depense.spent_on)}
                    </Text>
                  </View>
                  <Text style={styles.montant}>{money(depense.amount, currency)}</Text>
                </Pressable>
              ))}

              <View style={styles.totalLigne}>
                <Text style={styles.totalLibelle}>Total sorti de caisse</Text>
                <Text style={styles.totalValeur}>{money(total, currency)}</Text>
              </View>
              {stock > 0 ? (
                <Text style={styles.aide}>
                  Dont {money(stock, currency)} d’achat de stock, qui sort de la caisse sans réduire
                  votre bénéfice : la marchandise est déjà comptée à son coût au moment où elle est
                  vendue.
                </Text>
              ) : null}
            </>
          )}
        </Card>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nouvelle dépense"
        onPress={() => setEdition({ nouvelle: true })}
        style={styles.fab}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      {edition ? (
        <FeuilleDepense
          depense={edition}
          devise={currency}
          onFermer={() => setEdition(null)}
          onEnregistre={() => {
            setEdition(null);
            reload();
          }}
        />
      ) : null}
    </View>
  );
}

function FeuilleDepense({
  depense,
  devise,
  onFermer,
  onEnregistre,
}: {
  depense: EnEdition;
  devise: string;
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const [poste, setPoste] = useState<ExpenseCategory>(depense.category || 'RENT');
  const [libelle, setLibelle] = useState(depense.label || '');
  const [montant, setMontant] = useState(
    depense.amount === undefined ? '' : String(depense.amount)
  );
  const [date, setDate] = useState(depense.spent_on || aujourdhui());
  const [note, setNote] = useState(depense.note || '');
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  const somme = toNumber(montant);
  const valide = libelle.trim().length > 0 && somme > 0;

  async function enregistrer() {
    setOccupe(true);
    setSouci(null);
    try {
      const corps = {
        category: poste,
        label: libelle.trim(),
        amount: somme,
        spentOn: date,
        note: note.trim() || null,
      };
      if (depense.nouvelle) await api.post('/api/expenses', corps);
      else await api.patch(`/api/expenses/${depense.id}`, corps);
      onEnregistre();
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Enregistrement impossible.');
      setOccupe(false);
    }
  }

  async function supprimer() {
    setOccupe(true);
    try {
      await api.delete(`/api/expenses/${depense.id}`);
      onEnregistre();
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Suppression impossible.');
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
            {depense.nouvelle ? 'Nouvelle dépense' : 'Modifier la dépense'}
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

          <Text style={styles.champLabel}>Poste</Text>
          <View style={styles.pastilles}>
            {EXPENSE_CATEGORIES.map((categorie) => (
              <Pressable
                key={categorie}
                accessibilityRole="button"
                accessibilityState={{ selected: categorie === poste }}
                onPress={() => setPoste(categorie)}
                style={[styles.pastille, categorie === poste && styles.pastilleActive]}
              >
                <Text style={[styles.pastilleTexte, categorie === poste && { color: '#fff' }]}>
                  {EXPENSE_CATEGORY_LABELS[categorie]}
                </Text>
              </Pressable>
            ))}
          </View>
          {!isOperating(poste) ? (
            <Notice>
              L’achat de stock sort de votre caisse mais ne réduit pas votre bénéfice : la
              marchandise est comptée à son coût le jour où elle est vendue.
            </Notice>
          ) : null}

          <Field
            label="Libellé"
            value={libelle}
            onChangeText={setLibelle}
            placeholder="Loyer de septembre, taxi-bagages…"
          />
          <Field
            label={`Montant (${devise})`}
            keyboardType="decimal-pad"
            value={montant}
            onChangeText={setMontant}
          />
          <Field
            label="Date de la dépense"
            hint="Le jour où l’argent est sorti, pas celui de la saisie. Format AAAA-MM-JJ."
            value={date}
            onChangeText={setDate}
            placeholder="2026-09-29"
          />
          <Field label="Note" value={note} onChangeText={setNote} multiline />

          <Justificatif
            expenseId={depense.nouvelle ? null : (depense.id ?? null)}
            aUnRecu={Boolean(depense.has_receipt)}
          />

          <Button onPress={enregistrer} disabled={!valide} busy={occupe}>
            Enregistrer
          </Button>
          {!depense.nouvelle ? (
            <Button variant="ghost" onPress={supprimer} busy={occupe}>
              Supprimer cette dépense
            </Button>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Photo du reçu (§40, F15).
 *
 * « 45 000 de transport » sans pièce se discute ; avec le reçu, non. L'image est
 * réduite par le sélecteur avant l'envoi : un cliché de quatre mégaoctets ne part
 * pas d'un comptoir de Lomé, et l'échec arriverait après une minute d'attente.
 *
 * L'appareil photo et la galerie sont proposés tous les deux : le reçu est
 * souvent déjà dans le téléphone, photographié chez le grossiste une heure plus
 * tôt.
 */
function Justificatif({ expenseId, aUnRecu }: { expenseId: string | null; aUnRecu: boolean }) {
  const [recu, setRecu] = useState<Receipt | null>(null);
  const [charge, setCharge] = useState(aUnRecu);
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  if (!expenseId) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={styles.champLabel}>Justificatif</Text>
        <Text style={styles.aide}>
          Enregistrez d’abord la dépense : la photo du reçu se joindra ensuite.
        </Text>
      </View>
    );
  }

  async function voir() {
    if (recu) return;
    try {
      setRecu(await api.get<Receipt>(`/api/expenses/${expenseId}/receipt`));
    } catch {
      setCharge(false);
    }
  }

  async function envoyer(depuisAppareil: boolean) {
    setSouci(null);
    const permission = depuisAppareil
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setSouci('L’accès à la caméra ou à la galerie a été refusé.');
      return;
    }

    const choix = depuisAppareil
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true });
    if (choix.canceled || !choix.assets[0]?.base64) return;

    setOccupe(true);
    try {
      const enregistre = await api.put<Receipt>(`/api/expenses/${expenseId}/receipt`, {
        image: `data:image/jpeg;base64,${choix.assets[0].base64}`,
        name: choix.assets[0].fileName || 'recu.jpg',
      });
      setRecu(enregistre);
      setCharge(true);
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Envoi impossible.');
    } finally {
      setOccupe(false);
    }
  }

  async function retirer() {
    setOccupe(true);
    try {
      await api.delete(`/api/expenses/${expenseId}/receipt`);
      setRecu(null);
      setCharge(false);
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Suppression impossible.');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.champLabel}>Justificatif</Text>
      {souci ? <Notice tone="error">{souci}</Notice> : null}

      {charge && !recu ? (
        <Pressable accessibilityRole="button" onPress={voir}>
          <Text style={styles.lien}>Un reçu est joint — toucher pour l’afficher</Text>
        </Pressable>
      ) : null}

      {recu ? (
        <View style={styles.recu}>
          <Image
            source={{ uri: recu.url }}
            style={styles.vignette}
            resizeMode="cover"
            accessibilityLabel={`Reçu joint : ${recu.name}`}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.titre}>{recu.name}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Supprimer le justificatif"
            onPress={retirer}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={20} color={couleurs.muted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.deux}>
        <View style={{ flex: 1 }}>
          <Button variant="ghost" onPress={() => envoyer(true)} busy={occupe}>
            Photo
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="ghost" onPress={() => envoyer(false)} busy={occupe}>
            Galerie
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 90 },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pastille: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: rayons.full,
    borderWidth: 1,
    borderColor: couleurs.line,
    backgroundColor: couleurs.surface,
  },
  pastilleActive: { backgroundColor: couleurs.blue, borderColor: couleurs.blue },
  pastilleTexte: { fontSize: 12, fontWeight: '700', color: couleurs.ink2 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  titreLigne: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titre: { fontSize: 14, fontWeight: '700', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
  montant: { fontSize: 14, fontWeight: '800', color: couleurs.ink },
  totalLigne: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: couleurs.line,
  },
  totalLibelle: { fontSize: 15, fontWeight: '800', color: couleurs.ink },
  totalValeur: { fontSize: 17, fontWeight: '800', color: couleurs.blue },
  aide: { fontSize: 12, lineHeight: 18, color: couleurs.muted },
  lien: { fontSize: 13, fontWeight: '700', color: couleurs.blue },
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
  champLabel: { fontSize: 13, fontWeight: '700', color: couleurs.ink2 },
  recu: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vignette: {
    width: 64,
    height: 64,
    borderRadius: rayons.sm,
    borderWidth: 1,
    borderColor: couleurs.line,
  },
  deux: { flexDirection: 'row', gap: 10 },
});
