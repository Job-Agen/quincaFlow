# Interface du prototype MaQuincaillerie

Les dix écrans de référence sont repris dans les routes existantes : connexion, accueil, nouvelle vente, facture, catalogue, vente hors stock, nouvelle commande, détail de commande, historique et Plus. Les écrans complémentaires partagent les mêmes couleurs, champs, cartes et boutons. Sur ordinateur, la navigation latérale reste disponible.

Les calculs, l'authentification, les permissions et les écritures métier utilisent les services existants. Les chiffres du prototype ne sont pas intégrés aux pages : les montants affichés viennent de l'API.

## Choix d'interface

- Panier en colonnes sur mobile, avec conditionnements, contrôles de stock et suppression conservés.
- Commande fournisseur compacte ; coût et conditionnement modifiables dans le détail de chaque ligne.
- Détail de commande : produits/quantités, documents, réception ; le suivi détaillé et le statut administratif sont dans un volet dépliable. La réception exige toujours les quantités réellement livrées.
- Historique : ventes par défaut, autres types et périodes disponibles dans les filtres. Le badge « Validée » indique le statut de vente fourni par cette API, pas un paiement supposé.
- Actions de facture : WhatsApp ouvre un message prérempli ; PDF utilise la boîte d'impression du navigateur (« Enregistrer au format PDF ») ; impression séparée.
- Google et scan ne sont pas affichés : aucune intégration OAuth ou caméra n'existe dans ce dépôt. Le lien « Mot de passe oublié ? » explique la récupération réellement disponible.
- Les accès supplémentaires (équipe, historique, hors stock) restent dans Plus. Rapports utilise les données réelles du tableau de bord ; Aide décrit les parcours existants.
- Les visuels WebP sont générés pour l'interface. Les images du catalogue sont des illustrations génériques de catégories, pas des photos contractuelles de produits.

## Validation

- ESLint : OK.
- Tests métier : 58 réussis ; 19 tests d'intégration PostgreSQL non exécutés, faute de base de test configurée.
- Prettier : OK avec `--end-of-line auto` (le checkout Windows contient aussi des fichiers CRLF non modifiés).
- Build Next.js : vérifié ; `outputFileTracingRoot` évite de prendre un lockfile du dossier utilisateur comme racine.
- Contrôle navigateur avec API interceptée et données de test : 30 captures (390 px, 320 px, 1440 px), aucune erreur JavaScript ni débordement horizontal. Connexion, visibilité du mot de passe, filtres, création de panier, quantités, blocage de survente, encaissement et commande contrôlés.

Aucun test navigateur n'a écrit dans une base réelle. Aucun déploiement n'est inclus.
