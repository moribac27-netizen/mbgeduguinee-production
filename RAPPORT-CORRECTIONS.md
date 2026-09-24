# Rapport de corrections — MBGEduGuinée

## Périmètre

Analyse du projet existant et correction ciblée des problèmes signalés dans le rapport fourni. Le design et les parcours existants ont été conservés ; aucune refonte d'architecture n'a été effectuée.

## Corrections réalisées

### 1. Création des collaborateurs
- Le mode **direct** ne dépend plus uniquement de `handle_new_user()` pour le profil et le rôle.
- Après `createUser()`, le profil est explicitement rattaché à l'établissement et le rôle est créé via `upsert`.
- Le mode **invitation** applique le même rattachement explicite.
- Les erreurs de rattachement ne sont plus ignorées.
- Le rôle est écrit avec `upsert` afin d'éviter une collision si le trigger a déjà créé la ligne.

### 2. Invitations et mot de passe
- Ajout de la route `/definir-mot-de-passe`.
- Prise en charge des liens d'invitation et de récupération Supabase.
- Ajout de la possibilité de demander un lien « Mot de passe oublié ? » depuis l'écran de connexion.
- Les invitations utilisent `APP_URL` pour rediriger vers la page de définition du mot de passe.

### 3. Ajout d'un enfant par un parent
- Validation frontend et serveur du format `XXXXX-XXXXX`.
- Un code n'est plus considéré comme définitivement consommé lorsque l'insertion dans `student_parents` échoue.
- Détection explicite d'un enfant déjà rattaché au parent.
- Messages d'erreur plus explicites en français.

### 4. Génération des codes d'accès
- Correction de la requête `super_admins` : la colonne est `user_id`, pas `id`.
- Messages anglais génériques remplacés par des messages métier compréhensibles.
- Vérification de l'appartenance de l'élève à l'établissement avant génération.

### 5. Gestion des erreurs de rôles
- `useRoles()` expose désormais `error` au lieu de jeter silencieusement l'erreur Supabase.
- `RoleGuard` pouvait déjà exploiter ce champ ; il ne déconnecte donc plus un utilisateur à cause d'une erreur réseau/RLS interprétée comme une absence de rôle.

### 6. Cohérence des redirections
- `rh` → `/salaires`.
- `educatrice_maternelle` → `/maternelle`.
- Les autres rôles métier disposent également d'une destination cohérente dans `homeForRole()`.

### 7. RLS / rôles du personnel
- Nouvelle migration `20260921160000_expand_staff_role_rls.sql`.
- `is_staff()` reconnaît désormais les rôles du personnel ajoutés au frontend, tout en excluant `parent` et `eleve`.
- Les protections inter-écoles existantes sur `user_roles` sont conservées.

### 8. Espace Élève
- Correction du type `React.ReactNode` utilisé sans import de React.

### 9. Sécurité des secrets
- `.env` retiré du livrable.
- L'ancien script `definir-mot-de-passe.mjs`, qui contenait une clé sensible en clair, retiré du livrable.
- `.gitignore` renforcé pour empêcher le suivi de `.env` et du script supprimé.
- `.env.example` remis à jour avec une configuration à projet Supabase unique.
- L’état local `supabase/.temp` qui pointait vers un autre projet a été retiré du livrable et ajouté au `.gitignore`.
- Documentation ajoutée dans `SECURITE-ET-DEPLOIEMENT.md`.

## Point critique à effectuer côté infrastructure

L'ancienne archive contenait des secrets exposés dans `.env`, dans un script et dans l'historique Git inclus dans l'archive d'origine. **Les clés concernées doivent être révoquées/régénérées dans Supabase avant le prochain déploiement.** Cette opération est volontairement laissée à l'administrateur du projet et n'est pas simulée par une modification locale.

Le navigateur et le serveur doivent utiliser le même `project-ref` Supabase. Le fichier `.env` de l'archive initiale pointait vers deux projets différents ; le livrable ne contient plus de valeurs secrètes et impose cette cohérence via `.env.example`.

## Tests effectués

- Vérification syntaxique TypeScript/TSX par compilation/transpilation des fichiers modifiés : **OK**.
- Vérification des fichiers et références de la nouvelle route dans `routeTree.gen.ts` : **OK**.
- Vérification qu'aucun JWT/service-role key n'est présent dans les fichiers du livrable : **OK**.
- Vérification des artefacts parasites `z.object({` et `{` : supprimés.

### Test non exécuté

Le `npm ci` / `npm install` n'a pas pu terminer correctement dans l'environnement d'exécution fourni ; par conséquent `npm run build` et la suite Vitest complète n'ont pas pu être exécutés ici. Aucune réussite de build complète n'est revendiquée sur cette base.

## Fichiers principaux modifiés

- `src/lib/collaborators.functions.ts`
- `src/lib/access-codes.functions.ts`
- `src/hooks/useAuth.ts`
- `src/lib/access.ts`
- `src/routes/auth.tsx`
- `src/routes/definir-mot-de-passe.tsx`
- `src/routes/_authenticated/parent.tsx`
- `src/routes/_authenticated/eleve.tsx`
- `src/routeTree.gen.ts`
- `supabase/migrations/20260921160000_expand_staff_role_rls.sql`
- `.env.example`
- `.gitignore`
- `SECURITE-ET-DEPLOIEMENT.md`

## À surveiller après déploiement

1. Vérifier que les variables Vercel `SUPABASE_*` et `VITE_SUPABASE_*` pointent vers le même projet.
2. Appliquer les migrations Supabase jusqu'à `20260921160000_expand_staff_role_rls.sql`.
3. Régénérer les types Supabase si le schéma distant diffère du projet local.
4. Tester au minimum : connexion, création directe d'un collaborateur, invitation d'un collaborateur, récupération de mot de passe, ajout d'un enfant par un parent et accès de chaque rôle métier.
5. Vérifier les comptes historiquement orphelins avec la requête SQL fournie dans le rapport d'audit.

## Correctif supplémentaire — Espace Parent (21/09/2026)

- La liste des enfants de l'Espace Parent est maintenant récupérée explicitement depuis `student_parents` pour l'utilisateur authentifié, au lieu de faire une requête générale sur `students`.
- Une compatibilité avec l'ancien champ `students.parent_user_id` est conservée pour les anciennes données.
- La clé React Query inclut désormais l'identifiant du parent afin d'éviter qu'un cache d'un ancien compte puisse être réutilisé lors d'un changement de session.
- Les erreurs de chargement des enfants ne sont plus transformées silencieusement en liste vide.
- Aucune migration SQL supplémentaire n'est nécessaire pour ce correctif : les politiques RLS existantes (`students_parent_multi_read` et `is_parent_of_student`) restreignent déjà les élèves et les données associées au parent authentifié.
