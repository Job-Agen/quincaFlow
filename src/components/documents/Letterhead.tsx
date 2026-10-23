import { Store } from 'lucide-react';
import type { BusinessRow } from '@/types';

/**
 * L'en-tête que portent la facture (§15) et le bon de commande (§43).
 *
 * Les deux documents sortent de la boutique : le premier va au client, le
 * second au fournisseur. Ils disent donc la même chose d'elle, et le dire à
 * deux endroits garantissait qu'un ajout n'arrive que dans l'un des deux.
 *
 * Le logo remplace le pictogramme lorsqu'il existe (§51) : une facture qui
 * porte l'enseigne se reconnaît d'un coup d'œil dans une liasse. Le numéro
 * fiscal ferme l'en-tête — sans lui, une entreprise cliente ne peut pas passer
 * la facture en charge, et la renvoie.
 *
 * Centré à l'écran, où la page fait 390 px de large et où une colonne est la
 * seule mise en page possible ; aligné à gauche sur une feuille A4, où il
 * partage la ligne avec le bloc de la pièce (§56). Le basculement est dans la
 * feuille de style d'impression, pas ici : c'est le même en-tête.
 */
export default function Letterhead({ business }: { business: BusinessRow | null | undefined }) {
  return (
    <div className="invoice__brand">
      {business?.logo ? (
        // Balise native plutôt que next/image : une `data:` URL n'a rien à
        // optimiser, et elle est déjà à la taille où elle s'affiche.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="invoice__logo" src={business.logo} alt={`Logo de ${business.name}`} />
      ) : (
        <Store size={30} />
      )}
      <span className="invoice__name">{business?.name}</span>
      {business?.tagline ? <span className="invoice__meta">{business.tagline}</span> : null}
      {business?.address ? <span className="invoice__meta">{business.address}</span> : null}
      {business?.phone ? <span className="invoice__meta">Tél : {business.phone}</span> : null}
      {business?.tax_id ? (
        <span className="invoice__meta">IFU / NIF : {business.tax_id}</span>
      ) : null}
    </div>
  );
}
