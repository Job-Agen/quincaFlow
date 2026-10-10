import { useState } from 'react';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, Field, Notice } from '../src/ui';
import { api, storeSession } from '../src/lib/api';
import { useSession } from '../src/lib/session';
import { couleurs } from '../src/lib/theme';
import type { IssuedTokens, Profile } from '@/types';

/**
 * Création d'une boutique (§7).
 *
 * L'inscription crée d'un coup le compte, la quincaillerie et le lien de
 * propriété, dans une seule transaction côté serveur : un compte sans boutique
 * ne mènerait nulle part, et une boutique sans propriétaire serait inaccessible.
 */
export default function Inscription() {
  const router = useRouter();
  const { ouvrir } = useSession();

  const [gerant, setGerant] = useState('');
  const [boutique, setBoutique] = useState('');
  const [email, setEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  const valide =
    gerant.trim() && boutique.trim() && email.trim().includes('@') && motDePasse.length >= 8;

  async function creer() {
    setOccupe(true);
    setSouci(null);
    try {
      const session = await api.post<Profile & { tokens?: IssuedTokens }>('/api/auth/register', {
        ownerName: gerant.trim(),
        businessName: boutique.trim(),
        email: email.trim(),
        phone: telephone.trim() || null,
        password: motDePasse,
      });
      if (!session.tokens) throw new Error('Le serveur n’a pas ouvert de session.');
      await storeSession(session.tokens);
      ouvrir(session);
      router.replace('/dashboard');
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Création impossible.');
      setOccupe(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {souci ? <Notice tone="error">{souci}</Notice> : null}

        <Card>
          <Field label="Votre nom" value={gerant} onChangeText={setGerant} />
          <Field
            label="Nom de la quincaillerie"
            value={boutique}
            onChangeText={setBoutique}
            placeholder="Quincaillerie Adjo"
          />
          <Field
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Field
            label="Téléphone"
            hint="Facultatif. Il pourra servir d’identifiant de connexion."
            value={telephone}
            onChangeText={setTelephone}
            keyboardType="phone-pad"
          />
          <Field
            label="Mot de passe"
            hint="Huit caractères au moins."
            value={motDePasse}
            onChangeText={setMotDePasse}
            secureTextEntry
          />
          <Button onPress={creer} disabled={!valide} busy={occupe}>
            Créer ma boutique
          </Button>
        </Card>

        <Text style={styles.aide}>
          Vous serez propriétaire de la boutique : vous seul pourrez fixer les prix, commander chez
          un fournisseur et consulter les résultats financiers. Vos vendeurs auront leur propre
          compte, créé depuis Plus → Équipe.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  aide: { fontSize: 12, lineHeight: 18, color: couleurs.muted },
});
