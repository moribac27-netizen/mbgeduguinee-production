# MBGEduGuinée — Prompts 1 à 5, prêt à déployer

Ce zip contient la version **finale et cumulée** de tous les fichiers modifiés
ou créés pour les Prompts 1 à 5. Copie chaque fichier par-dessus le tien en
respectant l'arborescence (elle est identique à ton dépôt). Le Prompt 6
(Orange Money automatique) n'est pas inclus, comme convenu.

## 1. Déploiement — dans cet ordre exact

```bash
supabase db push
```

Les 8 migrations doivent s'appliquer dans cet ordre (elles sont nommées pour
ça) :

| # | Fichier | Contenu |
|---|---|---|
| 1 | `20260913120000_prompt1_roles_discipline.sql` | 7 rôles manquants ajoutés à l'enum `app_role` |
| 2 | `20260913120100_discipline_module.sql` | Table `discipline_incidents` + RLS |
| 3 | `20260913140000_collaborators_disabled_at.sql` | `profiles.disabled_at` (désactivation de compte) |
| 4 | `20260913140100_fix_user_roles_cross_tenant_rls.sql` | ⚠️ Corrige une fuite inter-écoles sur `user_roles` |
| 5 | `20260913155000_fix_signup_privilege_escalation.sql` | 🔴 **Corrige une prise de contrôle de compte possible par n'importe qui** (voir plus bas) |
| 6 | `20260913160000_student_access_codes.sql` | Table des codes d'accès famille |
| 7 | `20260913170000_subscription_discounts.sql` | Remises/bourses + ⚠️ corrige un contournement de paiement |
| 8 | `20260913180000_teacher_class_scope_rls_cleanup.sql` | ⚠️ Supprime d'anciennes policies RLS qui annulaient la restriction enseignant |

Ensuite, régénère les types Supabase (indispensable, sinon le projet ne
compile pas) :
```bash
supabase gen types typescript --project-id <ton-ref-projet> > src/integrations/supabase/types.ts
```
Et lance `npm run dev` (ou `vite build`) au moins une fois pour que
`routeTree.gen.ts` se régénère automatiquement avec les nouvelles routes
(`/discipline`, `/collaborateurs`) — c'est le plugin TanStack Router qui s'en
charge, rien à faire manuellement.

## 2. Ce que fait chaque prompt

### Prompt 1 — Rôles manquants + module Discipline
- Les 7 rôles déjà présents côté frontend (`secretariat`, `bibliothecaire`,
  `infirmerie`, `educatrice_maternelle`, `responsable_transport`,
  `responsable_cantine`, `rh`) existent enfin en base.
- Nouvel écran `/discipline` : incidents, sanctions, suivi par élève, export
  PDF/Excel avec logo.
- Historique disciplinaire accessible depuis la fiche élève.

### Prompt 2 — Écran de gestion des collaborateurs
- `/collaborateurs` : liste du personnel, ajout (invitation ou création
  directe), changement de rôle, activation/désactivation.
- Chaque action est journalisée dans `/journal`.

### Prompt 3 — Espace Parent/Élève sécurisé par code d'accès
- Bouton « Code d'accès » + impression sur la fiche élève (un code par
  personne — les deux parents, ou un parent + l'élève).
- Nouvel onglet « Parent/Élève » sur la page de connexion : le code est
  obligatoire, il crée le compte ET le rattache automatiquement au bon élève.
- Bouton « Ajouter un enfant » dans l'espace Parent pour rattacher un
  deuxième enfant à un compte déjà existant (les deux parents d'un même
  enfant, ou une fratrie).

