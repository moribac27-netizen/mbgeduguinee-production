# Rapport — Forfaits établissement configurables et réduction annuelle

## Périmètre et décisions d'interprétation

Le prompt contenait des points ambigus ou contradictoires, tranchés ainsi :

| Point du prompt | Décision |
|---|---|
| Forfait 1 « 0 à 600 » et Forfait 2 « 0 à 1 000 000 » alors que « aucun chevauchement » est exigé | Seuls les **maximums** sont enregistrés. Le minimum d'un forfait = maximum du forfait actif précédent + 1. Forfait 2 couvre donc 601 à 1 000 000. |
| « Seuils minimum et maximum modifiables » | Le Super Admin modifie les maximums ; les minimums se déduisent (impossible de créer un chevauchement ou un trou). |
| « Forfaits par élève » alors que les prix sont par établissement | Tarification **par établissement selon l'effectif**. La cotisation annuelle par élève (50 000 GNF, `lib/pricing.ts`) est un autre produit, **non modifié**. |
| « Effectif réel » non défini | Élèves au statut `actif` (`school_active_students_count`). |
| Effet d'un changement de prix non précisé | Il vaut pour les **nouvelles déclarations et renouvellements**. Un paiement déclaré garde son montant ; un paiement validé est immuable (trigger). |
| Effectif au-delà de tous les forfaits, ou tous inactifs | Erreur explicite `NO_PLAN_FOR_HEADCOUNT` ; la désactivation de tous les forfaits est refusée. |

Pas de doublon : l'ancien abonnement d'établissement (`school_subscriptions`, `subscription_plans`, …) a été supprimé par la migration `20260921190000`. Les tables ajoutées ici sont indépendantes des offres par élève, cotisations et commissions.

## Fichiers

Nouveaux : `supabase/migrations/20261017120000_school_billing_plans.sql`, `supabase/migrations/20261018120000_billing_numeric_hardening.sql`, `src/lib/billing.ts`, `src/lib/billing-print.ts`, `src/hooks/useBillingPlans.ts`, `src/components/SchoolBillingAdmin.tsx`, `src/components/PublicBillingPlans.tsx`, `src/routes/_authenticated/facturation.tsx`, `tests/billing.test.ts`, `tests/sql/*`.

Modifiés (ajouts uniquement) : `src/routes/_authenticated/offres.tsx` (onglet « Forfaits établissement »), `src/routes/index.tsx` (section publique), `src/components/AppShell.tsx` (menu), `src/lib/access.ts` (route `/facturation`), `src/routeTree.gen.ts` (généré).

## Migrations

1. `20261017120000_school_billing_plans.sql` : tables `billing_plans`, `billing_settings`, `billing_plan_history`, `school_billing_payments`, `school_billing_subscriptions` ; valeurs initiales 150 000 / 600 et 200 000 / 1 000 000, 2 mois offerts (jamais écrasées au rejeu) ; RLS en lecture, **aucune écriture directe** côté client ; fonctions serveur `billing_quote`, `save_billing_config`, `declare_school_billing_payment`, `review_school_billing_payment`.
2. `20261018120000_billing_numeric_hardening.sql` : **défaut corrigé** — `save_billing_config` acceptait un prix `NaN` ou `Infinity` (un prix `Infinity` est resté enregistré lors de mon test) et un seuil `NaN` renvoyait une erreur brute. Désormais prix fini `< 1e12`, seuil entier `1…2 147 483 647`, contrainte `CHECK` (NOT VALID) en défense en profondeur.

Aucune donnée existante n'est supprimée ni modifiée. Les migrations sont idempotentes.

## Tests réellement exécutés

- **SQL** (`tests/sql/`) : PostgreSQL 16.15 local, base neuve, stubs + migration 1 + migration 2, puis 15 scénarios (T1–T15) : valeurs initiales, calculs 1 500 000 / 2 000 000, forfait applicable (600 → F1, 601 → F2), isolation entre écoles, refus des non Super Admin, validations (prix négatif, seuils, 0–12 mois, NaN/Infinity), historique avec auteur, recalcul après changement de prix, montant figé après déclaration, immutabilité d'un paiement validé, RLS, rejeu des migrations. Tous conformes aux attentes.
- **TypeScript** : 134 tests via un **exécuteur Node provisoire** (pas vitest) : 133 réussis, dont les 22 de `tests/billing.test.ts`. L'exécuteur a été vérifié par un test volontairement faux (3/3 détectés).
- **Syntaxe** esbuild des 12 fichiers touchés : OK. **`tsc --strict`** sur `billing.ts` et `billing-print.ts` : aucune erreur dans ces fichiers.

## Non exécuté / limites

- Le registre npm est refusé par la politique réseau de la session : `npm ci` impossible, donc **pas de `vitest`, `tsc` complet, ESLint ni `vite build`**. À lancer chez vous : `npm ci && npm run check && npm test && npm run build`.
- `tests/cotisation.test.ts` n'a pas pu être exécuté (dépend de `@supabase/supabase-js`).
- Le test SQL utilise des **stubs** de `auth.uid()`, `is_super_admin`, `same_school`, `is_direction`, `is_finance`, pas les vraies fonctions Supabase. À rejouer sur une branche Supabase.
- Les composants React n'ont **pas été rendus ni parcourus** dans un navigateur.
- **Rien n'a été appliqué** à la base Supabase réelle ni commité.
- La fin de période d'un abonnement n'est pas utilisée pour bloquer l'accès (hors demande).
- Les paiements restent déclaratifs (Orange Money manuel) : validation par le Super Admin.
