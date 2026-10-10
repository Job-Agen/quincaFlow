import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from '../../src/ui';
import { useSession } from '../../src/lib/session';
import { couleurs, rayons, CIBLE_TACTILE } from '../../src/lib/theme';

/**
 * Menu « Plus » (§6).
 *
 * L'ordre du PRD — Clients, Fournisseurs, Paramètres, Déconnexion — augmenté
 * des entrées que le PRD décrit sans les rattacher à une navigation : les ventes
 * hors stock (§16), l'équipe (§5, sans laquelle le rôle vendeur ne pourrait être
 * attribué à personne), et les écrans financiers (§39, §40).
 *
 * Les trois derniers sont réservés au propriétaire : ils donnent les salaires de
 * toute l'équipe et le loyer de la boutique.
 */
interface Entree {
  href: string;
  libelle: string;
  icone: keyof typeof Ionicons.glyphMap;
  /** Réservé au propriétaire (§5). */
  proprietaire?: boolean;
}

const ENTREES: readonly Entree[] = [
  { href: '/reports', libelle: 'Rapports financiers', icone: 'stats-chart', proprietaire: true },
  { href: '/cash', libelle: 'Journal de caisse', icone: 'wallet', proprietaire: true },
  { href: '/expenses', libelle: 'Dépenses', icone: 'card', proprietaire: true },
  // Le cahier du §42 n'est pas réservé au propriétaire : il ne montre ni marge
  // ni prix d'achat, et le vendeur doit pouvoir y inscrire la réparation qu'il
  // vient d'encaisser au comptoir.
  { href: '/income', libelle: 'Cahier de recettes', icone: 'book' },
  { href: '/customers', libelle: 'Clients', icone: 'people' },
  { href: '/suppliers', libelle: 'Fournisseurs', icone: 'business' },
  { href: '/out-of-stock', libelle: 'Ventes hors stock', icone: 'swap-horizontal' },
  { href: '/team', libelle: 'Équipe', icone: 'person-add', proprietaire: true },
  { href: '/settings', libelle: 'Paramètres', icone: 'settings' },
];

export default function Plus() {
  const router = useRouter();
  const { profil, isOwner, fermerSession } = useSession();

  function deconnecter() {
    // Une confirmation, parce que se déconnecter par erreur au comptoir oblige à
    // ressaisir un mot de passe devant un client qui attend.
    Alert.alert('Se déconnecter', 'Voulez-vous fermer votre session ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Se déconnecter', style: 'destructive', onPress: () => void fermerSession() },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Card>
        <View style={styles.profil}>
          <View style={styles.avatar}>
            <Text style={styles.avatarTexte}>
              {(profil?.user.name || 'A').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nom}>{profil?.user.name}</Text>
            <Text style={styles.sous}>{profil?.user.email}</Text>
            <Text style={styles.sous}>
              {profil?.business.name} · {isOwner ? 'Propriétaire' : 'Vendeur'}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={{ padding: 0, gap: 0 }}>
        {ENTREES.filter((entree) => !entree.proprietaire || isOwner).map((entree) => (
          <Pressable
            key={entree.href}
            accessibilityRole="button"
            onPress={() => router.push(entree.href as never)}
            style={styles.ligne}
          >
            <Ionicons name={entree.icone} size={20} color={couleurs.ink2} />
            <Text style={styles.ligneTexte}>{entree.libelle}</Text>
            <Ionicons name="chevron-forward" size={18} color={couleurs.faint} />
          </Pressable>
        ))}
      </Card>

      <Pressable accessibilityRole="button" onPress={deconnecter} style={styles.deconnexion}>
        <Ionicons name="log-out-outline" size={20} color={couleurs.red} />
        <Text style={styles.deconnexionTexte}>Se déconnecter</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 32 },
  profil: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: rayons.full,
    backgroundColor: couleurs.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexte: { fontSize: 19, fontWeight: '800', color: couleurs.blueDark },
  nom: { fontSize: 15, fontWeight: '800', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: CIBLE_TACTILE + 6,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: couleurs.line,
  },
  ligneTexte: { flex: 1, fontSize: 14, fontWeight: '600', color: couleurs.ink },
  deconnexion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: CIBLE_TACTILE,
  },
  deconnexionTexte: { fontSize: 14, fontWeight: '700', color: couleurs.red },
});
