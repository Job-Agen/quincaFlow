import { Badge } from '@/components/ui';
import Letterhead from '@/components/documents/Letterhead';
import { PAYMENT_STATUS_LABELS, paymentLabel } from '@/domain/sale';
import { saleBalance } from '@/domain/credit';
import { montantEnLettres } from '@/domain/lettres';
import { amount, dateTime, money, quantity } from '@/utils/format';
import type { BusinessRow, Sale } from '@/types';

/**
 * La facture, en tant que pièce (§15, §56).
 *
 * Séparée de l'écran qui la montre, comme l'est le bon de commande (§43), et
 * pour la même raison : un document a sa propre forme, qui ne dépend ni de la
 * route qui l'affiche ni de l'état de chargement autour. C'est aussi ce qui le
 * rend vérifiable — un test monte la pièce avec une vente, sans router.
 *
 * Elle sert trois supports : l'écran de téléphone, la feuille A4 et le rouleau
 * thermique (§54). Le balisage est le même partout ; seule la feuille de style
 * d'impression décide de la forme.
 */
export default function InvoiceDocument({
  sale,
  business,
  currency,
}: {
  sale: Sale;
  business: BusinessRow | null | undefined;
  currency: string;
}) {
  const cancelled = sale.status === 'CANCELLED';
  // Ce que le client doit encore : affiché seulement s'il reste quelque chose,
  // un « Reste dû : 0 » sur une facture soldée semant le doute pour rien.
  const reste = saleBalance(sale.total, sale.amount_paid);

  return (
    <article className={`invoice doc${cancelled ? ' invoice--cancelled' : ''}`}>
      {/* Sur une feuille, l'identité tient la gauche et la pièce la
        droite : c'est la forme d'une facture, et le centrage de
        l'écran de téléphone la ferait lire comme un ticket (§56). */}
      <div className="doc__head">
        <Letterhead business={business} />

        <div className="doc__piece">
          <h2 className="invoice__title">FACTURE</h2>
          <dl className="doc__champs">
            <dt>N°</dt>
            <dd>
              <strong>{sale.invoice_reference}</strong>
            </dd>
            <dt>Date</dt>
            <dd>{dateTime(sale.created_at)}</dd>
            <dt>Vente</dt>
            <dd>{sale.reference}</dd>
          </dl>
        </div>
      </div>

      <div className="doc__parties">
        <div className="doc__partie">
          <span className="doc__partie-titre">Facturé à</span>
          <strong>{sale.customer_name || 'Client comptoir'}</strong>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Désignation</th>
              <th className="num">Qté</th>
              {/* La devise est dans l'en-tête et non répétée à chaque
                ligne : vingt fois « FCFA » dans une colonne n'ajoute
                rien et mange la largeur du libellé (§56). */}
              <th className="num">Prix ({currency})</th>
              <th className="num">Total ({currency})</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.product_name}
                  {item.unit_factor > 1 ? (
                    <span className="muted small"> ({item.unit_label})</span>
                  ) : null}
                </td>
                <td className="num">{quantity(item.quantity)}</td>
                <td className="num">{amount(item.unit_price)}</td>
                <td className="num">{amount(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Le décompte tient dans un bloc aligné à droite, où l'œil
        descend du sous-total au reste dû sans chercher (§56). */}
      <div className="doc__totaux">
        {sale.discount > 0 ? (
          <>
            <div className="doc__ligne">
              <span>Sous-total</span>
              <span className="num">{money(sale.subtotal, currency)}</span>
            </div>
            <div className="doc__ligne">
              <span>Remise</span>
              <span className="num">− {money(sale.discount, currency)}</span>
            </div>
          </>
        ) : null}

        <div className="doc__ligne doc__ligne--total">
          <span>TOTAL</span>
          <span className="num">{money(sale.total, currency)}</span>
        </div>

        {reste > 0 ? (
          <>
            <div className="doc__ligne">
              <span>Montant réglé</span>
              <span className="num">{money(sale.amount_paid, currency)}</span>
            </div>
            <div className="doc__ligne doc__ligne--du">
              <span>Reste dû</span>
              <span className="num">{money(reste, currency)}</span>
            </div>
          </>
        ) : null}
      </div>

      {/* « Arrêtée la présente facture à la somme de… » : un chiffre se
        retouche au stylo, une somme en lettres non. C'est cette mention
        que réclame une administration (§56). */}
      {cancelled ? null : (
        <p className="doc__lettres">
          Arrêtée la présente facture à la somme de{' '}
          <strong>{montantEnLettres(sale.total, currency)}</strong>.
        </p>
      )}

      <div className="doc__reglement">
        <span className="muted">
          Règlement : {paymentLabel(sale.payment_method, sale.payment_provider)}
        </span>
        {/*
          Sur une vente annulée, « Payée » en vert affirme quelque chose
          de faux : l'encaissement a été rendu. Le statut d'origine est
          conservé en base, mais la facture n'a plus à s'en prévaloir.
        */}
        {cancelled ? (
          <Badge tone="red">Annulée</Badge>
        ) : (
          <Badge tone={sale.payment_status === 'PAID' ? 'green' : 'amber'}>
            {PAYMENT_STATUS_LABELS[sale.payment_status]}
          </Badge>
        )}
      </div>

      {cancelled ? (
        <p className="invoice__void">
          Facture annulée le {dateTime(sale.updated_at || sale.created_at)}
          {sale.note ? ` — ${sale.note}` : ''}. Ce document ne vaut pas justificatif.
        </p>
      ) : (
        <p className="invoice__thanks">Merci pour votre confiance !</p>
      )}

      {/* Le pied ne s'imprime que sur la feuille : personne ne cherche
        les mentions légales sur un téléphone, et elles pousseraient le
        total sous la ligne de flottaison (§56). */}
      <footer className="doc__pied">
        {business?.name}
        {business?.tax_id ? ` · IFU / NIF : ${business.tax_id}` : ''}
        {business?.phone ? ` · Tél : ${business.phone}` : ''}
        <br />
        {reste > 0
          ? 'Facture payable au comptant. Les marchandises restent la propriété du vendeur jusqu’au règlement intégral.'
          : 'Facture acquittée. Aucun montant ne reste dû.'}
      </footer>
    </article>
  );
}
