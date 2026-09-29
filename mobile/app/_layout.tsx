import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';
import { SessionProvider, useSession } from '../src/lib/session';
import { Button, Chargement } from '../src/ui';
import { couleurs } from '../src/lib/theme';

/**
 * Coque de l'application (§6, §41).
 *
 * Elle joue le rôle d'`AppShell` côté web, et garde la même règle : tant que la
 * session n'est pas connue, aucun écran protégé n'est monté. Les monter d'abord
 * leur ferait lancer des requêtes vouées au 401, puis les relancer une fois la
 * session établie — deux fois le réseau pour rien, sur précisément le type de
 * connexion que QuincaFlow doit ménager (§35).
 *
 * Les six onglets du §6 vivent dans `(tabs)` ; les écrans de détail — un reçu,
 * une fiche produit, une commande — s'empilent par-dessus et rendent le bouton
 * de retour, comme l'attend un utilisateur d'Android.
 */
const ENTETE = {
  headerStyle: { backgroundColor: couleurs.navy },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '800' as const },
  contentStyle: { backgroundColor: couleurs.bg },
  headerBackTitle: 'Retour',
};

function Garde() {
  const { statut, reessayer } = useSession();
  const segments = useSegments();
  const router = useRouter();

  const premier = segments[0];
  const surEcranPublic = premier === 'login' || premier === 'register';

  useEffect(() => {
    if (statut === 'anonymous' && !surEcranPublic) router.replace('/login');
    if (statut === 'authenticated' && surEcranPublic) router.replace('/dashboard');
  }, [statut, surEcranPublic, router]);

  // Le serveur est injoignable : on le dit, et on n'affiche rien d'autre. Pas de
  // chiffre venu d'un cache, pas de renvoi vers la connexion — la session du
  // gérant est valide, c'est le réseau qui manque (§33).
  if (statut === 'unreachable') {
    return (
      <View style={styles.coupure} accessibilityRole="alert">
        <Text style={styles.coupureTitre}>Pas de connexion</Text>
        <Text style={styles.coupureTexte}>
          Vos chiffres ne peuvent pas être affichés tant que le serveur est injoignable. Rien n’est
          perdu : reconnectez-vous au réseau puis réessayez.
        </Text>
        <View style={{ width: 180 }}>
          <Button onPress={reessayer}>Réessayer</Button>
        </View>
      </View>
    );
  }

  if (statut === 'loading') return <Chargement label="Ouverture de la boutique" />;

  return (
    <Stack screenOptions={ENTETE}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: 'Créer ma boutique' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      <Stack.Screen name="sales/[id]" options={{ title: 'Reçu' }} />
      <Stack.Screen name="products/new" options={{ title: 'Nouveau produit' }} />
      <Stack.Screen name="products/[id]" options={{ title: 'Fiche produit' }} />
      <Stack.Screen name="purchases/new" options={{ title: 'Nouvelle commande' }} />
      <Stack.Screen name="purchases/[id]" options={{ title: 'Commande' }} />
      <Stack.Screen name="out-of-stock/index" options={{ title: 'Ventes hors stock' }} />
      <Stack.Screen name="out-of-stock/new" options={{ title: 'Vente hors stock' }} />
      <Stack.Screen name="out-of-stock/[id]" options={{ title: 'Suivi hors stock' }} />
      <Stack.Screen name="customers" options={{ title: 'Clients' }} />
      <Stack.Screen name="suppliers" options={{ title: 'Fournisseurs' }} />
      <Stack.Screen name="team" options={{ title: 'Équipe' }} />
      <Stack.Screen name="settings" options={{ title: 'Paramètres' }} />
      <Stack.Screen name="reports" options={{ title: 'Rapports financiers' }} />
      <Stack.Screen name="cash" options={{ title: 'Journal de caisse' }} />
      <Stack.Screen name="expenses" options={{ title: 'Dépenses' }} />
    </Stack>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <Garde />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  coupure: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 32,
    backgroundColor: couleurs.surface2,
  },
  coupureTitre: { fontSize: 19, fontWeight: '800', color: couleurs.navy },
  coupureTexte: {
    fontSize: 13,
    lineHeight: 20,
    color: couleurs.ink2,
    textAlign: 'center',
    maxWidth: 320,
  },
});
