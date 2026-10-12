# Signer l'APK de MaQuincaillerie

## Où en est-on

L'APK publié aujourd'hui est signé avec la **clé de débogage livrée par le
modèle Expo** : `android/app/debug.keystore`, alias `androiddebugkey`, mot de
passe `android`. Ce fichier n'est pas propre à ce projet — c'est le même dans
tous les projets Expo, et sa validité court de 2013 à 2052. Vérifié :

```
$ apksigner verify --print-certs .../app-release.apk
Signer #1 certificate DN: CN=Android Debug, OU=Android, O=Unknown
Signer #1 certificate SHA-256 digest: fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
```

Deux conséquences, et il faut les distinguer.

**Ce qui va bien.** La clé étant la même partout, elle est la même d'une
construction à l'autre : les mises à jour s'installent par-dessus les versions
déjà posées, sans désinstallation. Rien n'est cassé aujourd'hui.

**Ce qui ne va pas.** Cette clé est publique. N'importe qui peut construire un
APK qu'Android acceptera comme une mise à jour de MaQuincaillerie, et qui
s'installera par-dessus la vraie sans avertissement. Pour une application qui
tient la caisse d'un commerce et qui se distribue hors du Play Store, la
signature devrait justement être ce qui distingue le fichier du site d'une
copie reçue ailleurs. Elle ne le fait pas.

## Ce qu'il faut faire, et quand

Poser une clé propre à la boutique. Le changement de clé coûte **une
désinstallation-réinstallation sur chaque téléphone déjà équipé** — Android
refuse une mise à jour signée d'une autre clé, avec un message qui n'explique
rien. Aucune donnée n'est perdue : ventes, stock et clients sont sur le
serveur, jamais seulement dans le téléphone.

Ce coût est le même aujourd'hui et dans six mois, mais il se paie sur le
nombre de téléphones équipés. **Avant de diffuser largement l'adresse de
téléchargement** est donc le bon moment.

## Créer la clé, une fois pour toutes

```bash
keytool -genkeypair -v \
  -keystore maquincaillerie.jks \
  -alias maquincaillerie \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=MaQuincaillerie, O=MaQuincaillerie, C=TG"
```

`keytool` demande un mot de passe. Notez-le ailleurs que dans ce dépôt, et
**sauvegardez `maquincaillerie.jks` hors de la machine qui construit** — disque
externe, coffre de mots de passe. Cette clé ne se régénère pas : la perdre,
c'est condamner tous les téléphones équipés à une réinstallation. `-validity
10000` vaut vingt-sept ans ; une clé qui expire fait échouer les mises à jour
aussi sûrement qu'une clé perdue.

## S'en servir

Le greffon `plugins/withSignatureDePublication.js` lit quatre variables
d'environnement. Quand elles sont là, l'APK est signé avec la clé de la
boutique ; sinon la construction le dit dans son journal et retombe sur la clé
de débogage.

```bash
export MAQUINCAILLERIE_KEYSTORE=/chemin/vers/maquincaillerie.jks
export MAQUINCAILLERIE_KEYSTORE_MOT='…'
export MAQUINCAILLERIE_ALIAS=maquincaillerie
export MAQUINCAILLERIE_ALIAS_MOT='…'

cd mobile/android
./gradlew :app:assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
cd ../..
npm run apk:publish
```

Ni le fichier `.jks` ni les mots de passe n'entrent dans le dépôt. Sur une
machine de construction distante, ils se posent en secrets d'environnement.

## Vérifier avant de publier

```bash
apksigner verify --print-certs mobile/android/app/build/outputs/apk/release/app-release.apk
```

`CN=MaQuincaillerie` : c'est la bonne clé. `CN=Android Debug` : c'est encore la
clé publique du modèle Expo.
