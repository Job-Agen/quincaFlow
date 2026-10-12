import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANDROID_RELEASE,
  androidVersionFor,
  downloadPath,
  fileSize,
  fingerprint,
  supportsEveryPhone,
} from '../release';

/** Espace fine insécable de `toLocaleString('fr-FR')`, ramenée à une espace. */
const normalise = (texte: string) => texte.replace(/[  ]/g, ' ');

describe('taille de fichier', () => {
  it('écrit les petites tailles en octets, sans décimale', () => {
    expect(fileSize(512)).toBe('512 octets');
    expect(fileSize(1023)).toBe('1023 octets');
  });

  it('passe au Kio à 1024 octets, et non à 1000', () => {
    expect(fileSize(1000)).toBe('1000 octets');
    expect(fileSize(1024)).toBe('1 Kio');
  });

  it('écrit un Mio avec une seule décimale, virgule française', () => {
    expect(normalise(fileSize(25272525))).toBe('24,1 Mio');
    // Un compte rond garde sa décimale : « 2 Mio » se lirait comme un arrondi.
    expect(normalise(fileSize(2 * 1024 * 1024))).toBe('2,0 Mio');
  });

  it('sépare les milliers de Kio', () => {
    expect(normalise(fileSize(900 * 1024))).toBe('900 Kio');
  });

  it('ne passe au Mio qu’à 1024 Kio, et non à 1000', () => {
    // Base 1024 de bout en bout : un fichier de 1 020 Kio n'est pas « 1,0 Mio ».
    expect(normalise(fileSize(1020 * 1024))).toBe('1 020 Kio');
    expect(normalise(fileSize(1024 * 1024))).toBe('1,0 Mio');
  });

  it('ne prétend rien d’une taille absurde', () => {
    expect(fileSize(Number.NaN)).toBe('—');
    expect(fileSize(-1)).toBe('—');
  });
});

describe('version Android minimale', () => {
  it('traduit le niveau d’API en version que le gérant lit sur son téléphone', () => {
    expect(androidVersionFor(24)).toBe('7.0');
    expect(androidVersionFor(21)).toBe('5.0');
    expect(androidVersionFor(33)).toBe('13');
  });

  it('rend le numéro brut plutôt qu’un nom inventé', () => {
    expect(androidVersionFor(99)).toBe('API 99');
  });
});

describe('empreinte', () => {
  it('se relit par groupes de huit', () => {
    expect(fingerprint('0123456789abcdef0123456789abcdef')).toBe(
      '01234567 89abcdef 01234567 89abcdef'
    );
  });

  it('ne perd aucun caractère, même sur un reste incomplet', () => {
    const empreinte = fingerprint(ANDROID_RELEASE.sha256);
    expect(empreinte.replace(/ /g, '')).toBe(ANDROID_RELEASE.sha256);
  });
});

/**
 * Le fichier réellement servi.
 *
 * Ces trois contrôles existent parce qu'une page de téléchargement qui annonce
 * une taille ou une empreinte fausse est pire qu'une page sans chiffres : elle
 * donne au gérant un moyen de vérification qui échoue sur un fichier pourtant
 * sain. Si l'APK est reconstruit sans que `npm run apk:publish` soit rejoué,
 * c'est ici que ça se voit.
 */
describe('APK publié', () => {
  const chemin = join(__dirname, '..', '..', '..', 'public', downloadPath(ANDROID_RELEASE));

  it('est bien là où la page l’annonce', () => {
    expect(statSync(chemin).isFile()).toBe(true);
  });

  it('pèse ce que la page annonce', () => {
    expect(statSync(chemin).size).toBe(ANDROID_RELEASE.sizeBytes);
  });

  it('porte l’empreinte que la page annonce', () => {
    const empreinte = createHash('sha256').update(readFileSync(chemin)).digest('hex');
    expect(empreinte).toBe(ANDROID_RELEASE.sha256);
  });

  it('ne tient pour universel qu’un APK qui porte les deux familles', () => {
    const base = { ...ANDROID_RELEASE };
    expect(supportsEveryPhone({ ...base, abis: ['arm64-v8a'] })).toBe(false);
    expect(supportsEveryPhone({ ...base, abis: ['armeabi-v7a'] })).toBe(false);
    expect(supportsEveryPhone({ ...base, abis: ['armeabi-v7a', 'arm64-v8a'] })).toBe(true);
  });

  it('s’installe sur les téléphones 32 bits comme sur les 64 bits', () => {
    // Reconstruire pour `arm64-v8a` seul allège le fichier de six mébioctets —
    // et le rend non installable sur les téléphones d'entrée de gamme encore
    // très répandus. Ce test est là pour que l'économie ne se fasse pas en
    // silence.
    expect(supportsEveryPhone()).toBe(true);
  });

  it('porte un numéro de version qui monte à chaque publication', () => {
    // Android refuse d'installer par-dessus une version de code inférieur ou
    // égal : sans incrément, la mise à jour échoue avec un message que personne
    // ne sait lire.
    expect(ANDROID_RELEASE.versionCode).toBeGreaterThanOrEqual(2);
    expect(ANDROID_RELEASE.fileName).toContain(ANDROID_RELEASE.version);
  });
});
