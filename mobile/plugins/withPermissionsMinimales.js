const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Retire les permissions qu'aucun écran n'utilise (§41).
 *
 * Les greffons Expo déclarent les permissions de *toutes* leurs capacités, pas
 * de celles qu'on emploie. `expo-image-picker` sait filmer, donc il demande le
 * micro ; `expo-secure-store` sait s'adosser à l'empreinte, donc il demande le
 * capteur. QuincaFlow ne fait ni l'un ni l'autre.
 *
 * Ce n'est pas de la cosmétique. Un commerçant à qui Android annonce
 * « MaQuincaillerie veut enregistrer l'audio » a raison de refuser d'installer,
 * et il aurait tort de s'habituer à accepter. Une application ne doit demander
 * que ce dont elle se sert — ici : Internet, et la caméra pour photographier un
 * reçu (§40).
 *
 * `tools:node="remove"` est la seule façon d'annuler une permission apportée par
 * une bibliothèque : la fusion des manifestes additionne, elle ne soustrait pas.
 */
const A_RETIRER = [
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.USE_BIOMETRIC',
  'android.permission.USE_FINGERPRINT',
  'android.permission.VIBRATE',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

module.exports = function withPermissionsMinimales(config) {
  return withAndroidManifest(config, (résultat) => {
    const manifeste = résultat.modResults.manifest;

    manifeste.$ = manifeste.$ || {};
    manifeste.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const permissions = (manifeste['uses-permission'] || []).filter(
      (entrée) => !A_RETIRER.includes(entrée.$?.['android:name'])
    );

    A_RETIRER.forEach((nom) => {
      permissions.push({ $: { 'android:name': nom, 'tools:node': 'remove' } });
    });

    manifeste['uses-permission'] = permissions;
    return résultat;
  });
};
