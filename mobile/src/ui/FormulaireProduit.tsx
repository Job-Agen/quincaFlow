import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Card, CardHead, Field, Notice } from './index';
import { useSession } from '../lib/session';
import { couleurs, rayons } from '../lib/theme';
import { money } from '@/utils/format';
import { toNumber } from '@/utils/money';
import type { Product } from '@/types';

/**
 * Le formulaire d'un produit, partagé par la création et la modification (§9, §10).
 *
 * Il vit à part parce que les conditionnements doivent se saisir dans les deux
 * cas. Tant qu'ils n'étaient qu'à la création, un produit enregistré sans
 * carton le restait pour toujours — et le gérant ne pouvait plus vendre qu'à la
 * pièce, alors que c'est en gros qu'il écoule son stock.
 *
 * Un facteur est un nombre d'unités de base contenues, jamais un prix divisé :
 * le stock ne se compte qu'en unité de base, et vendre un carton de quarante en
 * sort quarante.
 */
interface Conditionnement {
  label: string;
  factor: string;
  price: string;
}

export interface CorpsProduit {
  name: string;
  sku: string | null;
  baseUnit: string;
  purchasePrice: number;
  sellingPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  units: { label: string; factor: number; price: number }[];
}

export function FormulaireProduit({
  initial,
  libelle,
  montrerStock = true,
  onEnvoyer,
}: {
  initial?: Product;
  libelle: string;
  /** La correction de stock a son propre écran : on ne la redemande pas ici. */
  montrerStock?: boolean;
  onEnvoyer: (corps: CorpsProduit) => Promise<void>;
}) {
  const { currency } = useSession();

  const [nom, setNom] = useState(initial?.name || '');
  const [code, setCode] = useState(initial?.sku || '');
  const [unite, setUnite] = useState(initial?.base_unit || 'pièce');
  const [prixAchat, setPrixAchat] = useState(initial ? String(initial.purchase_price) : '');
  const [prixVente, setPrixVente] = useState(initial ? String(initial.selling_price) : '');
  const [stock, setStock] = useState(initial ? String(initial.stock_quantity) : '');
  const [seuil, setSeuil] = useState(initial ? String(initial.low_stock_threshold) : '');
  // L'unité de base n'est pas un conditionnement : le serveur la remet en tête
  // lui-même, et l'afficher ici inviterait à la modifier deux fois.
  const [emballages, setEmballages] = useState<Conditionnement[]>(
    (initial?.units || [])
      .filter((u) => Number(u.factor) !== 1)
      .map((u) => ({ label: u.label, factor: String(u.factor), price: String(u.price) }))
  );
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  const vente = toNumber(prixVente);
  const achat = toNumber(prixAchat);
  const valide = nom.trim().length > 0 && vente > 0;
  const marge = vente - achat;

  function changer(index: number, champ: keyof Conditionnement, valeur: string) {
    setEmballages((actuels) =>
      actuels.map((e, i) => (i === index ? { ...e, [champ]: valeur } : e))
    );
  }

  async function envoyer() {
    setOccupe(true);
    setSouci(null);
    try {
      await onEnvoyer({
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

        {montrerStock ? (
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
        ) : null}

        <Card>
          <CardHead
            title="Conditionnements"
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ajouter un conditionnement"
                onPress={() => setEmballages((a) => [...a, { label: '', factor: '', price: '' }])}
                hitSlop={8}
              >
                <Ionicons name="add-circle" size={24} color={couleurs.blue} />
              </Pressable>
            }
          />
          <Text style={styles.aide}>
            Pour vendre en gros. Un carton de 40 pièces se déclare avec un facteur de 40 : le stock
            reste compté en {unite || 'unité'}, et vendre un carton en sort quarante.
          </Text>
          {emballages.length === 0 ? (
            <Text style={styles.aide}>
              Aucun pour l’instant — ce produit ne se vend qu’à l’{unite || 'unité'}.
            </Text>
          ) : null}
          {emballages.map((emballage, index) => (
            <View key={index} style={styles.emballage}>
              <View style={styles.entete}>
                <Text style={styles.enteteTexte}>Conditionnement {index + 1}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Retirer le conditionnement ${index + 1}`}
                  onPress={() => setEmballages((a) => a.filter((_, i) => i !== index))}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={19} color={couleurs.red} />
                </Pressable>
              </View>
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

        <Button onPress={envoyer} disabled={!valide} busy={occupe}>
          {libelle}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 40 },
  marge: { fontSize: 13, fontWeight: '700' },
  aide: { fontSize: 12, lineHeight: 18, color: couleurs.muted },
  emballage: { gap: 10, padding: 10, borderRadius: rayons.sm, backgroundColor: couleurs.surface2 },
  entete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  enteteTexte: { fontSize: 12, fontWeight: '700', color: couleurs.muted },
  deux: { flexDirection: 'row', gap: 10 },
});
