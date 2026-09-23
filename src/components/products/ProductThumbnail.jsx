import { Package } from 'lucide-react';

// Illustrations de catégories : elles ne représentent pas une référence fabricant.
const CATEGORIES = [
  [/ciment/i, 'cement'],
  [/serrure|cadenas/i, 'lock'],
  [/vitre|verre/i, 'glass'],
  [/peinture/i, 'paint'],
  [/\bvis\b|boulon/i, 'screws'],
  [/perceuse|visseuse/i, 'drill'],
];

export default function ProductThumbnail({ name = '' }) {
  const category = CATEGORIES.find(([pattern]) => pattern.test(name))?.[1];
  return (
    <span
      className={`thumb product-thumb${category ? ` product-thumb--${category}` : ''}`}
      aria-hidden="true"
    >
      {!category ? <Package size={26} /> : null}
    </span>
  );
}
