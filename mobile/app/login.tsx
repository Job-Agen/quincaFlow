import { useState } from 'react';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Field, Notice } from '../src/ui';
import { signIn } from '../src/lib/api';
import { useSession } from '../src/lib/session';
import { couleurs } from '../src/lib/theme';

/**
 * Connexion (§7).
 *
 * L'identifiant peut être l'e-mail ou le téléphone : au comptoir, le gérant se
 * souvient plus sûrement de son numéro. Le clavier est donc laissé en saisie
 * libre plutôt qu'en mode e-mail, qui masquerait le pavé numérique.
 */
export default function Connexion() {
  const router = useRouter();
  const { ouvrir } = useSession();
  const marges = useSafeAreaInsets();
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const complet = identifiant.trim().length > 0 && motDePasse.length > 0;

  async function connecter() {
    setOccupe(true);
    setErreur(null);
    try {
      ouvrir(await signIn(identifiant.trim(), motDePasse));
    } catch (souci) {
      setErreur(souci instanceof Error ? souci.message : 'Connexion impossible.');
      setOccupe(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.page, { paddingTop: marges.top + 48 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.marque}>
          <Text style={styles.titre}>MaQuincaillerie</Text>
          <Text style={styles.accroche}>Vos ventes, votre stock, vos marges.</Text>
        </View>

        <View style={styles.panneau}>
          {erreur ? <Notice tone="error">{erreur}</Notice> : null}

          <Field
            label="E-mail ou téléphone"
            value={identifiant}
            onChangeText={setIdentifiant}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            placeholder="kossi@exemple.tg"
            returnKeyType="next"
          />
          <Field
            label="Mot de passe"
            value={motDePasse}
            onChangeText={setMotDePasse}
            secureTextEntry
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={() => complet && !occupe && connecter()}
          />

          <Button onPress={connecter} disabled={!complet} busy={occupe}>
            Se connecter
          </Button>

          <Text style={styles.aide}>
            Mot de passe oublié ? Le propriétaire de la boutique peut vous en attribuer un nouveau
            depuis Plus → Équipe.
          </Text>

          <Text
            accessibilityRole="link"
            style={styles.lien}
            onPress={() => router.push('/register')}
          >
            Pas encore de boutique ? En créer une
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 20, gap: 28, backgroundColor: couleurs.navy },
  marque: { alignItems: 'center', gap: 6 },
  titre: { fontSize: 26, fontWeight: '800', color: '#fff' },
  accroche: { fontSize: 14, color: '#cfe0f5' },
  panneau: {
    backgroundColor: couleurs.surface,
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  aide: { fontSize: 12, lineHeight: 18, color: couleurs.muted, textAlign: 'center' },
  lien: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.blue,
    textAlign: 'center',
    paddingVertical: 10,
  },
});
