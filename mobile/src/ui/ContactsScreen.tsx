import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Chargement, Empty, Field, Notice } from './index';
import { useResource } from '../lib/useResource';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { CIBLE_TACTILE, couleurs, rayons } from '../lib/theme';
import type { ContactRow } from '@/types';

/**
 * Répertoire, partagé par les clients et les fournisseurs (§18, §23).
 *
 * Les deux fiches ne diffèrent que d'un champ — le WhatsApp du fournisseur — et
 * se comportent à l'identique. Deux écrans jumeaux divergeraient au premier
 * correctif ; un seul, paramétré, ne le peut pas. C'est la même décision que
 * côté web, pour la même raison.
 */
type EnEdition = Partial<ContactRow> & { nouveau?: boolean };

export default function ContactsScreen({
  kind,
  titreAjout,
  avecWhatsapp,
  videHint,
  proprietaireSeul = false,
}: {
  kind: 'customers' | 'suppliers';
  titreAjout: string;
  avecWhatsapp?: boolean;
  videHint: string;
  /** Réserve l'écriture au propriétaire : vrai pour les fournisseurs (§5). */
  proprietaireSeul?: boolean;
}) {
  const { isOwner } = useSession();
  const [recherche, setRecherche] = useState('');
  const [edition, setEdition] = useState<EnEdition | null>(null);
  const { data, loading, error, reload } = useResource<ContactRow[]>(`/api/${kind}`, {
    search: recherche,
  });

  // Un vendeur inscrit un client au comptoir, mais ne touche pas au répertoire
  // fournisseurs : c'est avec eux que l'argent sort.
  const peutEcrire = !proprietaireSeul || isOwner;

  if (loading && !data) return <Chargement />;

  return (
    <View style={styles.page}>
      <TextInput
        accessibilityLabel="Rechercher"
        placeholder="Nom ou téléphone…"
        placeholderTextColor={couleurs.faint}
        value={recherche}
        onChangeText={setRecherche}
        style={styles.recherche}
      />

      {error ? <Notice tone="error">{error.message}</Notice> : null}

      <FlatList
        data={data || []}
        keyExtractor={(contact) => contact.id}
        contentContainerStyle={styles.liste}
        ListEmptyComponent={<Empty title="Répertoire vide" hint={videHint} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            disabled={!peutEcrire}
            onPress={() => setEdition(item)}
            style={styles.ligne}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarTexte}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.titre}>{item.name}</Text>
              {item.phone ? <Text style={styles.sous}>{item.phone}</Text> : null}
            </View>
            {peutEcrire ? (
              <Ionicons name="chevron-forward" size={18} color={couleurs.faint} />
            ) : null}
          </Pressable>
        )}
      />

      {peutEcrire ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={titreAjout}
          onPress={() => setEdition({ nouveau: true })}
          style={styles.fab}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      ) : null}

      {edition ? (
        <FicheContact
          kind={kind}
          contact={edition}
          avecWhatsapp={avecWhatsapp}
          titreAjout={titreAjout}
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

function FicheContact({
  kind,
  contact,
  avecWhatsapp,
  titreAjout,
  onFermer,
  onEnregistre,
}: {
  kind: 'customers' | 'suppliers';
  contact: EnEdition;
  avecWhatsapp?: boolean;
  titreAjout: string;
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const [forme, setForme] = useState({
    name: contact.name || '',
    phone: contact.phone || '',
    whatsapp: contact.whatsapp || '',
    address: contact.address || '',
    notes: contact.notes || '',
  });
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  const changer = (champ: keyof typeof forme) => (valeur: string) =>
    setForme((actuelle) => ({ ...actuelle, [champ]: valeur }));

  async function enregistrer() {
    setOccupe(true);
    setSouci(null);
    try {
      if (contact.nouveau) await api.post(`/api/${kind}`, forme);
      else await api.patch(`/api/${kind}/${contact.id}`, forme);
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
          <Text style={styles.enteteTitre}>{contact.nouveau ? titreAjout : forme.name}</Text>
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
          <Field label="Nom" value={forme.name} onChangeText={changer('name')} />
          <Field
            label="Téléphone"
            keyboardType="phone-pad"
            value={forme.phone}
            onChangeText={changer('phone')}
          />
          {avecWhatsapp ? (
            <Field
              label="WhatsApp"
              keyboardType="phone-pad"
              value={forme.whatsapp}
              onChangeText={changer('whatsapp')}
            />
          ) : null}
          <Field label="Adresse" value={forme.address} onChangeText={changer('address')} />
          <Field label="Notes" value={forme.notes} onChangeText={changer('notes')} multiline />
          <Button onPress={enregistrer} disabled={!forme.name.trim()} busy={occupe}>
            Enregistrer
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: 16, gap: 12 },
  recherche: {
    minHeight: CIBLE_TACTILE,
    borderWidth: 1,
    borderColor: couleurs.line,
    borderRadius: rayons.md,
    backgroundColor: couleurs.surface,
    paddingHorizontal: 12,
    fontSize: 16,
    color: couleurs.ink,
  },
  liste: { backgroundColor: couleurs.surface, borderRadius: rayons.md, overflow: 'hidden' },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: couleurs.line,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: rayons.full,
    backgroundColor: couleurs.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexte: { fontSize: 16, fontWeight: '800', color: couleurs.blueDark },
  titre: { fontSize: 14, fontWeight: '700', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
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
    backgroundColor: couleurs.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: couleurs.line,
  },
  enteteTitre: { fontSize: 17, fontWeight: '800', color: couleurs.ink },
  formulaire: { padding: 16, gap: 14, paddingBottom: 40 },
});
