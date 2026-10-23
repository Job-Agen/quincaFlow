import { getSql, one } from '../lib/db';
import { badRequest, notFound } from '../lib/http';
import { email as champEmail } from '../lib/validate';
import { getSale } from './sales';
import { envoyerMail } from './mail';
import { planFacture } from '../domain/facturePdf';
import { tracerFacture } from '../domain/tracePdf';
import { money } from '../utils/format';
import { saleBalance } from '../domain/credit';
import type { BusinessRow, Session } from '@/types';

/**
 * La facture par courriel (§57).
 *
 * Le PDF est fabriqué ici, par le même plan que celui du téléphone : c'est la
 * seule façon que la pièce jointe d'un courriel et celle d'un partage WhatsApp
 * restent identiques quand la mise en page changera.
 *
 * Le corps du message reste court. Ce n'est pas là que le client lit sa
 * facture — elle est jointe — et un message long passe plus facilement pour un
 * courriel indésirable.
 */
export async function emailSale(session: Session, saleId: string, destinataire: string) {
  const adresse = champEmail(destinataire);
  const sale = await getSale(session.businessId, saleId);

  const business = one<BusinessRow>(
    await getSql()`
      SELECT id, name, phone, address, tagline, tax_id, logo, currency
        FROM businesses WHERE id = ${session.businessId}
    `
  );
  if (!business) throw notFound('Boutique introuvable.');

  if (sale.status === 'CANCELLED') {
    // Envoyer une facture annulée ferait croire à une créance : le gérant doit
    // écrire lui-même s'il veut prévenir son client.
    throw badRequest('Cette vente est annulée : sa facture ne peut pas être envoyée.');
  }

  const currency = business.currency || 'FCFA';
  const octets = await tracerFacture(planFacture(sale, business, currency));
  const reste = saleBalance(sale.total, sale.amount_paid);

  const texte = [
    `Bonjour ${sale.customer_name || ''}`.trim(),
    '',
    `Veuillez trouver ci-joint la facture ${sale.invoice_reference} d'un montant de ${money(sale.total, currency)}.`,
    reste > 0 ? `Il reste ${money(reste, currency)} à régler.` : 'Cette facture est acquittée.',
    '',
    business.name,
    business.phone || '',
  ]
    .filter((ligne) => ligne !== null)
    .join('\n')
    .trim();

  await envoyerMail({
    a: adresse,
    sujet: `Facture ${sale.invoice_reference} — ${business.name}`,
    texte,
    repondreA: null,
    pieces: [
      {
        nom: `${sale.invoice_reference}.pdf`,
        contenu: Buffer.from(octets).toString('base64'),
      },
    ],
  });

  return { sent: true, to: adresse, reference: sale.invoice_reference };
}
