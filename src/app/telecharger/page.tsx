import Link from 'next/link';
import { Download, Globe, ShieldCheck, Smartphone } from 'lucide-react';
import InstallSurCetAppareil from '@/components/download/InstallSurCetAppareil';
import RetourApplication from '@/components/download/RetourApplication';
import {
  ANDROID_RELEASE,
  androidVersionFor,
  downloadPath,
  fileSize,
  fingerprint,
} from '@/domain/release';
import { shortDate } from '@/utils/format';

/**
 * Page publique de téléchargement (§44).
 *
 * Elle existe parce que l'application Android ne passe pas par le Play Store :
 * sans cette page, le seul moyen d'installer MaQuincaillerie serait qu'on envoie
 * le fichier à la main, un gérant à la fois. Une adresse qu'on peut dicter au
 * téléphone — ou écrire sur une facture — remplace cet envoi.
 *
 * Elle est volontairement accessible sans compte : on ne peut pas demander à
 * quelqu'un de se connecter pour obtenir l'application qui sert à se connecter.
 *
 * Tous les chiffres viennent de `android-release.json`, relevé sur l'APK par
 * `scripts/apk.mjs`. Aucun n'est écrit ici.
 */

export const metadata = {
  title: 'Télécharger MaQuincaillerie pour Android',
  description:
    'Installez MaQuincaillerie sur votre téléphone Android, ou utilisez-la directement dans votre navigateur.',
};

const ETAPES: readonly { titre: string; detail: string }[] = [
  {
    titre: 'Appuyez sur le bouton de téléchargement',
    detail:
      'Le navigateur demande parfois de confirmer : répondez « Télécharger ». Comptez environ une minute en 3G.',
  },
  {
    titre: 'Ouvrez le fichier téléchargé',
    detail:
      'Il apparaît dans la barre de notifications, ou dans le dossier « Téléchargements » de votre téléphone.',
  },
  {
    titre: 'Autorisez l’installation',
    detail:
      'Android demande « Autoriser cette source » parce que l’application ne vient pas du Play Store. Appuyez sur « Paramètres », activez l’autorisation, puis revenez en arrière. Si un avertissement « Play Protect » s’affiche, choisissez « Installer quand même ».',
  },
  {
    titre: 'Installez, puis connectez-vous',
    detail:
      'Utilisez le même compte que sur l’ordinateur : c’est la même boutique, les mêmes ventes et le même stock.',
  },
];

export default function TelechargerPage() {
  const apk = ANDROID_RELEASE;

  return (
    <div className="telecharger">
      <header className="telecharger__entete">
        <h1>MaQuincaillerie</h1>
        <p>Ventes, stock et fournisseurs — sur le téléphone du comptoir comme sur l’ordinateur.</p>
      </header>

      <main className="telecharger__corps">
        <section className="card card--pad telecharger__bloc">
          <h2 className="telecharger__titre">
            <Smartphone size={20} /> Sur un téléphone Android
          </h2>

          <a className="btn btn--block telecharger__bouton" href={downloadPath(apk)} download>
            <Download size={20} />
            Télécharger l’application ({fileSize(apk.sizeBytes)})
          </a>

          <p className="small muted telecharger__fiche">
            Version {apk.version} · Android {androidVersionFor(apk.minSdk)} ou plus récent · publiée
            le {shortDate(apk.publishedOn)}
          </p>

          <ol className="telecharger__etapes">
            {ETAPES.map((etape, index) => (
              <li key={etape.titre}>
                <span className="telecharger__numero" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <strong>{etape.titre}</strong>
                  <p className="small muted">{etape.detail}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="small muted">
            Déjà installée ? Cette version remplace la précédente sans rien effacer : vos ventes,
            votre stock et vos clients sont sur le serveur, jamais seulement dans le téléphone.
          </p>
        </section>

        <section className="card card--pad telecharger__bloc">
          <h2 className="telecharger__titre">
            <Globe size={20} /> Sur un ordinateur
          </h2>
          <p className="small muted">
            Rien à installer : l’application fonctionne dans le navigateur, avec un menu latéral et
            des écrans adaptés au grand écran.
          </p>
          <Link className="btn btn--block" href="/login">
            Ouvrir dans le navigateur
          </Link>
          <InstallSurCetAppareil />
        </section>

        <section className="card card--pad telecharger__bloc">
          <h2 className="telecharger__titre">
            <ShieldCheck size={20} /> Vérifier le fichier
          </h2>
          <p className="small muted">
            Si le fichier vous est parvenu autrement que par cette page — par WhatsApp, par exemple
            —, cette empreinte permet de vérifier qu’il n’a pas été modifié en chemin.
          </p>
          <p className="small muted">
            {apk.fileName} · {apk.sizeBytes.toLocaleString('fr-FR')} octets
          </p>
          <code className="telecharger__empreinte">SHA-256 {fingerprint(apk.sha256)}</code>
        </section>
      </main>

      <footer className="telecharger__pied small muted">
        <RetourApplication />
      </footer>
    </div>
  );
}
