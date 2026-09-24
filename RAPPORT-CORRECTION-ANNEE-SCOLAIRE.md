# Correction de l'année scolaire — production

## Correction appliquée

- Année scolaire de production corrigée vers **2026-2027**.
- La migration de production met à jour uniquement les établissements dont `academic_year` est `NULL` ou encore égal à l'ancien placeholder `2025-2026`.
- Une année scolaire déjà configurée avec une autre valeur n'est pas écrasée.
- Le champ **Paramètres → Année scolaire** utilise désormais `2026-2027` comme valeur indicative.

## Effet attendu

Le tableau de bord et les composants qui lisent `schools.academic_year` afficheront `2026-2027` après application de la migration et redéploiement de la production.

## Limite de vérification

La connexion au projet Supabase/Vercel de production n'est pas disponible dans cet environnement ; la migration n'a donc pas été exécutée directement sur la base de production ici.
