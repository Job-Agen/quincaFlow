'use client';

import Link from 'next/link';
import AppBar from '@/components/layout/AppBar';

const TOPICS = [
  [
    'Comment enregistrer une vente ?',
    'Dans Vendre, choisissez un client si nécessaire, ajoutez les produits et saisissez les quantités. Validez la vente, puis indiquez le mode de paiement et le montant reçu. La facture est disponible après enregistrement.',
  ],
  [
    'Comment suivre le stock ?',
    'Dans Produits, utilisez Tous, Stock faible ou Rupture. Ouvrez une fiche pour consulter les conditionnements et les mouvements de stock. Les ventes déduisent les quantités ; les réceptions fournisseurs les ajoutent.',
  ],
  [
    'Comment vendre un produit indisponible ?',
    'Depuis Plus, ouvrez Ventes hors stock. Indiquez le produit, le vendeur, le coût et le prix client. Après enregistrement, avancez les étapes à mesure que le produit est récupéré et les paiements effectués.',
  ],
  [
    'Comment réceptionner une commande ?',
    'Dans Achats, ouvrez la commande et choisissez Marquer comme livrée. Vérifiez les quantités effectivement livrées avant de confirmer. Une livraison partielle conserve le solde à recevoir.',
  ],
  [
    'Comment enregistrer une facture en PDF ?',
    'Ouvrez la facture et choisissez Enregistrer PDF. Dans la fenêtre d’impression de votre navigateur, sélectionnez Enregistrer au format PDF. Vous pouvez aussi imprimer ou partager le récapitulatif de la facture.',
  ],
  [
    'Comment gérer les accès ?',
    'Le propriétaire peut créer et modifier les accès vendeurs depuis Plus, puis Équipe. Contactez-le si vous avez oublié votre mot de passe.',
  ],
];

export default function HelpPage() {
  return (
    <>
      <AppBar back="/more" title="Aide" />
      <main className="page">
        <h2 className="section-title">Comment pouvons-nous vous aider ?</h2>
        <div>
          {TOPICS.map(([title, text]) => (
            <details className="help-topic" key={title}>
              <summary>{title}</summary>
              <p>{text}</p>
            </details>
          ))}
        </div>
        <Link href="/sales/new" className="btn">
          Commencer une vente
        </Link>
      </main>
    </>
  );
}
