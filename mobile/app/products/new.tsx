import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, CardHead, Field, Notice } from '../../src/ui';
import { api } from '../../src/lib/api';
import { useSession } from '../../src/lib/session';
import { couleurs, rayons } from '../../src/lib/theme';
import { money } from '@/utils/format';
import { toNumber } from '@/utils/money';
import type { Product } from '@/types';

/**
 * Nouveau produit (§9, §10).
 *
 * Les conditionnements sont le cœur du métier : la même vitre se vend à la pièce
 * ou par carton de quarante, et le stock n'est compté qu'en unité de base. Un
 * facteur est donc un nombre d'unités de base contenues, jamais un prix divisé.
 */
interface Conditionnement {
  label: string;
  factor: string;
  price: string;
}

export default function NouveauProduit() {
  const router = useRouter();
  const { currency, isOwner } = useSession();

  const [nom, setNom] = useState('');
  const [code, setCode] = useState('');
  const [unite, setUnite] = useState('pièce');
  const [prixAchat, setPrixAchat] = useState('');
  const [prixVente, setPrixVente] = useState('');
  const [stock, setStock] = useState('');
  const [seuil, setSeuil] = useState('');
  const [emballages, setEmballages] = useState<Conditionnement[]>([]);
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  const vente = toNumber(prixVente);
  const achat = toNumber(prixAchat);
  const valide = nom.trim().length > 0 && vente > 0;
  // La marge est montrée pendant la saisie : c'est le moment où le gérant peut
  // encore se rendre compte qu'il vend à perte.
  const marge = vente - achat;

  function ajouterEmballage() {
    setEmballages((actuels) => [...actuels, { label: '', factor: '', price: '' }]);
  }

  function changer(index: number, champ: keyof Conditionnement, valeur: string) {
    setEmballages((actuels) =>
      actuels.map((e, i) => (i === index ? { ...e, [champ]: valeur } : e))
    );
  }

  async function enregistrer() {
    setOccupe(true);
    setSouci(null);
    try {
      const produit = await api.post<Product>('/api/products', {
        name: nom.trim(),
        sku: code.trim() || null,
        baseUnit: unite.trim() || 'pièce',
        purchasePrice: achat,
        sellingPrice: vente,
        stockQuantity: toNumber(stock),
        lowStockThreshold: toNumber(seuil),
        units: emballages
          .filter((e) => e.label.trim() && toNumber(e.factor) > 0)
          .map((e) => ({
            label: e.label.trim(),
            factor: toNumber(e.factor),
            price: toNumber(e.price),
          })),
      });
      router.replace(`/products/${produit.id}`);
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Enregistrement impossible.');
      setOccupe(false);
    }
  }

  if (!isOwner) {
    return (
      <View style={styles.page}>
        <Notice tone="warn">Seul le propriétaire crée un produit et fixe les prix (§5).</Notice>
      </View>
    );
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
            label="Nom du produit"
            value={nom}
            onChangeText={setNom}
            placeholder="Ciment 50 kg"
          />
          <Field
            label="Code / référence"
            hint="Facultatif. Sert à retrouver l’article au comptoir."
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
          />
          <Field
            label="Unité de base"
            hint="Celle dans laquelle le stock est compté : sac, pièce, mètre, kg…"
            value={unite}
            onChangeText={setUnite}
          />
        </Card>

        <Card>
          <CardHead title="Prix" />
          <Field
            label={`Prix d’achat (${currency})`}
            keyboardType="decimal-pad"
            value={prixAchat}
            onChangeText={setPrixAchat}
          />
          <Field
            label={`Prix de vente (${currency})`}
            keyboardType="decimal-pad"
            value={prixVente}
            onChangeText={setPrixVente}
          />
          {vente > 0 && achat > 0 ? (
            <Text style={[styles.marge, { color: marge > 0 ? couleurs.greenDark : couleurs.red }]}>
              {marge > 0
                ? `Marge : ${money(marge, currency)} par ${unite || 'unité'}`
                : `Attention : vous vendriez à perte de ${money(-marge, currency)}`}
            </Text>
          ) : null}
        </Card>

        <Card>
          <CardHead title="Stock" />
          <Field
            label="Quantité en stock"
            keyboardType="decimal-pad"
            value={stock}
            onChangeText={setStock}
          />
          <Field
            label="Seuil d’alerte"
            hint="En dessous, le produit remonte sur le tableau de bord."
            keyboardType="decimal-pad"
            value={seuil}
            onChangeText={setSeuil}
          />
        </Card>

        <Card>
          <CardHead
            title="Conditionnements"
            action={
              <Pressable accessibilityRole="button" onPress={ajouterEmballage} hitSlop={8}>
                <Ionicons name="add-circle" size={24} color={couleurs.blue} />
              </Pressable>
            }
          />
          <Text style={styles.aide}>
            Facultatif. Un carton de 40 pièces se déclare avec un facteur de 40 : le stock reste
            compté en {unite || 'unité'}, et vendre un carton en sort quarante.
          </Text>
          {emballages.map((emballage, index) => (
            <View key={index} style={styles.emballage}>
              <Field
                label="Nom"
                value={emballage.label}
                onChangeText={(v) => changer(index, 'label', v)}
                placeholder="carton"
              />
              <View style={styles.deux}>
                <View style={{ flex: 1 }}>
                  <Field
                    label={`Contient (${unite || 'unités'})`}
                    keyboardType="decimal-pad"
                    value={emballage.factor}
                    onChangeText={(v) => changer(index, 'factor', v)}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label={`Prix (${currency})`}
                    keyboardType="decimal-pad"
                    value={emballage.price}
                    onChangeText={(v) => changer(index, 'price', v)}
                  />
                </View>
              </View>
            </View>
          ))}
        </Card>

        <Button onPress={enregistrer} disabled={!valide} busy={occupe}>
          Enregistrer le produit
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 40 },
  marge: { fontSize: 13, fontWeight: '700' },
  aide: { fontSize: 12, lineHeight: 18, color: couleurs.muted },
  emballage: {
    gap: 10,
    padding: 10,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.surface2,
  },
  deux: { flexDirection: 'row', gap: 10 },
});
