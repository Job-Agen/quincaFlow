import { useState } from 'react';
import {
  Alert,
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
import type { Member } from '@/types';

/**
 * Équipe de la quincaillerie (§5).
 *
 * Le vendeur a son propre compte : sans cela il travaille sous celui du patron,
 * et l'historique ne peut plus dire qui a encaissé. Le premier mot de passe est
 * fixé ici et remis de vive voix — tant qu'aucun envoi d'e-mail n'est branché,
 * c'est la seule transmission honnête.
 */
export default function Equipe() {
  const { isOwner } = useSession();
  const { data, loading, error, reload } = useResource<Member[]>('/api/members');
  const [ajout, setAjout] = useState(false);
  const [reinitialise, setReinitialise] = useState<Member | null>(null);
  const [souci, setSouci] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  if (loading && !data) return <Chargement />;

  function demanderRetrait(membre: Member) {
    Alert.alert(
      `Retirer ${membre.name} ?`,
      'Son accès sera fermé. Ses ventes passées restent dans l’historique.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: () => void retirer(membre) },
      ]
    );
  }

  async function retirer(membre: Member) {
    setSouci(null);
    try {
      await api.delete(`/api/members/${membre.id}`);
      setFait(`${membre.name} n’a plus accès à la boutique.`);
      reload();
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Retrait impossible.');
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.page}>
        {!isOwner ? (
          <Notice tone="warn">Seul le propriétaire gère les comptes de la boutique.</Notice>
        ) : null}
        {souci ? <Notice tone="error">{souci}</Notice> : null}
        {fait ? <Notice>{fait}</Notice> : null}
        {error ? <Notice tone="error">{error.message}</Notice> : null}

        <Card>
          <CardHead title="Comptes" />
          {(data || []).length === 0 ? (
            <Empty title="Aucun compte" hint="Ajoutez un vendeur pour qu’il ait son accès." />
          ) : (
            (data || []).map((membre) => (
              <View key={membre.id} style={styles.ligne}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nom}>{membre.name}</Text>
                  <Text style={styles.sous}>
                    {membre.email}
                    {membre.phone ? ` · ${membre.phone}` : ''}
                  </Text>
                </View>
                <View
                  style={[
                    styles.role,
                    membre.role === 'OWNER' && { backgroundColor: couleurs.blueSoft },
                  ]}
                >
                  <Text style={styles.roleTexte}>
                    {membre.role === 'OWNER' ? 'Propriétaire' : 'Vendeur'}
                  </Text>
                </View>
                {isOwner && membre.role !== 'OWNER' ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Changer le mot de passe de ${membre.name}`}
                      onPress={() => setReinitialise(membre)}
                      hitSlop={8}
                    >
                      <Ionicons name="key-outline" size={20} color={couleurs.muted} />
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Retirer ${membre.name}`}
                      onPress={() => demanderRetrait(membre)}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={20} color={couleurs.red} />
                    </Pressable>
                  </>
                ) : null}
              </View>
            ))
          )}
        </Card>
      </ScrollView>

      {isOwner ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ajouter un vendeur"
          onPress={() => setAjout(true)}
          style={styles.fab}
        >
          <Ionicons name="person-add" size={24} color="#fff" />
        </Pressable>
      ) : null}

      {ajout ? (
        <FeuilleVendeur
          onFermer={() => setAjout(false)}
          onCree={(nom) => {
            setAjout(false);
            setFait(`Compte créé pour ${nom}. Remettez-lui son mot de passe de vive voix.`);
            reload();
          }}
        />
      ) : null}

      {reinitialise ? (
        <FeuilleMotDePasse
          membre={reinitialise}
          onFermer={() => setReinitialise(null)}
          onFait={(nom) => {
            setReinitialise(null);
            setFait(`Nouveau mot de passe attribué à ${nom}.`);
          }}
        />
      ) : null}
    </View>
  );
}

function Feuille({
  titre,
  onFermer,
  children,
}: {
  titre: string;
  onFermer: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onFermer}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: couleurs.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.entete}>
          <Text style={styles.enteteTitre}>{titre}</Text>
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
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FeuilleVendeur({
  onFermer,
  onCree,
}: {
  onFermer: () => void;
  onCree: (nom: string) => void;
}) {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  const valide = nom.trim() && email.trim() && motDePasse.length >= 8;

  async function creer() {
    setOccupe(true);
    setSouci(null);
    try {
      await api.post('/api/members', {
        name: nom.trim(),
        email: email.trim(),
        phone: telephone.trim() || null,
        password: motDePasse,
      });
      onCree(nom.trim());
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Création impossible.');
      setOccupe(false);
    }
  }

  return (
    <Feuille titre="Nouveau vendeur" onFermer={onFermer}>
      {souci ? <Notice tone="error">{souci}</Notice> : null}
      <Field label="Nom" value={nom} onChangeText={setNom} />
      <Field
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Field
        label="Téléphone"
        value={telephone}
        onChangeText={setTelephone}
        keyboardType="phone-pad"
      />
      <Field
        label="Premier mot de passe"
        hint="Huit caractères au moins. Remettez-le de vive voix ; le vendeur le changera ensuite."
        value={motDePasse}
        onChangeText={setMotDePasse}
        secureTextEntry
      />
      <Button onPress={creer} disabled={!valide} busy={occupe}>
        Créer le compte
      </Button>
    </Feuille>
  );
}

function FeuilleMotDePasse({
  membre,
  onFermer,
  onFait,
}: {
  membre: Member;
  onFermer: () => void;
  onFait: (nom: string) => void;
}) {
  const [motDePasse, setMotDePasse] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  async function attribuer() {
    setOccupe(true);
    setSouci(null);
    try {
      await api.patch(`/api/members/${membre.id}`, { password: motDePasse });
      onFait(membre.name);
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Changement impossible.');
      setOccupe(false);
    }
  }

  return (
    <Feuille titre={`Mot de passe de ${membre.name}`} onFermer={onFermer}>
      {souci ? <Notice tone="error">{souci}</Notice> : null}
      <Field
        label="Nouveau mot de passe"
        hint="Huit caractères au moins."
        value={motDePasse}
        onChangeText={setMotDePasse}
        secureTextEntry
      />
      <Button onPress={attribuer} disabled={motDePasse.length < 8} busy={occupe}>
        Attribuer
      </Button>
    </Feuille>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 90 },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  nom: { fontSize: 14, fontWeight: '700', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
  role: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: rayons.full,
    backgroundColor: couleurs.surface2,
  },
  roleTexte: { fontSize: 11, fontWeight: '700', color: couleurs.ink2 },
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
