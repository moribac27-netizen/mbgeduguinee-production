# MBGEduGuinée — année scolaire automatique et heure Guinée

## Analyse
- `schools.academic_year` était une valeur persistée et pouvait rester bloquée sur un ancien millésime.
- Le ZIP v8 contenait encore un placeholder `2026-2027` dans `parametres.tsx`.
- Les cotisations annuelles utilisent déjà `student_plan_payments.academic_year` pour distinguer les exercices.
- Les affectations enseignants utilisent déjà `teacher_class_assignments.academic_year`.
- La majorité des autres modules (élèves/classes/notes/présences/examens) ne possèdent pas actuellement de colonne `academic_year` dédiée. Ils restent donc des données métier liées à l'élève/la classe, et une historisation complète par année de ces modules nécessiterait une évolution de schéma distincte. Cette correction ne supprime ni ne réécrit ces données.

## Correction ciblée
- Nouvelle fonction SQL `current_academic_year()` basée sur `Africa/Conakry` et une rentrée au 1er septembre.
- `school_academic_year()` est désormais dynamique et conserve sa signature pour ne pas casser les appels existants.
- `useSchool()` expose l'année active calculée, sans écraser la valeur historique stockée dans `schools`.
- `usePerStudentPlan()` utilise la même logique en secours.
- Les affectations utilisent l'année active dynamique pour le filtre par défaut.
- Le champ Paramètres affiche l'année active en lecture seule : aucune modification annuelle du code n'est nécessaire.

## Heure
- Ajout de `ConakryClock` dans `AppShell`, donc disponible dans l'espace de tous les utilisateurs connectés.
- Fuseau explicite `Africa/Conakry` (UTC+0).
- Mise à jour chaque seconde, sans rafraîchir la page.
- Sur téléphone, l'affichage est compact (`HH:MM`) ; sur tablette/ordinateur, il affiche la date complète et l'heure.

## Passage futur
- Septembre 2026 → `2026-2027`
- Septembre 2027 → `2027-2028`
- Septembre 2028 → `2028-2029`
- etc.

Aucune donnée historique de paiement n'est supprimée ou réécrite par cette correction.
