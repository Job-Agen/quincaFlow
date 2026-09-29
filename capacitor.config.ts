import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Emballage Android de QuincaFlow (§38).
 *
 * Le §38 retient la PWA comme forme d'installation, et prévoit explicitement
 * qu'« un emballage natif (Capacitor ou équivalent) reste possible plus tard :
 * la PWA en est la base, pas un détour ». C'est exactement ce que fait ce
 * fichier — il ne remplace pas l'installation depuis un lien, il l'ajoute pour
 * les téléphones où le commerçant préfère un APK reçu par WhatsApp.
 *
 * **L'application n'est pas embarquée dans l'APK, et ne peut pas l'être.**
 * QuincaFlow est une application Next.js dont les routes `/api` calculent les
 * totaux côté serveur (§35) et parlent à Postgres. Empaqueter les écrans sans
 * leur serveur donnerait une coquille incapable d'enregistrer une vente. L'APK
 * est donc un lanceur : il ouvre l'application hébergée, en plein écran, sans
 * barre d'adresse.
 *
 * La conséquence est à connaître avant de distribuer l'APK : il ne fonctionne
 * que si `server.url` répond. Ce n'est pas une régression par rapport à la PWA,
 * qui a la même dépendance (§33) — mais il ne faut pas croire tenir là une
 * version hors ligne.
 *
 * `QUINCA_APP_URL` permet de viser une préproduction sans modifier ce fichier.
 */
const url = process.env.QUINCA_APP_URL || 'https://quincaflow.vercel.app';

const config: CapacitorConfig = {
  appId: 'tg.quincaflow.app',
  appName: 'MaQuincaillerie',
  // Capacitor exige un dossier web même lorsqu'on charge une URL distante : il y
  // place la page de repli affichée si le serveur ne répond pas.
  webDir: 'android-shell',
  android: {
    // Les écrans sont déjà lisibles en clair ; forcer le thème sombre du système
    // sur une interface conçue en blanc donnerait des montants illisibles.
    backgroundColor: '#ffffff',
  },
  server: {
    url,
    // Sans cela, la WebView refuse les cookies de session posés par le serveur
    // distant : le gérant serait déconnecté à chaque ouverture (§7).
    androidScheme: 'https',
    cleartext: false,
  },
};

export default config;
