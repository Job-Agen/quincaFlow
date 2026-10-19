import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, CardHead, Field, Notice } from './index';
import { useSession } from '../lib/session';
import { api } from '../lib/api';
import { couleurs } from '../lib/theme';
import { confirmsBusinessName } from '@/domain/business';
import { withUnit } from '@/utils/format';

interface Poids {
  businessName: string;
  products: number;
  sales: number;
  customers: number;
  suppliers: number;
  members: number;
}

interface Resume extends Poids {
  accountsRemoved: number;
}

/**
 * Suppression définitive de la boutique (§46).
 *
 * Mêmes verrous que sur le web, pour les mêmes raisons : le gérant voit
 * d'abord le poids de ce qu'il efface, puis donne son mot de passe *et* retape
 * le nom de sa boutique. Le premier arrête un téléphone resté déverrouillé sur
 * le comptoir ; le second arrête le propriétaire lui-même, celui qui a le mot
 * de passe et qui appuie trop vite.
 *
 * Le bloc est replié par défaut : un bouton rouge en permanence sous les yeux
 * finit par ne plus être lu.
 */
export default function ZoneDeDanger() {
  const { profil, fermerSession } = useSession();
  const [ouverte, setOuverte] = useState(false);
  const [poids, setPoids] = useState<Poids | null>(null);
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  const nom = poids?.businessName || profil?.business.name || '';
  const nomConfirme = confirmsBusinessName(confirmation, nom);

  async function ouvrir() {
    setOuverte(true);
    setSouci(null);
    try {
      setPoids(await api.get<Poids>('/api/business'));
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Lecture impossible.');
    }
  }

  async function supprimer() {
    setOccupe(true);
    setSouci(null);
    try {
      await api.delete<Resume>('/api/business', { password: motDePasse, confirmation });
      // La session est close côté serveur ; on vide la nôtre et on repart de
      // l'écran de connexion, plutôt que d'un écran protégé devenu muet.
      await fermerSession();
      router.replace('/login');
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Suppression refusée.');
      setOccupe(false);
    }
  }

  if (!ouverte) {
    return (
      <Card style={{ gap: 10 }}>
        <CardHead title="Zone de danger" />
        <Text style={styles.aide}>
          Supprimer la boutique efface définitivement ses produits, ses ventes, ses clients et ses
          commandes. Rien ne peut être récupéré ensuite.
        </Text>
        <Button variant="danger" onPress={ouvrir}>
          Supprimer ma boutique
        </Button>
      </Card>
    );
  }

  return (
    <Card style={{ gap: 12 }}>
      <CardHead title="Supprimer ma boutique" />
      {souci ? <Notice tone="error">{souci}</Notice> : null}

      <Notice tone="error">
        Cette suppression est définitive. Il n’y a pas de corbeille, et aucune copie n’est
        conservée.
      </Notice>

      {poids ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.aide}>Seront effacés avec « {poids.businessName} » :</Text>
          {/* Les compléments — « et leurs encaissements » — sont dits une fois
            en dessous : par ligne, ils se trompaient d'accord à un seul
            exemplaire. `withUnit` accorde le reste. */}
          <Text style={styles.ligne}>• {withUnit(poids.sales, 'vente')}</Text>
          <Text style={styles.ligne}>• {withUnit(poids.products, 'produit')}</Text>
          <Text style={styles.ligne}>• {withUnit(poids.customers, 'client')}</Text>
          <Text style={styles.ligne}>• {withUnit(poids.suppliers, 'fournisseur')}</Text>
          <Text style={styles.ligne}>
            • {withUnit(poids.members, 'compte')} rattaché à cette boutique
          </Text>
          <Text style={styles.aide}>
            Les encaissements, les mouvements de stock, les ardoises et les commandes fournisseurs
            partent avec.
          </Text>
        </View>
      ) : null}

      <Field
        label="Votre mot de passe"
        secureTextEntry
        value={motDePasse}
        onChangeText={setMotDePasse}
      />
      <Field
        label={`Tapez « ${nom} » pour confirmer`}
        value={confirmation}
        onChangeText={setConfirmation}
      />

      <Button
        variant="danger"
        disabled={!motDePasse || !nomConfirme}
        busy={occupe}
        onPress={supprimer}
      >
        Supprimer définitivement
      </Button>
      <Button
        variant="ghost"
        onPress={() => {
          setOuverte(false);
          setMotDePasse('');
          setConfirmation('');
          setSouci(null);
        }}
      >
        Annuler
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  aide: { fontSize: 12, lineHeight: 18, color: couleurs.muted },
  ligne: { fontSize: 13, lineHeight: 20, color: couleurs.ink2 },
});
