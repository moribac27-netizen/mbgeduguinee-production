# Rapport — Migration MBGEduGuinée vers la cotisation annuelle unique

## Base de départ

La migration est intégrée au fichier maître `edugrace-guinee-corrections-completes.zip`. Les fonctionnalités scolaires existantes sont conservées hors du périmètre financier remplacé.

## Nouveau modèle

- 50 000 GNF par élève et par année scolaire.
- 15 000 GNF de part école par cotisation `VALIDATED`.
- 35 000 GNF de part plateforme selon le modèle économique demandé.
- 20 cotisations `VALIDATED` déclenchent le mode global `FULL`.
- De 0 à 19 : `RESTRICTED`.
- Le statut individuel de l'élève reste indépendant du seuil global.
- Un dossier élève est accessible uniquement lorsque sa propre cotisation est `VALIDATED`.

## Paiement Orange Money

- Numéro bénéficiaire : 628 49 98 12.
- Titulaire : MBGEduGuinée.
- USSD : #144#.
- La référence saisie est uniquement une déclaration tant qu'elle n'a pas été vérifiée.
- Aucune API Orange Money fictive n'a été ajoutée ; le workflow reste manuel tant qu'une API officielle n'est pas configurée.

## Base de données / sécurité

La migration `20260921190000_mbg_unique_annual_contribution.sql` :

- normalise les anciennes cotisations vers les nouveaux statuts ;
- force le montant serveur à 50 000 GNF et la part école à 15 000 GNF ;
- ajoute la traçabilité du transfert, du groupe, du déclarant et de la validation ;
- crée `cotisation_payment_audit` ;
- crée les fonctions serveur de déclaration individuelle et groupée ;
- crée la fonction serveur de validation/rejet atomique ;
- calcule le seuil uniquement sur `VALIDATED` ;
- protège les fonctions sensibles contre l'accès inter-écoles ;
- interdit les INSERT/UPDATE/DELETE directs sur `student_plan_payments` depuis le rôle `authenticated` ;
- applique le mode `FULL` côté RLS aux données globales sensibles (notes et examens) ;
- supprime les tables, fonctions, type, trigger et dépendances exclusivement liés à l'ancien abonnement établissement.

## Frontend

- Suppression des écrans d'abonnement établissement et de la gestion des offres fixes.
- Suppression des routes `/abonnement`, `/souscription` et `/plans`.
- Suppression de la logique d'accès basée sur l'expiration d'un abonnement.
- Nouvelle garde d'accès basée sur `RESTRICTED/FULL`.
- Écran Cotisations adapté à `X/20 VALIDATED`, avec déclaration individuelle et groupée.
- Informations Orange Money visibles au moment de la déclaration.
- Espace élève adapté au statut `VALIDATED`.
- Tableau de bord directeur adapté au nouveau modèle.
- Super Admin adapté à la supervision des écoles et des cotisations validées/en attente.

## Contrôles anti-fraude implémentés

- Montant calculé côté serveur.
- École et élève contrôlés côté serveur.
- Référence obligatoire.
- Verrou transactionnel par référence pour éviter les déclarations concurrentes avec la même référence.
- Une cotisation déjà `VALIDATED` ne peut pas être redéclarée.
- Une cotisation déjà en attente ne peut pas être écrasée par une nouvelle déclaration.
- Une validation déjà effectuée est refusée.
- Les paiements groupés sont limités à une seule école et à des élèves distincts.
- Le montant d'un groupe est recalculé côté serveur : `50 000 × nombre d'élèves`.
- Les actions de création et de validation sont journalisées.

## Tests effectués dans l'environnement de travail

- Vérification syntaxique TypeScript/TSX de tous les fichiers `src/` : OK.
- Recherche globale dans le code actif `src/` : aucune référence active aux anciennes tables/routes/fonctions d'abonnement établissement.
- Les tests Vitest complets n'ont pas pu être exécutés, car l'installation locale des dépendances s'est interrompue pendant `npm ci` dans l'environnement de travail.
- Les migrations Supabase doivent être appliquées sur l'instance cible puis testées avec les comptes de chaque rôle avant mise en production.

## Point de déploiement important

La migration supprime réellement les tables historiques de l'ancien modèle sur la base cible avec `DROP TABLE ... CASCADE`. Une sauvegarde de la base doit donc être effectuée avant application en production.
