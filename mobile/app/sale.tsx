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
import { Button, Card, CardHead, Chargement, Empty, Notice } from '../src/ui';
import { useResource } from '../src/lib/useResource';
import { useSession } from '../src/lib/session';
import { api } from '../src/lib/api';
import { couleurs, rayons, CIBLE_TACTILE } from '../src/lib/theme';
import { buildSaleLine, totalsOf, baseQuantitiesByProduct } from '@/domain/sale';
import { money, withUnit } from '@/utils/format';
import type { Product, Sale } from '@/types';

/**
 * Vente rapide (§11, §12).
 *
 * **Les calculs sont ceux du web, mot pour mot.** `buildSaleLine` et `totalsOf`
 * sont importés de `src/domain/sale` — le fichier même que couvrent les tests de
 * l'application web. C'est la raison d'être de React Native ici : une seconde
 * implémentation de l'arithmétique des montants divergerait au premier correctif
 * appliqué d'un seul côté, et le total du téléphone ne serait plus celui de la
 * facture.
 *
 * Le serveur rechiffre tout de toute façon (§35) : ce qui est calculé ici sert à
 * montrer un total instantané au vendeur, pas à faire foi.
 */

interface LignePanier {
  productId: string;
  unitId: string;
  quantite: string;
}

export default function VenteRapide() {
  const router = useRouter();
  const { currency } = useSession();
  const { data: produits, loading } = useResource<Product[]>('/api/products');
  const [panier, setPanier] = useState<LignePanier[]>([]);
  const [recherche, setRecherche] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const catalogue = produits || [];

  const visibles = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (!terme) return catalogue.slice(0, 12);
    return catalogue
      .filter(
        (p) => p.name.toLowerCase().includes(terme) || (p.sku || '').toLowerCase().includes(terme)
      )
      .slice(0, 12);
  }, [catalogue, recherche]);

  /**
   * Chiffrage du panier, par le domaine partagé.
   *
   * Une ligne dont le produit a disparu du catalogue est écartée plutôt que
   * chiffrée à zéro : un article offert par accident coûte plus cher qu'une
   * ligne manquante, qui se voit.
   */
  const lignes = useMemo(
    () =>
      panier.flatMap((entree) => {
        const produit = catalogue.find((p) => p.id === entree.productId);
        if (!produit) return [];
        const chiffree = buildSaleLine(
          { unitId: entree.unitId, quantity: entree.quantite },
          produit,
          produit.units
        );
        return [{ entree, produit, chiffree }];
      }),
    [panier, catalogue]
  );

  const totaux = useMemo(() => totalsOf(lignes.map((l) => l.chiffree)), [lignes]);

  /**
   * Produits dont le panier dépasse le stock (§12).
   *
   * La contrainte `stock_quantity >= 0` reste l'arbitre en base, mais laisser le
   * vendeur encaisser puis lui annoncer l'échec, c'est lui faire perdre la vente
   * devant le client. Le panier devance donc le refus.
   */
  const manquants = useMemo(() => {
    const parProduit = baseQuantitiesByProduct(lignes.map((l) => l.chiffree));
    return [...parProduit.entries()].flatMap(([productId, demande]) => {
      const produit = catalogue.find((p) => p.id === productId);
      if (!produit || demande <= produit.stock_quantity) return [];
      return [{ produit, demande }];
    });
  }, [lignes, catalogue]);

  function ajouter(produit: Product) {
    const base = produit.units.find((u) => u.isBase) || produit.units[0];
    if (!base) return;
    setPanier((actuel) => [...actuel, { productId: produit.id, unitId: base.id, quantite: '1' }]);
    setRecherche('');
  }

  function changerQuantite(index: number, quantite: string) {
    setPanier((actuel) => actuel.map((l, i) => (i === index ? { ...l, quantite } : l)));
  }

  function changerUnite(index: number, unitId: string) {
    setPanier((actuel) => actuel.map((l, i) => (i === index ? { ...l, unitId } : l)));
  }

  function retirer(index: number) {
    setPanier((actuel) => actuel.filter((_, i) => i !== index));
  }

  async function valider() {
    setOccupe(true);
    setErreur(null);
    try {
      const vente = await api.post<Sale>('/api/sales', {
        lines: panier.map((l) => ({
          productId: l.productId,
          unitId: l.unitId,
          quantity: l.quantite,
        })),
        paymentMethod: 'CASH',
      });
      setPanier([]);
      setOccupe(false);
      router.replace({ pathname: '/dashboard', params: { vendu: vente.reference } });
    } catch (souci) {
      setErreur(souci instanceof Error ? souci.message : 'La vente n’a pas été enregistrée.');
      setOccupe(false);
    }
  }

  if (loading && !produits) return <Chargement />;

  const validable = lignes.length > 0 && manquants.length === 0 && totaux.total > 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {erreur ? <Notice tone="error">{erreur}</Notice> : null}

        <Card>
          <TextInput
            accessibilityLabel="Rechercher un produit"
            placeholder="Rechercher un produit…"
            placeholderTextColor={couleurs.faint}
            value={recherche}
            onChangeText={setRecherche}
            style={styles.recherche}
          />
          {visibles.length === 0 ? (
            <Empty title="Aucun produit" hint="Vérifiez l’orthographe ou le code." />
          ) : (
            visibles.map((produit) => (
              <Pressable
                key={produit.id}
                accessibilityRole="button"
                accessibilityLabel={`Ajouter ${produit.name}`}
                onPress={() => ajouter(produit)}
                style={styles.resultat}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.ligneTitre}>{produit.name}</Text>
                  <Text style={styles.ligneSous}>
                    {withUnit(produit.stock_quantity, produit.base_unit)} en stock
                  </Text>
                </View>
                <Text style={styles.montant}>{money(produit.selling_price, currency)}</Text>
              </Pressable>
            ))
          )}
        </Card>

        <Card>
          <CardHead title={`Panier · ${lignes.length}`} />
          {lignes.length === 0 ? (
            <Empty title="Panier vide" hint="Touchez un produit pour l’ajouter." />
          ) : (
            lignes.map(({ entree, produit, chiffree }, index) => (
              <View key={`${entree.productId}-${index}`} style={styles.articleCarte}>
                <View style={styles.articleEntete}>
                  <Text style={styles.ligneTitre}>{produit.name}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Retirer ${produit.name}`}
                    onPress={() => retirer(index)}
                    hitSlop={8}
                  >
                    <Text style={styles.retirer}>✕</Text>
                  </Pressable>
                </View>

                {produit.units.length > 1 ? (
                  <View style={styles.unites}>
                    {produit.units.map((unite) => (
                      <Pressable
                        key={unite.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: unite.id === entree.unitId }}
                        onPress={() => changerUnite(index, unite.id)}
                        style={[styles.unite, unite.id === entree.unitId && styles.uniteActive]}
                      >
                        <Text
                          style={[
                            styles.uniteTexte,
                            unite.id === entree.unitId && { color: '#fff' },
                          ]}
                        >
                          {unite.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <View style={styles.articleLigne}>
                  <TextInput
                    accessibilityLabel={`Quantité — ${produit.name}`}
                    keyboardType="decimal-pad"
                    value={entree.quantite}
                    onChangeText={(valeur) => changerQuantite(index, valeur)}
                    style={styles.quantite}
                  />
                  <Text style={styles.multiplie}>× {money(chiffree.unitPrice, currency)}</Text>
                  <Text style={styles.montant}>{money(chiffree.lineTotal, currency)}</Text>
                </View>
              </View>
            ))
          )}

          {manquants.map(({ produit, demande }) => (
            <Notice key={produit.id} tone="error">
              Stock insuffisant — {produit.name} : {withUnit(demande, produit.base_unit)} demandés,{' '}
              {withUnit(produit.stock_quantity, produit.base_unit)} en stock.
            </Notice>
          ))}
        </Card>

        <Card>
          <View style={styles.totalLigne}>
            <Text style={styles.totalLibelle}>Total</Text>
            <Text style={styles.totalMontant}>{money(totaux.total, currency)}</Text>
          </View>
          <Button variant="success" onPress={valider} disabled={!validable} busy={occupe}>
            Valider la vente
          </Button>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 40 },
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
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  articleCarte: {
    gap: 8,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  articleEntete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  articleLigne: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unites: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  unite: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: rayons.full,
    borderWidth: 1,
    borderColor: couleurs.line,
  },
  uniteActive: { backgroundColor: couleurs.blue, borderColor: couleurs.blue },
  uniteTexte: { fontSize: 12, fontWeight: '700', color: couleurs.ink2 },
  quantite: {
    width: 78,
    minHeight: CIBLE_TACTILE,
    borderWidth: 1,
    borderColor: couleurs.line,
    borderRadius: rayons.sm,
    paddingHorizontal: 10,
    fontSize: 16,
    textAlign: 'center',
    color: couleurs.ink,
  },
  multiplie: { flex: 1, fontSize: 13, color: couleurs.muted },
  ligneTitre: { fontSize: 14, fontWeight: '700', color: couleurs.ink },
  ligneSous: { fontSize: 12, color: couleurs.muted },
  montant: { fontSize: 14, fontWeight: '800', color: couleurs.ink },
  retirer: { fontSize: 17, color: couleurs.muted, paddingHorizontal: 4 },
  totalLigne: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLibelle: { fontSize: 16, fontWeight: '800', color: couleurs.ink },
  totalMontant: { fontSize: 20, fontWeight: '800', color: couleurs.blue },
});
