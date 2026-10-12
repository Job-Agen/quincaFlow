import fiche from './android-release.json';

/**
 * La version Android publiée sur le site (§44).
 *
 * Les chiffres viennent de `scripts/apk.mjs`, qui les relève sur l'APK
 * lui-même. Ce module ne fait que les présenter : il ne les invente pas, et
 * aucun écran n'a le droit d'en écrire un à la main. C'est la règle qui garde
 * la page de téléchargement honnête quand une version succède à une autre.
 */
export interface AndroidRelease {
  readonly version: string;
  readonly versionCode: number;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  /** Niveau d'API Android minimal, lu dans le manifeste de l'APK. */
  readonly minSdk: number;
  readonly abis: readonly string[];
  readonly publishedOn: string;
}

export const ANDROID_RELEASE: AndroidRelease = fiche;

/** L'adresse publique du fichier, servie par `public/telechargements/`. */
export function downloadPath(release: AndroidRelease = ANDROID_RELEASE): string {
  return `/telechargements/${release.fileName}`;
}

/**
 * Taille lisible : « 24,1 Mio ».
 *
 * Base 1024, comme le gestionnaire de fichiers d'Android : un gérant qui
 * compare ce que la page annonce à ce que son téléphone affiche doit lire le
 * même nombre. Les octets ne prennent pas de décimale — « 512 octets » —, et le
 * mébioctet en prend une seule : la deuxième ne renseigne personne sur le temps
 * que durera le téléchargement.
 */
export function fileSize(bytes: number): string {
  const taille = Number(bytes);
  if (!Number.isFinite(taille) || taille < 0) return '—';
  if (taille < 1024) return `${Math.round(taille)} octets`;
  const kio = taille / 1024;
  if (kio < 1024) return `${Math.round(kio).toLocaleString('fr-FR')} Kio`;
  return `${(kio / 1024).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Mio`;
}

/**
 * Le nom public d'un niveau d'API : 24 → « 7.0 ».
 *
 * Personne ne connaît son numéro d'API ; tout le monde lit sa version dans les
 * paramètres du téléphone. La table s'arrête aux versions qu'un téléphone en
 * service peut porter ; au-delà, on rend le numéro brut plutôt qu'un nom faux.
 */
const VERSIONS_ANDROID: Readonly<Record<number, string>> = {
  21: '5.0',
  22: '5.1',
  23: '6.0',
  24: '7.0',
  25: '7.1',
  26: '8.0',
  27: '8.1',
  28: '9',
  29: '10',
  30: '11',
  31: '12',
  32: '12L',
  33: '13',
  34: '14',
  35: '15',
  36: '16',
};

export function androidVersionFor(minSdk: number): string {
  return VERSIONS_ANDROID[minSdk] ?? `API ${minSdk}`;
}

/**
 * L'empreinte en groupes de huit, pour qu'elle soit relisible.
 *
 * Soixante-quatre caractères d'affilée ne se comparent pas à l'œil ; par
 * groupes, si. Elle sert à vérifier qu'un fichier reçu par WhatsApp est bien
 * celui du site, et non une copie modifiée en chemin.
 */
export function fingerprint(sha256: string): string {
  return (String(sha256).match(/.{1,8}/g) ?? []).join(' ');
}

/**
 * Les deux familles de processeurs qu'un APK couvre, dites en clair.
 *
 * L'APK porte `armeabi-v7a` et `arm64-v8a` : il s'installe donc aussi bien sur
 * les téléphones 32 bits — encore nombreux et bon marché — que sur les 64 bits.
 * C'est la raison pour laquelle il pèse six mébioctets de plus que la version
 * 64 bits seule : un fichier plus petit qui refuse de s'installer ne sert à rien.
 */
export function supportsEveryPhone(release: AndroidRelease = ANDROID_RELEASE): boolean {
  return release.abis.includes('armeabi-v7a') && release.abis.includes('arm64-v8a');
}
