import Link from 'next/link';
import Image from 'next/image';
import {
  BookOpen,
  Boxes,
  Download,
  Globe,
  HandCoins,
  LineChart,
  Receipt,
  Truck,
} from 'lucide-react';
import { ANDROID_RELEASE, androidVersionFor, downloadPath, fileSize } from '@/domain/release';

/**
 * Page d'accueil publique (§47).
 *
 * Jusqu'ici la racine renvoyait au tableau de bord, donc — pour qui n'a pas de
 * compte — à l'écran de connexion. Quelqu'un à qui on dicte l'adresse de
 * l'application tombait ainsi sur un formulaire, sans savoir ce qu'elle fait ni
 * comment l'installer. C'était le seul chemin possible, et il ne menait nulle
 * part.
 *
 * Cette page dit trois choses, dans cet ordre : ce que l'application fait, où
 * la télécharger, et comment l'essayer sans rien installer. Rien d'autre — pas
 * de témoignages inventés, pas de chiffres d'adoption. Un gérant qui envisage
 * d'y mettre sa caisse a besoin de savoir ce qu'elle sait faire, pas qu'on le
 * flatte.
 *
 * Elle est servie sans session : on ne demande pas de se connecter pour
 * découvrir l'application qui sert à se connecter. Un gérant déjà connecté est
 * renvoyé à sa boutique (voir `client/routes.ts`).
 */

export const metadata = {
  title: 'MaQuincaillerie — la caisse et le stock de votre quincaillerie',
  description:
    'Ventes au comptoir, stock en sacs et en cartons, carnet de crédit et bons de commande. Sur le téléphone du comptoir comme sur l’ordinateur de l’arrière-boutique.',
};

const CAPACITES: readonly { titre: string; detail: string; icone: typeof Receipt }[] = [
  {
    titre: 'Vendre au comptoir',
    detail:
      'Le panier, la remise, l’encaissement et le reçu en quatre gestes. Le stock se décrémente tout seul, et la facture porte le nom de votre boutique.',
    icone: Receipt,
  },
  {
    titre: 'Compter en sacs et en cartons',
    detail:
      'Un produit se vend à la pièce, au carton ou à la palette, chacun à son prix. L’application affiche « 1 141 pièces (42 cartons + 7) » : le chiffre du rayon, pas celui du logiciel.',
    icone: Boxes,
  },
  {
    titre: 'Tenir l’ardoise',
    detail:
      'Le maçon prend ses sacs le lundi et paie le vendredi. Le carnet de crédit suit ce qu’il doit, encaisse ses remboursements, et classe vos plus gros débiteurs. Un bouton ouvre WhatsApp sur une relance polie.',
    icone: HandCoins,
  },
  {
    titre: 'Commander chez le fournisseur',
    detail:
      'Un bon de commande en A4, imprimable et envoyable par WhatsApp, avec vos coordonnées, les quantités et les prix. Les réceptions ajustent le stock et recalculent le coût moyen.',
    icone: Truck,
  },
  {
    titre: 'Savoir ce qui reste',
    detail:
      'Chiffre d’affaires, marge brute, dépenses, journal de caisse. Et le cahier de recettes pour ce qui entre hors vente : une réparation, une location, une dette remboursée.',
    icone: LineChart,
  },
  {
    titre: 'Vendre ce qu’on n’a pas',
    detail:
      'L’article pris chez un confrère pour satisfaire un client se suit à part, avec sa marge réelle — sans jamais passer par votre stock.',
    icone: BookOpen,
  },
];

export default function AccueilPublic() {
  const apk = ANDROID_RELEASE;

  return (
    <div className="accueil">
      <header className="accueil__hero">
        <div className="accueil__bloc">
          <h1>MaQuincaillerie</h1>
          <p className="accueil__promesse">
            La caisse, le stock et les dettes de votre quincaillerie — sur le téléphone du comptoir
            comme sur l’ordinateur de l’arrière-boutique.
          </p>

          <div className="accueil__actions">
            <a className="btn accueil__bouton" href={downloadPath(apk)} download>
              <Download size={20} />
              Télécharger pour Android ({fileSize(apk.sizeBytes)})
            </a>
            <Link className="btn btn--soft accueil__bouton" href="/register">
              Créer ma boutique
            </Link>
          </div>

          <p className="accueil__mention small">
            Version {apk.version} · Android {androidVersionFor(apk.minSdk)} ou plus récent ·{' '}
            <Link href="/telecharger" className="accueil__lien">
              comment l’installer
            </Link>
          </p>
        </div>
      </header>

      <main className="accueil__corps">
        <section className="accueil__section">
          <h2>Ce qu’elle fait</h2>
          <div className="accueil__grille">
            {CAPACITES.map(({ titre, detail, icone: Icone }) => (
              <article key={titre} className="card card--pad accueil__carte">
                <span className="accueil__icone" aria-hidden="true">
                  <Icone size={20} />
                </span>
                <h3>{titre}</h3>
                <p className="small muted">{detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="accueil__section">
          <h2>À quoi ça ressemble</h2>
          {/*
            Deux captures réelles de l'application, pas des maquettes : celle du
            téléphone est l'écran du comptoir, celle de l'ordinateur est le même
            tableau de bord sur grand écran. Elles servent déjà de vitrine à
            l'installation sur ordinateur (§44), et ne coûtent donc rien de plus.
          */}
          <div className="accueil__apercus">
            <figure>
              <Image
                src="/images/apercu-telephone.png"
                alt="Le catalogue et le stock sur un téléphone"
                width={390}
                height={844}
              />
              <figcaption className="small muted">Au comptoir, sur Android</figcaption>
            </figure>
            <figure>
              <Image
                src="/images/apercu-ordinateur.png"
                alt="Le tableau de bord sur un écran d’ordinateur"
                width={1280}
                height={800}
              />
              <figcaption className="small muted">À l’arrière-boutique, sur ordinateur</figcaption>
            </figure>
          </div>
        </section>

        <section className="accueil__section accueil__essai">
          <h2>L’essayer sans rien installer</h2>
          <p className="small muted">
            L’application fonctionne dans le navigateur, sur ordinateur comme sur téléphone. Le
            compte est le même : ce que vous saisissez au comptoir se retrouve sur l’ordinateur, et
            l’inverse.
          </p>
          <div className="accueil__actions">
            <Link className="btn accueil__bouton" href="/register">
              Créer ma boutique
            </Link>
            <Link className="btn btn--ghost accueil__bouton" href="/login">
              <Globe size={18} />
              J’ai déjà un compte
            </Link>
          </div>
        </section>
      </main>

      <footer className="accueil__pied small muted">
        <Link href="/telecharger" className="accueil__lien">
          Télécharger pour Android
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/login" className="accueil__lien">
          Se connecter
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/register" className="accueil__lien">
          Créer une boutique
        </Link>
      </footer>
    </div>
  );
}
