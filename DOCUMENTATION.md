# MBGEduGuinée — Documentation technique

Application web SaaS de gestion scolaire (écoles primaires, collèges, lycées, centres de formation) en Guinée.

## 1. Stack

| Couche | Technologie |
| --- | --- |
| Framework | TanStack Start v1 (React 19, SSR + server functions) |
| Build | Vite 7 |
| Style | Tailwind CSS v4 (`src/styles.css`) + shadcn/ui |
| Données | Lovable Cloud (Postgres, Auth, Storage, Realtime) |
| Data fetching | TanStack Query |
| Graphiques | Recharts |
| Exports | jsPDF / xlsx (`src/lib/reports.ts`) |

## 2. Arborescence

```text
src/
  routes/
    index.tsx                 landing publique
    auth.tsx                  connexion / inscription école
    verifier-recu.$number.tsx vérification publique d'un reçu (QR)
    _authenticated/           toutes les pages protégées (gate + RoleGuard)
  components/
    AppShell.tsx              layout, sidebar filtrée par rôle
    RoleGuard.tsx             redirection si accès non autorisé
    CrudSection.tsx           CRUD générique (table, dialog, filtres, exports)
    StudentPhoto*.tsx         affichage & capture photo élève
  hooks/                      useAuth, useRoles, useSuperAdmin, useOptions...
  lib/
    access.ts                 carte des permissions par route
    audit.ts                  journalisation des actions
    reports.ts                exports CSV / Excel / PDF
    grading.ts                barèmes guinéens (/10 primaire, /20 secondaire)
    payments/                 abstraction fournisseurs de paiement
  integrations/supabase/      clients générés (ne pas modifier)
```

## 3. Rôles et permissions

Rôles applicatifs : `admin`, `directeur`, `comptable`, `enseignant`, `parent`, `eleve`, plus `super_admin` (table `super_admins`).

- Les rôles sont stockés dans `public.user_roles` (jamais sur `profiles`), lus via la fonction SECURITY DEFINER `has_role()`.
- Contrôle côté client : `ROUTE_ACCESS` dans `src/lib/access.ts` + `RoleGuard`.
- Contrôle côté serveur : politiques RLS sur chaque table, isolation multi-tenant via `current_school_id()` et `same_school()`.
- Redirection après connexion : `homeForRoles()` (super admin → `/super-admin`, admin/directeur/enseignant → `/dashboard`, comptable → `/paiements`, parent → `/parent`, élève → `/eleve`).

Le contrôle client est une commodité UX ; la source de vérité reste la RLS.

## 4. Multi-tenant

Chaque table métier porte `school_id`. Les politiques RLS comparent `school_id` à `current_school_id()` (profil de l'utilisateur courant). Le Super Admin peut consulter toutes les écoles et « impersonner » une école (`src/lib/super-admin.functions.ts`).

## 5. Tableau de bord intelligent

`src/routes/_authenticated/dashboard.tsx` — une seule requête agrégée (TanStack Query, `staleTime` 60 s) puis rendu conditionnel selon les rôles :

- **Direction (admin/directeur)** : tous les KPIs, graphiques, activités récentes, journal.
- **Comptable** : blocs financiers uniquement (paiements du jour/mois, dépenses, solde, retards).
- **Enseignant** : blocs pédagogiques (effectifs, présences, examens, notes récentes).

KPIs : élèves, enseignants, parents, classes, paiements du jour, paiements du mois, dépenses du mois, solde actuel, taux de présence, retards de paiement.

## 6. Journal d'activité (audit)

- Table `public.activity_logs` : `user_id`, `school_id`, `actor_name`, `actor_role`, `action`, `entity_type`, `entity_id`, `entity_label`, `metadata`, `ip_address`, `user_agent`, `created_at`.
- Helper : `logActivity()` dans `src/lib/audit.ts` (silencieux en cas d'erreur, IP publique récupérée une fois par session).
- Raccourcis : `logLogin()` (dans `auth.tsx`), `logLogout()` (dans `AppShell.tsx`).
- Actions couvertes : connexion, déconnexion, création, modification, suppression, paiements, saisie de notes, impression des bulletins, exports.
- Consultation : `/journal` (admin, directeur) et vue globale dans `/super-admin`.

## 7. Sauvegardes

`/sauvegarde` (Super Admin) : export JSON compressé de toutes les tables vers le bucket privé `school-backups`, historique, restauration et téléchargement. Les sauvegardes sont nommées par `school_id/date` pour respecter l'isolation.

## 8. Stockage

Buckets privés : `school-assets` (logos, signatures, cachets, photos d'élèves) et `school-backups`. Les fichiers sont lus via URLs signées (`useSignedUrl`).

## 9. Impressions PDF

- Bulletins (A4), cartes scolaires (85,6 × 54 mm, 10 par page), reçus (A5 avec filigrane et QR code), fiches de paie.
- Règle CSS commune : classe `no-print` pour masquer l'UI, `@media print` par module.

## 10. Conventions

- Aucune couleur en dur : uniquement des tokens sémantiques du design system « West African Earth ».
- Devise : GNF, formatée avec `Intl.NumberFormat("fr-FR")`.
- Barème des notes : `maxScoreForLevel()` selon le niveau.
- Logique serveur : `createServerFn` (`*.functions.ts`) ; jamais de nouvelles Edge Functions.

## 11. Environnement

Variables client : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Variables serveur (lues dans les handlers) : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## 12. Checklist de mise en production

- [ ] RLS activée + GRANT sur chaque table publique
- [ ] Aucune erreur TypeScript (`tsgo`)
- [ ] Impressions vérifiées (bulletins, reçus, cartes, paie)
- [ ] Sauvegarde manuelle testée et restaurée
- [ ] Rôles testés un par un (redirections et menus)

## Stabilisation documentaire — 22/09/2026

Cette version consolide le système documentaire sans modifier le modèle métier de cotisation annuelle.

### Nouveautés
- Système commun de présentation A4 : en-tête institutionnel, métadonnées, cartes de synthèse, tableaux, signatures et pied de page.
- Nouvelle **Fiche de sortie scolaire** accessible depuis le menu « Fiches de sortie ».
- La fiche de sortie intègre, lorsque le dossier est accessible : identité/photo, matricule, classe, situation administrative, statut financier VALIDATED, référence de paiement, moyenne, résultats, décision, observations, signatures et courbe de progression lorsqu'au moins deux périodes sont disponibles.
- La fiche est volontairement verrouillée côté interface si la cotisation annuelle de l'élève n'est pas VALIDATED.
- L'année scolaire affichée dans l'application et les affectations est maintenant tirée des paramètres de l'établissement au lieu d'une année codée en dur.
- La liste de sauvegarde couvre également le registre de cotisations annuelles et plusieurs modules métier récents.
- Le document racine utilise `lang="fr"`.

### Validation effectuée
- Transpilation TypeScript/JSX des fichiers modifiés et de la landing page avec TypeScript 5.x : aucune erreur de syntaxe détectée.
- Les tests/build complets restent dépendants de l'installation locale des dépendances npm et doivent être exécutés dans l'environnement de déploiement avant mise en production.
