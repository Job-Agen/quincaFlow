'use client';

import { Coins } from 'lucide-react';
import { Card } from '@/components/ui';
import { useResource } from '@/client/useResource';
import { useSession } from '@/client/session';
import { money, quantity } from '@/utils/format';

interface Valeur {
  atCost: number;
  atRetail: number;
  products: number;
  units: number;
}

/**
 * La valeur du stock (§49).
 *
 * Deux chiffres, et ils ne disent pas la même chose : au coût, c'est l'argent
 * immobilisé dans le magasin — celui qu'on a déjà sorti ; à la vente, c'est ce
 * qu'il rapportera si tout part. L'écart entre les deux est la marge qui dort
 * sur les étagères, et c'est souvent le chiffre qui surprend le plus un gérant
 * qui ne l'a jamais calculé.
 *
 * La carte disparaît quand le stock est vide : « 0 FCFA » en tête d'un écran
 * qu'on ouvre vingt fois par jour n'apprend rien.
 */
export default function ValeurDuStock() {
  const { currency } = useSession();
  const { data } = useResource<Valeur>('/api/products/value');

  if (!data || data.products === 0) return null;

  return (
    <Card pad className="valeur-stock">
      <span className="valeur-stock__icone" aria-hidden="true">
        <Coins size={18} />
      </span>
      <div className="valeur-stock__corps">
        <span className="small muted">
          {quantity(data.products)} article{data.products > 1 ? 's' : ''} en stock
        </span>
        <div className="valeur-stock__chiffres">
          <span>
            <strong className="num">{money(data.atCost, currency)}</strong>
            <span className="small muted"> au coût</span>
          </span>
          <span>
            <strong className="num">{money(data.atRetail, currency)}</strong>
            <span className="small muted"> à la vente</span>
          </span>
        </div>
      </div>
    </Card>
  );
}