### Prompt 4 — Remises/bourses sur abonnement
- Le Super Admin peut accorder une remise (pourcentage ou montant fixe, avec
  motif et date d'expiration optionnelle) depuis « Gérer l'abonnement ».
- La remise s'applique automatiquement à chaque renouvellement, et le montant
  demandé pour le paiement Orange Money (déclaré par l'école) est corrigé en
  conséquence — l'école paie bien le tarif remisé, pas le plein tarif.
- La remise est affichée clairement à l'école concernée (`/souscription`).

### Prompt 5 — Enseignants restreints à leurs classes
- Les sélecteurs de classe dans Notes, Présences et Examens ne montrent plus
  que les classes réellement assignées à l'enseignant connecté (le
  staff — admin/directeur/directeur des études/proviseur/surveillant/
  secrétariat — continue de tout voir, comme avant).
- La vraie protection est en base (RLS) : voir plus bas, une bien plus grosse
  faille bloquait ce prompt.
- **Maternelle non couverte** : ce module utilise des tables séparées
  (`nursery_*`), sans lien avec `teacher_class_assignments`. Le même principe
  de restriction par classe n'a donc pas pu être vérifié ni appliqué
  automatiquement — à traiter comme un prompt à part si tu veux que
  `educatrice_maternelle` soit elle aussi limitée à sa section.

## 3. Failles de sécurité trouvées en construisant ces prompts

Ce ne sont pas des ajouts « en plus » : sans elles, les prompts eux-mêmes
n'auraient servi à rien (ex. restreindre l'UI d'un enseignant à ses classes
ne sert à rien si la base autorise quand même la lecture de tout).

1. **Prise de contrôle de compte (Prompt 3)** — La création de compte
   utilisait `raw_user_meta_data`, un champ **entièrement contrôlé par le
   navigateur**. N'importe qui, avec seulement la clé publique (visible dans
   le code du site), pouvait s'auto-attribuer le rôle `admin` sur l'école de
   son choix, sans mot de passe d'établissement, sans paiement, sans code
   d'accès. Corrigé : rôle et école ne viennent plus que de `app_metadata`
   (réservé à l'API admin, jamais exposée au navigateur).

2. **Fuite inter-écoles sur `user_roles` (Prompt 2)** — La direction d'une
   école pouvait lire et modifier les rôles du personnel de n'importe quelle
   autre école du SaaS.

3. **Contournement de paiement sur `school_subscriptions` (Prompt 4)** —
   Tout admin/directeur d'école pouvait modifier directement son propre
   abonnement (plan, statut, échéance) sans jamais payer.

4. **Policies RLS obsolètes sur `grades`/`classes`/`exams` (Prompt 5)** — Des
   policies très anciennes, jamais supprimées lors du passage au
   multi-établissement, autorisaient :
   - tout enseignant, **de n'importe quelle école**, à lire et modifier les
     notes de n'importe quel élève de la plateforme ;
   - n'importe quel compte connecté à lire toutes les classes et tous les
     examens, toutes écoles confondues ;
   - tout admin/directeur à modifier les classes/examens d'une autre école.

   PostgreSQL additionne les policies RLS (OR) : il suffisait qu'une seule
   reste trop permissive pour annuler toutes les restrictions plus récentes
   ajoutées à côté. Ce nettoyage ne couvre que les tables directement visées
   par ce prompt — un audit complet du schéma (60+ tables) serait utile en
   tâche séparée pour vérifier qu'aucune autre table n'a le même défaut.

5. **Protection Admin/Directeur absente côté serveur (Prompt 2)** — signalé
   dans la livraison précédente, inclus ici aussi.

6. **Bug de permissions (`access.ts`) et import cassé
   (`PerStudentPlanOffer.tsx`)** — signalés et corrigés dans les livraisons
   précédentes, inclus ici aussi dans la version finale des fichiers.

## 4. Vérifications à faire toi-même après déploiement
- Connexion avec chaque nouveau rôle (Prompt 1) et chaque mode de création de
  collaborateur (Prompt 2).
- Inscription complète via un code d'accès, puis ajout d'un deuxième enfant
  au même compte parent (Prompt 3).
- Un enseignant ne voit plus, dans Notes/Présences/Examens, que ses classes ;
  un admin/directeur voit toujours tout (Prompt 5).
- Une école avec une remise voit le bon montant à payer par Orange Money, et
  un renouvellement applique bien le tarif remisé (Prompt 4).
- Aucune régression sur les comptes staff existants (admin, directeur,
  comptable...) suite au nettoyage des policies RLS du Prompt 5.

## 5. Portée non couverte (à traiter séparément si besoin)
- Prompt 6 (Orange Money automatique) — volontairement laissé de côté.
- Maternelle non restreinte par classe (voir Prompt 5 ci-dessus).
- Audit RLS complet au-delà des tables touchées par ces 5 prompts.
