import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, CardHead, Field, Notice } from '../../src/ui';
import { api } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { couleurs, rayons } from '../../src/lib/theme';
import { marginOf } from '@/domain/outOfStock';
import { money } from '@/utils/format';
import { toNumber } from '@/utils/money';
import type { OutOfStockRow } from '@/types';

/**
 * Nouvelle vente hors stock (§16).
 *
 * La marge est calculée par `marginOf`, la fonction du domaine partagée avec le
 * web : quantité × (prix client − coût confrère). Elle s'affiche pendant la
 * saisie, parce que c'est le seul moment où le vendeur peut encore refuser une
 * opération qui ne rapporte rien.
 */
export default function NouvelleVenteHorsStock() {
  const router = useRouter();
  const { currency } = useSession();

  const [produit, setProduit] = useState('');
  const [client, setClient] = useState('');
  const [confrere, setConfrere] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [cout, setCout] = useState('');
  const [prix, setPrix] = useState('');
  const [note, setNote] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  const chiffres = useMemo(
    () => ({
      quantity: toNumber(quantite, 1),
      costPrice: toNumber(cout),
      sellingPrice: toNumber(prix),
    }),
    [quantite, cout, prix]
  );

  const marge = marginOf(chiffres);
  const valide = produit.trim().length > 0 && chiffres.sellingPrice > 0 && chiffres.quantity > 0;

  async function enregistrer() {
    setOccupe(true);
    setSouci(null);
    try {
      const operation = await api.post<OutOfStockRow>('/api/out-of-stock-sales', {
        productName: produit.trim(),
        customerName: client.trim() || null,
        otherSeller: confrere.trim() || null,
        quantity: chiffres.quantity,
        costPrice: chiffres.costPrice,
        sellingPrice: chiffres.sellingPrice,
        note: note.trim() || null,
      });
      router.replace(`/out-of-stock/${operation.id}`);
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Enregistrement impossible.');
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
          <Field
            label="Produit demandé"
            hint="Il n’a pas besoin d’exister dans votre catalogue."
            value={produit}
            onChangeText={setProduit}
            placeholder="Tuyau PVC 100 mm"
          />
          <Field label="Client" value={client} onChangeText={setClient} placeholder="Facultatif" />
          <Field
            label="Récupéré chez"
            value={confrere}
            onChangeText={setConfrere}
            placeholder="Quincaillerie Adjogbé"
          />
        </Card>

        <Card>
          <CardHead title="Chiffres" />
          <Field
            label="Quantité"
            keyboardType="decimal-pad"
            value={quantite}
            onChangeText={setQuantite}
          />
          <Field
            label={`Ce que vous payez au confrère (${currency})`}
            keyboardType="decimal-pad"
            value={cout}
            onChangeText={setCout}
          />
          <Field
            label={`Ce que paie le client (${currency})`}
            keyboardType="decimal-pad"
            value={prix}
            onChangeText={setPrix}
          />

          {chiffres.sellingPrice > 0 ? (
            <View style={[styles.marge, marge < 0 && { backgroundColor: couleurs.redSoft }]}>
              <Text style={styles.margeLibelle}>Votre marge</Text>
              <Text
                style={[
                  styles.margeValeur,
                  { color: marge < 0 ? couleurs.red : couleurs.greenDark },
                ]}
              >
                {money(marge, currency)}
              </Text>
            </View>
          ) : null}
          {marge < 0 ? (
            <Notice tone="warn">
              Vous paieriez le confrère plus cher que le client ne vous paie. Vérifiez les deux
              montants avant d’enregistrer.
            </Notice>
          ) : null}
        </Card>

        <Card>
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Facultatif" />
        </Card>

        <Button onPress={enregistrer} disabled={!valide} busy={occupe}>
          Enregistrer l’opération
        </Button>
        <Text style={styles.aide}>
          L’article ne rejoint pas votre stock : il n’a été acheté que pour cette commande (§17).
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 40 },
  marge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.greenSoft,
  },
  margeLibelle: { fontSize: 14, fontWeight: '700', color: couleurs.ink2 },
  margeValeur: { fontSize: 19, fontWeight: '800' },
  aide: { fontSize: 12, lineHeight: 18, color: couleurs.muted, textAlign: 'center' },
});
