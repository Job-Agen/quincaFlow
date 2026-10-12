#!/usr/bin/env node
/**
 * Publie sur le site l'APK Android qui vient d'être construit.
 *
 *   npm run apk:publish
 *
 * Le gérant doit pouvoir installer l'application sans que personne ne lui
 * envoie un fichier à la main : c'est tout l'objet de la page `/telecharger`.
 * Or cette page annonce une version, une taille et une empreinte — trois
 * chiffres qu'on ne peut pas recopier à la main sans finir par en laisser un
 * périmé. Ce script les relève sur le fichier lui-même :
 *
 *   • il copie l'APK dans `public/telechargements/` sous un nom qui porte sa
 *     version, pour qu'une mise à jour ne soit jamais servie depuis le cache
 *     d'un navigateur à la place de la précédente ;
 *   • il supprime les APK des versions antérieures, pour que le dépôt n'en
 *     garde qu'un ;
 *   • il écrit `src/domain/android-release.json`, que la page lit.
 *
 * La version, le code de version, l'ABI et l'Android minimal ne sont pas
 * saisis : ils sont lus dans l'APK, par `aapt2`. Un chiffre qu'on ne saisit pas
 * est un chiffre qui ne peut pas mentir.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(racine, 'mobile/android/app/build/outputs/apk/release/app-release.apk');
const DOSSIER = join(racine, 'public/telechargements');
const FICHE = join(racine, 'src/domain/android-release.json');

/** `aapt2`, où qu'il soit : le SDK Android vient d'être utilisé pour construire. */
function aapt2() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '/opt/android-sdk';
  const outils = join(sdk, 'build-tools');
  let versions = [];
  try {
    versions = readdirSync(outils).sort().reverse();
  } catch {
    versions = [];
  }
  const trouve = versions.map((v) => join(outils, v, 'aapt2')).find((chemin) => {
    try {
      return statSync(chemin).isFile();
    } catch {
      return false;
    }
  });
  if (!trouve) {
    throw new Error(
      `aapt2 est introuvable sous ${outils}. Renseignez ANDROID_HOME : ` +
        "la version et l'Android minimal se lisent dans l'APK, ils ne se devinent pas."
    );
  }
  return trouve;
}

/** Ce que l'APK dit de lui-même. */
function lireApk(chemin) {
  const outil = aapt2();
  const badging = execFileSync(outil, ['dump', 'badging', chemin], { encoding: 'utf8' });
  const manifeste = execFileSync(outil, ['dump', 'xmltree', '--file', 'AndroidManifest.xml', chemin], {
    encoding: 'utf8',
  });
  const version = /versionName='([^']+)'/.exec(badging)?.[1];
  const code = /versionCode='(\d+)'/.exec(badging)?.[1];
  const minSdk = /minSdkVersion\(0x[0-9a-f]+\)=(\d+)/.exec(manifeste)?.[1];
  const abis = [...badging.matchAll(/native-code: (.+)/g)]
    .flatMap((ligne) => [...ligne[1].matchAll(/'([^']+)'/g)].map((m) => m[1]))
    .sort();
  if (!version || !code || !minSdk) {
    throw new Error("L'APK n'annonce ni version ni Android minimal : construction incomplète ?");
  }
  return { version, versionCode: Number(code), minSdk: Number(minSdk), abis };
}

const apk = (() => {
  try {
    return statSync(SOURCE);
  } catch {
    throw new Error(
      `Aucun APK à publier : ${SOURCE} n'existe pas.\n` +
        'Construisez-le d’abord :\n' +
        '  cd mobile/android && ./gradlew :app:assembleRelease ' +
        '-PreactNativeArchitectures=armeabi-v7a,arm64-v8a'
    );
  }
})();

const { version, versionCode, minSdk, abis } = lireApk(SOURCE);
const nomFichier = `MaQuincaillerie-${version}.apk`;
const contenu = readFileSync(SOURCE);

mkdirSync(DOSSIER, { recursive: true });
for (const ancien of readdirSync(DOSSIER)) {
  if (/^MaQuincaillerie-.*\.apk$/.test(ancien) && ancien !== nomFichier) {
    rmSync(join(DOSSIER, ancien));
    console.log(`ancienne version retirée : ${ancien}`);
  }
}
copyFileSync(SOURCE, join(DOSSIER, nomFichier));

const fiche = {
  version,
  versionCode,
  fileName: nomFichier,
  sizeBytes: apk.size,
  sha256: createHash('sha256').update(contenu).digest('hex'),
  minSdk,
  abis,
  publishedOn: new Date().toISOString().slice(0, 10),
};
writeFileSync(FICHE, `${JSON.stringify(fiche, null, 2)}\n`);

console.log(`publié : public/telechargements/${nomFichier}`);
console.log(`version ${version} (code ${versionCode}) · ${(apk.size / 1024 / 1024).toFixed(1)} Mio · Android ${minSdk}+ · ${abis.join(', ')}`);
