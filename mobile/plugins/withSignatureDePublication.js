const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Signe l'APK de publication avec la clé de la boutique, quand elle existe (§44).
 *
 * Par défaut, `assembleRelease` d'Expo signe avec la clé de *débogage* livrée
 * par le modèle : `android/app/debug.keystore`, alias `androiddebugkey`, mot de
 * passe `android`. Ce n'est pas une clé fabriquée pour ce projet — c'est la
 * même dans tous les projets Expo, et elle est donc publique.
 *
 * L'APK s'installe parfaitement ainsi, et les mises à jour aussi, puisque la
 * clé ne change pas d'une construction à l'autre. Ce qui manque est ailleurs :
 * la signature ne distingue plus le fichier du site d'une copie fabriquée par
 * quelqu'un d'autre, qu'Android installerait pourtant par-dessus comme une
 * mise à jour légitime. Pour une application qui tient la caisse d'un commerce
 * et se distribue hors du Play Store, c'est précisément ce qu'on attendait
 * d'elle.
 *
 * D'où ce greffon. Si les quatre variables d'environnement sont là, la
 * construction signe avec la clé de la boutique, la même à chaque fois, d'où
 * qu'on construise :
 *
 *   MAQUINCAILLERIE_KEYSTORE        chemin du fichier .jks
 *   MAQUINCAILLERIE_KEYSTORE_MOT    mot de passe du magasin
 *   MAQUINCAILLERIE_ALIAS           nom de la clé dans le magasin
 *   MAQUINCAILLERIE_ALIAS_MOT       mot de passe de la clé
 *
 * Sinon, il laisse la clé de débogage et le dit à voix haute dans le journal
 * de construction. Le silence serait le vrai danger : une signature de
 * débogage ne se voit pas sur l'APK produit.
 *
 * Les secrets ne sont ni dans ce dépôt ni dans `app.json` : ils vivent dans
 * l'environnement de construction. Voir `mobile/SIGNATURE.md`.
 */

const BLOC = `
// Ajouté par le greffon withSignatureDePublication : voir mobile/SIGNATURE.md.
def magasinDePublication = System.getenv("MAQUINCAILLERIE_KEYSTORE")
if (magasinDePublication != null && !magasinDePublication.isEmpty() && file(magasinDePublication).exists()) {
    android {
        signingConfigs {
            publication {
                storeFile file(magasinDePublication)
                storePassword System.getenv("MAQUINCAILLERIE_KEYSTORE_MOT")
                keyAlias System.getenv("MAQUINCAILLERIE_ALIAS")
                keyPassword System.getenv("MAQUINCAILLERIE_ALIAS_MOT")
            }
        }
        buildTypes {
            release {
                signingConfig signingConfigs.publication
            }
        }
    }
    println "MaQuincaillerie : APK signé avec la clé de publication."
} else {
    println "MaQuincaillerie : ATTENTION — clé de publication absente."
    println "  L'APK sera signé avec la clé de débogage publique du modèle Expo."
    println "  Voir mobile/SIGNATURE.md."
}
`;

module.exports = function withSignatureDePublication(config) {
  return withAppBuildGradle(config, (résultat) => {
    if (résultat.modResults.language !== 'groovy') {
      throw new Error(
        "withSignatureDePublication : build.gradle n'est pas en Groovy, le bloc de signature n'a pas été posé."
      );
    }
    // Idempotent : `prebuild` rejoué ne doit pas empiler deux fois le bloc.
    if (résultat.modResults.contents.includes('withSignatureDePublication')) return résultat;
    résultat.modResults.contents += BLOC;
    return résultat;
  });
};
