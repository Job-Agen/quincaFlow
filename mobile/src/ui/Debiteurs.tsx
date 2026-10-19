import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Card, CardHead } from './index';
import { useResource } from '../lib/useResource';
import { useSession } from '../lib/session';
import { couleurs, rayons } from '../lib/theme';
import { money } from '@/utils/format';
import type { RankedDebtor } from '@/domain/credit';

interface Classement {
  debtors: RankedDebtor[];
  totalOwed: number;
  debtorCount: number;
}

/**
 * Classement visuel des principaux débiteurs (§45).
 *
 * Mêmes partis pris que la carte du web, pour les mêmes raisons : une seule
 * teinte — il n'y a qu'une grandeur mesurée —, le nom et le montant écrits sur
 * chaque ligne, et la barre comme simple aide à la comparaison. La plus longue
 * barre vaut la pleine largeur ; c'est `rankDebtors`, partagé avec le web, qui
 * calcule les parts.
 *
 * La carte disparaît quand personne ne doit rien : un bloc vide en tête d'un
 * écran qu'on ouvre vingt fois par jour coûte un défilement et n'apprend rien.
 */
export default function Debiteurs() {
  const { currency } = useSession();
  const { data } = useResource<Classement>('/api/debtors', { limit: 5 });

  if (!data || data.debtors.length === 0) return null;

  return (
    <Card style={styles.carte}>
      <CardHead title="Principaux débiteurs" />
      <Text style={styles.resume}>
        {data.debtorCount === 1 ? '1 client doit' : `${data.debtorCount} clients doivent`}{' '}
        {money(data.totalOwed, currency)} au total.
      </Text>
      {data.debtors.map((debiteur) => (
        <Pressable
          key={debiteur.id}
          accessibilityRole="button"
          onPress={() => router.push(`/customers/${debiteur.id}`)}
          style={styles.ligne}
        >
          <View style={styles.entete}>
            <Text style={styles.nom} numberOfLines={1}>
              {debiteur.name}
            </Text>
            <Text style={styles.montant}>{money(debiteur.owed, currency)}</Text>
          </View>
          <View style={styles.rail}>
            <View style={[styles.barre, { width: `${Math.max(2, debiteur.share * 100)}%` }]} />
          </View>
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  carte: { gap: 10, marginBottom: 12 },
  resume: { color: couleurs.muted, fontSize: 13 },
  ligne: { gap: 6, paddingVertical: 4 },
  entete: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  nom: { flex: 1, fontWeight: '600', color: couleurs.ink },
  montant: { fontWeight: '700', color: couleurs.ink },
  rail: { height: 10, borderRadius: rayons.full, backgroundColor: couleurs.line },
  barre: { height: 10, borderRadius: rayons.full, backgroundColor: couleurs.blue },
});
