import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Card, CardHead, Chargement, Empty, Field, Notice } from '../../src/ui';
import { useResource } from '../../src/lib/useResource';
import { useSession } from '../../src/lib/session';
import { api } from '../../src/lib/api';
import { CIBLE_TACTILE, couleurs, rayons } from '../../src/lib/theme';
import { reminderMessage, saleBalance, tooMuch, whatsappLink } from '@/domain/credit';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@/domain/sale';
import { amount, dateTime, money, shortDate } from '@/utils/format';
import { toNumber } from '@/utils/money';
import type { CustomerAccount, PaymentMethod } from '@/types';

/**
 * Fiche client et carnet de crédit (§45).
 *
 * C'est l'écran de la relance : sur le téléphone du gérant, WhatsApp est à un
 * geste, et c'est là que la dette se réclame. Il répond dans l'ordre aux trois
 * questions posées devant un client qui entre — combien me doit-il, depuis
 * quand, qu'a-t-il acheté ?
 */
export default function FicheClient() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { currency, profil } = useSession();
  const { data, loading, error, reload } = useResource<CustomerAccount>(
    id ? `/api/customers/${id}/account` : null
  );
  const [encaisse, setEncaisse] = useState(false);

  if (loading && !data) return <Chargement label="Ouverture de la fiche" />;
  if (error) {
    return (
      <View style={styles.page}>
        <Notice tone="error">{error.message}</Notice>
      </View>
    );
  }
  if (!data) return null;

  const client = data.customer;
  const impayees = data.sales.filter(
    (vente) => vente.status === 'COMPLETED' && saleBalance(vente.total, vente.amount_paid) > 0
  );
  const relance = whatsappLink(
    client.phone,
    reminderMessage({
      customerName: client.name,
      businessName: profil?.business?.name || 'la quincaillerie',
      owed: data.owed,
      currency,
      openCount: data.openCount,
    })
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Card style={styles.identite}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTexte}>{client.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nom}>{client.name}</Text>
          <Text style={styles.sous}>{client.phone || 'Sans téléphone'}</Text>
        </View>
      </Card>

      <View style={styles.tuiles}>
        <View style={[styles.tuile, { backgroundColor: couleurs.blueSoft }]}>
          <Text style={styles.tuileLibelle}>Total acheté</Text>
          <Text style={styles.tuileValeur}>{amount(data.spent, 0)}</Text>
          <Text style={styles.tuileUnite}>{currency}</Text>
        </View>
        <View
          style={[
            styles.tuile,
            { backgroundColor: data.owed > 0 ? couleurs.amberSoft : couleurs.greenSoft },
          ]}
        >
          <Text style={styles.tuileLibelle}>Solde dû</Text>
          <Text style={styles.tuileValeur}>{amount(data.owed, 0)}</Text>
          <Text style={styles.tuileUnite}>{currency}</Text>
        </View>
      </View>

      {data.owed > 0 ? (
        <>
          <Text style={styles.sous}>
            {data.openCount === 1 ? 'Un achat non soldé' : `${data.openCount} achats non soldés`}
            {data.oldestOpenAt ? `, le plus ancien du ${shortDate(data.oldestOpenAt)}` : ''}.
          </Text>

          {encaisse ? (
            <Remboursement
              clientId={String(id)}
              owed={data.owed}
              currency={currency}
              onFerme={() => setEncaisse(false)}
              onEnregistre={() => {
                setEncaisse(false);
                reload();
              }}
            />
          ) : (
            <Button onPress={() => setEncaisse(true)}>Enregistrer un remboursement</Button>
          )}

          {relance ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => Linking.openURL(relance)}
              style={styles.whatsapp}
            >
              <Ionicons name="logo-whatsapp" size={20} color="#fff" />
              <Text style={styles.whatsappTexte}>Relancer sur WhatsApp</Text>
            </Pressable>
          ) : (
            <Text style={styles.sous}>
              Ajoutez un numéro de téléphone à la fiche pour pouvoir relancer par WhatsApp.
            </Text>
          )}
        </>
      ) : (
        <Notice tone="info">Ce client ne doit rien.</Notice>
      )}

      {impayees.length ? (
        <Card style={{ gap: 10 }}>
          <CardHead title="Achats non soldés" />
          {impayees.map((vente) => (
            <View key={vente.id} style={styles.ligne}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ligneTitre}>#{vente.reference}</Text>
                <Text style={styles.sous}>
                  {shortDate(vente.created_at)} · {money(vente.amount_paid, currency)} réglés sur{' '}
                  {money(vente.total, currency)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.ligneMontant}>
                  {money(saleBalance(vente.total, vente.amount_paid), currency)}
                </Text>
                <Text style={styles.etiquette}>{PAYMENT_STATUS_LABELS[vente.payment_status]}</Text>
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        <CardHead title="Versements" />
        {data.payments.length === 0 ? (
          <Empty title="Aucun versement" hint="Les encaissements de ce client apparaîtront ici." />
        ) : (
          data.payments.map((versement) => (
            <View key={versement.id} style={styles.ligne}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ligneTitre}>
                  {versement.kind === 'REPAYMENT' ? 'Remboursement' : 'Payé au comptoir'} ·{' '}
                  {versement.sale_reference}
                </Text>
                <Text style={styles.sous}>
                  {dateTime(versement.created_at)} · {PAYMENT_METHOD_LABELS[versement.method]}
                </Text>
                {versement.note ? <Text style={styles.sous}>{versement.note}</Text> : null}
              </View>
              <Text style={styles.ligneMontant}>{money(versement.amount, currency)}</Text>
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

/**
 * Saisie d'un remboursement.
 *
 * Le gérant saisit une somme, jamais une répartition : le serveur impute à la
 * plus vieille ardoise d'abord. « Tout solder » existe parce que c'est le cas
 * le plus fréquent, et parce que retaper 47 500 de tête est le meilleur moyen
 * de taper 4 750.
 */
function Remboursement({
  clientId,
  owed,
  currency,
  onFerme,
  onEnregistre,
}: {
  clientId: string;
  owed: number;
  currency: string;
  onFerme: () => void;
  onEnregistre: () => void;
}) {
  const [montant, setMontant] = useState('');
  const [methode, setMethode] = useState<PaymentMethod>('CASH');
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [souci, setSouci] = useState<string | null>(null);

  const verse = toNumber(montant);
  const excessif = verse > 0 && tooMuch(verse, owed);
  const reste = Math.max(0, owed - verse);

  async function enregistrer() {
    setOccupe(true);
    setSouci(null);
    try {
      await api.post(`/api/customers/${clientId}/repayments`, {
        amount: verse,
        method: methode,
        note: motif,
      });
      onEnregistre();
    } catch (erreur) {
      setSouci(erreur instanceof Error ? erreur.message : 'Remboursement refusé.');
      setOccupe(false);
    }
  }

  return (
    <Card style={{ gap: 12 }}>
      <CardHead title="Remboursement" />
      {souci ? <Notice tone="error">{souci}</Notice> : null}

      <Field
        label={`Montant reçu (${currency})`}
        keyboardType="numeric"
        value={montant}
        onChangeText={setMontant}
      />
      <Button variant="ghost" onPress={() => setMontant(String(owed))}>
        {`Tout solder · ${money(owed, currency)}`}
      </Button>

      {excessif ? (
        <Notice tone="warn">
          {`Ce versement dépasse la dette. Saisissez au plus ${money(owed, currency)}.`}
        </Notice>
      ) : verse > 0 ? (
        <Text style={styles.sous}>
          {reste > 0 ? `Restera ${money(reste, currency)} à régler.` : 'La dette sera soldée.'}
        </Text>
      ) : null}

      <Text style={styles.libelle}>Reçu en</Text>
      <View style={styles.choix}>
        {PAYMENT_METHODS.map((possible) => (
          <Pressable
            key={possible}
            accessibilityRole="button"
            accessibilityState={{ selected: possible === methode }}
            onPress={() => setMethode(possible)}
            style={[styles.puce, possible === methode && styles.puceActive]}
          >
            <Text style={[styles.puceTexte, possible === methode && styles.puceTexteActif]}>
              {PAYMENT_METHOD_LABELS[possible]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Field
        label="Motif (facultatif)"
        placeholder="Vente de sa récolte, avance sur chantier…"
        value={motif}
        onChangeText={setMotif}
      />

      <Button disabled={occupe || verse <= 0 || excessif} onPress={enregistrer}>
        {occupe ? 'Enregistrement…' : 'Enregistrer le remboursement'}
      </Button>
      <Button variant="ghost" onPress={onFerme}>
        Annuler
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 40 },
  identite: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: rayons.full,
    backgroundColor: couleurs.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexte: { fontWeight: '800', fontSize: 19, color: couleurs.navy },
  nom: { fontWeight: '700', fontSize: 16, color: couleurs.ink },
  sous: { color: couleurs.muted, fontSize: 13 },
  libelle: { color: couleurs.ink2, fontWeight: '600', fontSize: 13 },
  tuiles: { flexDirection: 'row', gap: 12 },
  tuile: { flex: 1, borderRadius: rayons.lg, padding: 14, gap: 2 },
  tuileLibelle: { color: couleurs.ink2, fontWeight: '600', fontSize: 12 },
  tuileValeur: { fontWeight: '800', fontSize: 22, color: couleurs.ink },
  tuileUnite: { color: couleurs.ink2, fontSize: 12 },
  whatsapp: {
    minHeight: CIBLE_TACTILE,
    borderRadius: rayons.md,
    backgroundColor: '#1f8f4e',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  whatsappTexte: { color: '#fff', fontWeight: '700', fontSize: 15 },
  ligne: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: couleurs.line,
    paddingTop: 10,
  },
  ligneTitre: { fontWeight: '600', color: couleurs.ink },
  ligneMontant: { fontWeight: '700', color: couleurs.ink },
  etiquette: { color: couleurs.amber, fontSize: 12, fontWeight: '600' },
  choix: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puce: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: rayons.full,
    backgroundColor: couleurs.surface2,
    borderWidth: 1,
    borderColor: couleurs.line,
  },
  puceActive: { backgroundColor: couleurs.blue, borderColor: couleurs.blue },
  puceTexte: { color: couleurs.ink2, fontWeight: '600', fontSize: 13 },
  puceTexteActif: { color: '#fff' },
});
