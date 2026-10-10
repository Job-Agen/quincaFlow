import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { Button, Card, CardHead, Field, Notice } from '../src/ui';
import { useSession } from '../src/lib/session';
import { api } from '../src/lib/api';
import { BASE_URL } from '../src/lib/api';
import { couleurs } from '../src/lib/theme';
import type { Profile } from '@/types';

/**
 * Paramètres (§7).
 *
 * Deux choses seulement : les coordonnées qui figurent sur les reçus (§15), et
 * le mot de passe. Changer ce dernier exige l'ancien et ferme les autres
 * sessions — sur un téléphone de comptoir qui passe de main en main, c'est ce
 * qui permet de reprendre le contrôle après un prêt.
 */
export default function Parametres() {
  const { profil, isOwner, fermerSession } = useSession();

  const [nom, setNom] = useState(profil?.business.name || '');
  const [telephone, setTelephone] = useState(profil?.business.phone || '');
  const [adresse, setAdresse] = useState(profil?.business.address || '');
  const [slogan, setSlogan] = useState(profil?.business.tagline || '');
  const [occupeBoutique, setOccupeBoutique] = useState(false);
  const [soucisBoutique, setSoucisBoutique] = useState<string | null>(null);
  const [faitBoutique, setFaitBoutique] = useState<string | null>(null);

  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [occupeMdp, setOccupeMdp] = useState(false);
  const [soucisMdp, setSoucisMdp] = useState<string | null>(null);

  async function enregistrerBoutique() {
    setOccupeBoutique(true);
    setSoucisBoutique(null);
    setFaitBoutique(null);
    try {
      await api.patch<Profile>('/api/business', {
        name: nom.trim(),
        phone: telephone.trim() || null,
        address: adresse.trim() || null,
        tagline: slogan.trim() || null,
      });
      setFaitBoutique('Coordonnées enregistrées. Elles figureront sur vos prochains reçus.');
    } catch (erreur) {
      setSoucisBoutique(erreur instanceof Error ? erreur.message : 'Enregistrement impossible.');
    } finally {
      setOccupeBoutique(false);
    }
  }

  async function changerMotDePasse() {
    setOccupeMdp(true);
    setSoucisMdp(null);
    try {
      await api.patch('/api/auth/password', { currentPassword: ancien, newPassword: nouveau });
      // Le serveur révoque toutes les sessions : la nôtre comprise. Fermer
      // proprement vaut mieux que laisser l'écran suivant échouer en 401.
      await fermerSession();
    } catch (erreur) {
      setSoucisMdp(erreur instanceof Error ? erreur.message : 'Changement impossible.');
      setOccupeMdp(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {isOwner ? (
          <Card>
            <CardHead title="Ma boutique" />
            <Text style={styles.aide}>
              Ces informations apparaissent en tête des reçus remis aux clients.
            </Text>
            {soucisBoutique ? <Notice tone="error">{soucisBoutique}</Notice> : null}
            {faitBoutique ? <Notice>{faitBoutique}</Notice> : null}
            <Field label="Nom de la boutique" value={nom} onChangeText={setNom} />
            <Field
              label="Téléphone"
              value={telephone}
              onChangeText={setTelephone}
              keyboardType="phone-pad"
            />
            <Field label="Adresse" value={adresse} onChangeText={setAdresse} />
            <Field label="Slogan" value={slogan} onChangeText={setSlogan} />
            <Button onPress={enregistrerBoutique} disabled={!nom.trim()} busy={occupeBoutique}>
              Enregistrer
            </Button>
          </Card>
        ) : null}

        <Card>
          <CardHead title="Mon mot de passe" />
          <Text style={styles.aide}>
            Le changer ferme toutes vos sessions, sur ce téléphone comme ailleurs. Vous devrez vous
            reconnecter.
          </Text>
          {soucisMdp ? <Notice tone="error">{soucisMdp}</Notice> : null}
          <Field
            label="Mot de passe actuel"
            value={ancien}
            onChangeText={setAncien}
            secureTextEntry
          />
          <Field
            label="Nouveau mot de passe"
            hint="Huit caractères au moins."
            value={nouveau}
            onChangeText={setNouveau}
            secureTextEntry
          />
          <Button
            onPress={changerMotDePasse}
            disabled={!ancien || nouveau.length < 8}
            busy={occupeMdp}
          >
            Changer le mot de passe
          </Button>
        </Card>

        <Card>
          <CardHead title="À propos" />
          <Text style={styles.aide}>
            MaQuincaillerie 1.0.0 — application Android native.{'\n'}
            Serveur : {BASE_URL}
          </Text>
          <Text style={styles.aide}>
            L’application a besoin du réseau : les totaux sont calculés sur le serveur, et un
            chiffre affiché hors ligne serait un chiffre périmé présenté comme certain.
          </Text>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 40 },
  aide: { fontSize: 12, lineHeight: 18, color: couleurs.muted },
});
