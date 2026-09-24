# MBGEduGuinée — Rapport de durcissement production

## Correctifs intégrés

- Frontière RLS multi-établissement renforcée par une policy `AS RESTRICTIVE` sur toutes les tables publiques portant `school_id`.
- Notes : accès serveur conditionné par `FULL` + cotisation annuelle de l'élève `VALIDATED`.
- Présences élèves : même verrou individuel `FULL` + `VALIDATED`.
- Examens : accès serveur conditionné par `FULL`.
- Accusés de lecture : isolation par établissement via la circulaire associée.
- Paiements annuels : aucune écriture directe navigateur sur `student_plan_payments`.
- Vérification des reçus : `verify_receipt()` utilise `student_plan_payments` et le statut `VALIDATED`.
- Codes d'accès parent/élève : génération cryptographiquement aléatoire, contrôle d'établissement, liste des codes limitée à l'école, rollback en cas d'échec de création/rattachement.
- Tous les rôles staff assignables sont reconnus par le serveur de codes d'accès.
- Nouveaux mots de passe : minimum 12 caractères côté inscription et définition/réinitialisation.
- Références documentaires : suppression des fallback `Math.random()` pour les références.
- Sauvegardes : pagination au-delà de 1 000 lignes, échec explicite d'une table inaccessible, périmètre par établissement, liste de tables étendue.
- Sauvegarde automatique : route serveur `/api/cron/backups`, déclenchée toutes les heures par Vercel et protégée par `CRON_SECRET`, avec rétention.
- En-têtes HTTP de sécurité ajoutés dans `vercel.json`.
- Installation Vercel rendue reproductible avec `npm ci`.
- Ancien outillage Drizzle supprimé du projet ; les migrations Supabase constituent la source de vérité.
- Types Supabase nettoyés des anciennes tables d'abonnement supprimées.
- Identité établissement mise en cache par utilisateur et affichage d'une erreur explicite si elle ne peut pas être chargée.

## Vérifications effectuées

- 158 fichiers TypeScript/TSX transpilés sans erreur de syntaxe.
- JSON `package.json` / `vercel.json` valides.
- `package-lock.json` mis à jour avec `npm install --package-lock-only --offline`.
- Aucune occurrence de `Math.random()` dans les générateurs de codes/références sensibles.
- Aucun ancien nom de table d'abonnement dans `src/`.

## Vérification non réalisable dans l'environnement de travail

Le téléchargement complet des dépendances npm a expiré à deux reprises. Le build Vite, ESLint et Vitest ne peuvent donc pas être déclarés exécutés ici. Le déploiement final doit exécuter `npm ci && npm run lint && npm test && npm run build` dans l'environnement CI/Vercel avant publication.

## Variables supplémentaires

Ajouter en Production dans Vercel :

```text
CRON_SECRET=<valeur secrète longue et aléatoire>
```

La migration finale à appliquer est :

```text
supabase/migrations/20260923120000_production_hardening.sql
```
