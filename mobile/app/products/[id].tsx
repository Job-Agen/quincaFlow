import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, CardHead, Chargement, Empty, Field, Notice } from '../../src/ui';
import { useResource } from '../../src/lib/useResource';
import { useSession } from '../../src/lib/session';
import { api } from '../../src/lib/api';
import { couleurs, rayons } from '../../src/lib/theme';
import { MOVEMENT_LABELS } from '@/domain/stock';
import { dateTime, money, quantity, withUnit } from '@/utils/format';
import type { Product, StockMovementRow } from '@/types';

/**
 * Fiche produit (§9, §26).
 *
 * Le stock affiché est un cache ; ce sont les mouvements qui expliquent pourquoi
 * il est passé de 50 à 37. Les montrer ici évite au gérant de deviner — et c'est
 * souvent en les lisant qu'il retrouve la vente oubliée.
 *
 * L'ajustement est réservé au propriétaire (§5) : corriger un stock à la main
 * sans trace serait la porte ouverte au vol.
 */
export default function FicheProduit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currency, isOwner } = useSession();
  const produit = useResource<Product>(id ? `/api/products/${id}` : null);
  const mouvements = useResource<StockMovementRow[]>(id ? `/api/products/${id}/movements` : null);

  const [compte, setCompte] = useState('');
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);

  if (produit.loading && !produit.data) return <Chargement />;
  if (produit.error) {
    return (
      <View style={styles.page}>
        <Notice tone="error">{produit.error.message}</Notice>
      </View>
    );
  }
  const article = produit.data;
  if (!article) return null;

  const compté = Number(compte.replace(',', '.'));
  const valide = compte.trim() !== '' && Number.isFinite(compté) && compté >= 0;
  const ecart = valide ? compté - Number(article.stock_quantity) : 0;

  async function ajuster() {
    setOccupe(true);
    setSouci(null);
    setFait(null);
    try {
      await api.post(`/api/products/${id}/adjust`, { stockQuantity: compté, note: motif || null });
      setCompte('');
      setMotif('');
      setFait('Stock corrigé. Le mouvement est inscrit au journal.');
      produit.reload();
      mouvements.reload();
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Ajustement impossible.');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={styles.nom}>{article.name}</Text>
        {article.sku ? <Text style={styles.sous}>Code : {article.sku}</Text> : null}
        {article.description ? <Text style={styles.sous}>{article.description}</Text> : null}

        <View style={styles.chiffres}>
          <Bloc
            libelle="En stock"
            valeur={withUnit(article.stock_quantity, article.base_unit)}
            alerte={article.stock_quantity <= article.low_stock_threshold}
          />
          <Bloc libelle="Prix de vente" valeur={money(article.selling_price, currency)} />
          {isOwner ? (
            <Bloc libelle="Prix d’achat" valeur={money(article.purchase_price, currency)} />
          ) : null}
        </View>
      </Card>

      <Card>
        <CardHead
          title="Conditionnements"
          action={
            isOwner ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Modifier le produit"
                onPress={() => router.push(`/products/edit/${id}`)}
                hitSlop={8}
              >
                <Text style={styles.lien}>Modifier</Text>
              </Pressable>
            ) : null
          }
        />
        {article.units.map((unite) => (
          <View key={unite.id} style={styles.ligne}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ligneTitre}>{unite.label}</Text>
              <Text style={styles.sous}>
                {unite.isBase
                  ? 'Unité de base'
                  : `${quantity(unite.factor)} ${article.base_unit} par ${unite.label}`}
              </Text>
            </View>
            <Text style={styles.montant}>{money(unite.price, currency)}</Text>
          </View>
        ))}
        {/*
          Un produit sans conditionnement ne se vend qu'à l'unité, et rien ne le
          disait : le gérant croyait l'avoir perdu alors qu'il n'avait jamais été
          saisi. La carte le dit, et donne le chemin pour y remédier.
        */}
        {article.units.length < 2 ? (
          <Text style={styles.aide}>
            Ce produit ne se vend qu’à l’{article.base_unit}. Pour le vendre en gros — carton, sac,
            lot —, ajoutez un conditionnement par « Modifier ».
          </Text>
        ) : null}
      </Card>

      {isOwner ? (
        <Card>
          <CardHead title="Corriger le stock" />
          {souci ? <Notice tone="error">{souci}</Notice> : null}
          {fait ? <Notice>{fait}</Notice> : null}
          <Field
            label={`Quantité comptée en rayon (${article.base_unit})`}
            hint="Saisissez ce que vous avez réellement compté, pas l’écart."
            keyboardType="decimal-pad"
            value={compte}
            onChangeText={setCompte}
          />
          {valide && ecart !== 0 ? (
            <Text style={[styles.ecart, { color: ecart > 0 ? couleurs.greenDark : couleurs.red }]}>
              Écart : {ecart > 0 ? '+' : ''}
              {quantity(ecart)} {article.base_unit}
            </Text>
          ) : null}
          <Field
            label="Motif"
            hint="Casse, erreur de saisie, inventaire… il restera au journal."
            value={motif}
            onChangeText={setMotif}
          />
          <Button onPress={ajuster} disabled={!valide} busy={occupe}>
            Enregistrer la correction
          </Button>
        </Card>
      ) : null}

      <Card>
        <CardHead title="Mouvements de stock" />
        {(mouvements.data || []).length === 0 ? (
          <Empty title="Aucun mouvement" hint="Les entrées et sorties apparaîtront ici." />
        ) : (
          (mouvements.data || []).map((mouvement) => (
            <View key={mouvement.id} style={styles.ligne}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ligneTitre}>
                  {MOVEMENT_LABELS[mouvement.type] || mouvement.type}
                </Text>
                <Text style={styles.sous}>{dateTime(mouvement.created_at)}</Text>
                {mouvement.note ? <Text style={styles.sous}>{mouvement.note}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={[
                    styles.montant,
                    { color: mouvement.quantity < 0 ? couleurs.red : couleurs.greenDark },
                  ]}
                >
                  {mouvement.quantity > 0 ? '+' : ''}
                  {quantity(mouvement.quantity)}
                </Text>
                <Text style={styles.sous}>reste {quantity(mouvement.stock_after)}</Text>
              </View>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function Bloc({ libelle, valeur, alerte }: { libelle: string; valeur: string; alerte?: boolean }) {
  return (
    <View style={[styles.bloc, alerte ? { backgroundColor: couleurs.redSoft } : null]}>
      <Text style={styles.blocLibelle}>{libelle}</Text>
      <Text style={[styles.blocValeur, alerte ? { color: couleurs.red } : null]}>{valeur}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lien: { fontSize: 13, fontWeight: '700', color: couleurs.blue },
  aide: { fontSize: 12, lineHeight: 18, color: couleurs.muted },
  page: { padding: 16, gap: 12, paddingBottom: 40 },
  nom: { fontSize: 18, fontWeight: '800', color: couleurs.ink },
  sous: { fontSize: 12, color: couleurs.muted },
  chiffres: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bloc: {
    flexGrow: 1,
    flexBasis: '30%',
    padding: 10,
    borderRadius: rayons.sm,
    backgroundColor: couleurs.surface2,
    gap: 2,
  },
  blocLibelle: { fontSize: 11, color: couleurs.muted },
  blocValeur: { fontSize: 14, fontWeight: '800', color: couleurs.ink },
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
  },
  ligneTitre: { fontSize: 14, fontWeight: '700', color: couleurs.ink },
  montant: { fontSize: 14, fontWeight: '800', color: couleurs.ink },
  ecart: { fontSize: 13, fontWeight: '700' },
});
