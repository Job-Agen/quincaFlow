import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Card, CardHead, Chargement, Empty, Field, Notice } from '../../src/ui';
import { useResource } from '../../src/lib/useResource';
import { useSession } from '../../src/lib/session';
import { api } from '../../src/lib/api';
import { CIBLE_TACTILE, couleurs, rayons } from '../../src/lib/theme';
import { orderTotal } from '@/domain/purchase';
import { money, withUnit } from '@/utils/format';
import { toNumber } from '@/utils/money';
import type { ContactRow, Product, PurchaseOrderRow } from '@/types';

/**
 * Nouvelle commande fournisseur (§19, §20).
 *
 * **Commander n'est pas posséder.** Cette commande ne crée aucun mouvement de
 * stock : celui-ci n'augmentera qu'à la réception, et à hauteur de ce qui aura
 * réellement été livré (§21, §22). Le total affiché ici est une estimation, et
 * l'écran le dit.
 *
 * `orderTotal` vient du domaine partagé : le total montré au gérant est celui
 * que le serveur enregistrera.
 */
interface Ligne {
  productId: string;
  unitId: string;
  quantite: string;
  cout: string;
}

export default function NouvelleCommande() {
  const router = useRouter();
  const { currency } = useSession();
  const produits = useResource<Product[]>('/api/products');
  const fournisseurs = useResource<ContactRow[]>('/api/suppliers');

  const [fournisseurId, setFournisseurId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [notes, setNotes] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  // Même raison que sur l'écran de vente : sans mémo, la recherche se
  // recalcule à chaque rendu au lieu de chaque frappe.
  const catalogue = useMemo(() => produits.data || [], [produits.data]);

  const visibles = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (!terme) return [];
    return catalogue.filter((p) => p.name.toLowerCase().includes(terme)).slice(0, 8);
  }, [catalogue, recherche]);

  const total = useMemo(
    () => orderTotal(lignes.map((ligne) => ({ quantity: ligne.quantite, unitCost: ligne.cout }))),
    [lignes]
  );

  const valide = Boolean(fournisseurId) && lignes.length > 0 && total >= 0;

  function ajouter(produit: Product) {
    const base = produit.units.find((u) => u.isBase) || produit.units[0];
    if (!base) return;
    setLignes((actuelles) => [
      ...actuelles,
      {
        productId: produit.id,
        unitId: base.id,
        quantite: '1',
        // Le coût connu du produit sert de point de départ : le grossiste a
        // rarement changé ses prix depuis la dernière commande.
        cout: String(produit.purchase_price || ''),
      },
    ]);
    setRecherche('');
  }

  function changer(index: number, champ: 'quantite' | 'cout' | 'unitId', valeur: string) {
    setLignes((actuelles) =>
      actuelles.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l))
    );
  }

  async function enregistrer() {
    setOccupe(true);
    setSouci(null);
    try {
      const commande = await api.post<PurchaseOrderRow>('/api/purchase-orders', {
        supplierId: fournisseurId,
        notes: notes.trim() || null,
        items: lignes.map((ligne) => ({
          productId: ligne.productId,
          unitId: ligne.unitId,
          quantity: toNumber(ligne.quantite),
          unitCost: toNumber(ligne.cout),
        })),
      });
      router.replace(`/purchases/${commande.id}`);
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Enregistrement impossible.');
      setOccupe(false);
    }
  }

  if (produits.loading && !produits.data) return <Chargement />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {souci ? <Notice tone="error">{souci}</Notice> : null}

        <Card>
          <CardHead title="Fournisseur" />
          {(fournisseurs.data || []).length === 0 ? (
            <Empty
              title="Aucun fournisseur"
              hint="Enregistrez d’abord un grossiste depuis Plus → Fournisseurs."
            />
          ) : (
            <View style={styles.pastilles}>
              {(fournisseurs.data || []).map((fournisseur) => (
                <Pressable
                  key={fournisseur.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: fournisseur.id === fournisseurId }}
                  onPress={() => setFournisseurId(fournisseur.id)}
                  style={[
                    styles.pastille,
                    fournisseur.id === fournisseurId && styles.pastilleActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.pastilleTexte,
                      fournisseur.id === fournisseurId && { color: '#fff' },
                    ]}
                  >
                    {fournisseur.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </Card>

        <Card>
          <CardHead title="Produits à commander" />
          <TextInput
            accessibilityLabel="Rechercher un produit"
            placeholder="Rechercher un produit…"
            placeholderTextColor={couleurs.faint}
            value={recherche}
            onChangeText={setRecherche}
            style={styles.recherche}
          />
          {visibles.map((produit) => (
            <Pressable
              key={produit.id}
              accessibilityRole="button"
              accessibilityLabel={`Ajouter ${produit.name}`}
              onPress={() => ajouter(produit)}
              style={styles.resultat}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.titre}>{produit.name}</Text>
                <Text style={styles.sous}>
                  {withUnit(produit.stock_quantity, produit.base_unit)} en stock
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={22} color={couleurs.blue} />
            </Pressable>
          ))}

          {lignes.length === 0 ? (
            <Empty title="Commande vide" hint="Cherchez un produit pour l’ajouter." />
          ) : (
            lignes.map((ligne, index) => {
              const produit = catalogue.find((p) => p.id === ligne.productId);
              if (!produit) return null;
              return (
                <View key={`${ligne.productId}-${index}`} style={styles.ligneCarte}>
                  <View style={styles.ligneEntete}>
                    <Text style={styles.titre}>{produit.name}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Retirer ${produit.name}`}
                      onPress={() => setLignes((a) => a.filter((_, i) => i !== index))}
                      hitSlop={8}
                    >
                      <Ionicons name="close" size={18} color={couleurs.muted} />
                    </Pressable>
                  </View>

                  {produit.units.length > 1 ? (
                    <View style={styles.pastilles}>
                      {produit.units.map((unite) => (
                        <Pressable
                          key={unite.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: unite.id === ligne.unitId }}
                          onPress={() => changer(index, 'unitId', unite.id)}
                          style={[
                            styles.pastille,
                            unite.id === ligne.unitId && styles.pastilleActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.pastilleTexte,
                              unite.id === ligne.unitId && { color: '#fff' },
                            ]}
                          >
                            {unite.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  <View style={styles.deux}>
                    <View style={{ flex: 1 }}>
                      <Field
                        label="Quantité"
                        keyboardType="decimal-pad"
                        value={ligne.quantite}
                        onChangeText={(v) => changer(index, 'quantite', v)}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field
                        label={`Coût unitaire (${currency})`}
                        keyboardType="decimal-pad"
                        value={ligne.cout}
                        onChangeText={(v) => changer(index, 'cout', v)}
                      />
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </Card>

        <Card>
          <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Facultatif" />
          <View style={styles.total}>
            <Text style={styles.totalLibelle}>Total estimé</Text>
            <Text style={styles.totalValeur}>{money(total, currency)}</Text>
          </View>
          <Text style={styles.aide}>
            Une estimation : le stock n’augmentera qu’à la réception, et à hauteur de ce qui aura
            réellement été livré.
          </Text>
        </Card>

        <Button onPress={enregistrer} disabled={!valide} busy={occupe}>
          Enregistrer la commande
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 40 },
  recherche: {
    minHeight: CIBLE_TACTILE,
    borderWidth: 1,
    borderColor: couleurs.line,
    borderRadius: rayons.md,
    paddingHorizontal: 12,
    fontSize: 16,
    color: couleurs.ink,
  },
  resultat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  ligneCarte: {
    gap: 8,
    padding: 10,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.surface2,
  },
  ligneEntete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pastille: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: rayons.full,
    borderWidth: 1,
    borderColor: couleurs.line,
    backgroundColor: couleurs.surface,
  },
  pastilleActive: { backgroundColor: couleurs.blue, borderColor: couleurs.blue },
  pastilleTexte: { fontSize: 12, fontWeight: '700', color: couleurs.ink2 },
  deux: { flexDirection: 'row', gap: 10 },
  titre: { fontSize: 14, fontWeight: '700', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLibelle: { fontSize: 15, fontWeight: '800', color: couleurs.ink },
  totalValeur: { fontSize: 19, fontWeight: '800', color: couleurs.blue },
  aide: { fontSize: 12, lineHeight: 18, color: couleurs.muted },
});
