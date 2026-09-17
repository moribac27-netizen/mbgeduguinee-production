-- Prompt 5 : restreindre les enseignants à leurs classes assignées.
--
-- ⚠️ En creusant les RLS existantes, il s'avère que la restriction demandée
-- ici était déjà PARTIELLEMENT codée (policies "grades_teacher_manage" /
-- "sa_teacher_manage" scopées via teacher_teaches_student/class), mais des
-- policies bien plus anciennes et bien plus larges, jamais supprimées lors
-- de l'ajout du multi-établissement, restaient actives en parallèle. Sous
-- PostgreSQL, les policies RLS s'additionnent (OR) : il suffit qu'UNE seule
-- policy autorise l'accès pour que la ligne soit visible/modifiable, quelle
-- que soit la restriction ajoutée par les autres. Concrètement, avant cette
-- migration :
--
--   • "Notes visibles par staff/enseignants/parent" (grades, SELECT) et
--     "Staff/enseignant saisit/modifie notes" (grades, INSERT/UPDATE)
--     autorisaient TOUT compte enseignant, de N'IMPORTE QUELLE école, à
--     lire ET modifier les notes de N'IMPORTE QUEL élève de la plateforme
--     — aucune vérification de classe assignée, ni même d'établissement.
--   • "Classes lecture authentifiés" (classes, SELECT) et
--     "authenticated read exams" (exams, SELECT) utilisaient USING (true) :
--     lisibles par n'importe quel compte authentifié, toutes écoles
--     confondues.
--   • "Staff gère classes" et "staff manages exams" autorisaient l'écriture
--     à is_staff(uid) sans vérifier l'école — un admin/directeur d'une école
--     pouvait modifier les classes/examens d'une AUTRE école.
--
-- Ces policies obsolètes sont supprimées ici ; les policies plus récentes et
-- correctement restreintes (classes_same_school_read, classes_staff_write,
-- exams_same_school_read, exams_staff_write, grades_staff_manage,
-- grades_teacher_manage, grades_parent_read, grades_self_read,
-- grades_parent_multi_read) restent seules en vigueur et suffisent à couvrir
-- tous les usages légitimes actuels de l'application (vérifié : aucun appel
-- côté client ne dépendait des policies supprimées).

DROP POLICY IF EXISTS "Notes visibles par staff/enseignants/parent" ON public.grades;
DROP POLICY IF EXISTS "Staff/enseignant saisit notes" ON public.grades;
DROP POLICY IF EXISTS "Staff/enseignant modifie notes" ON public.grades;
DROP POLICY IF EXISTS "Staff supprime notes" ON public.grades;

DROP POLICY IF EXISTS "Classes lecture authentifiés" ON public.classes;
DROP POLICY IF EXISTS "Staff gère classes" ON public.classes;

DROP POLICY IF EXISTS "authenticated read exams" ON public.exams;
DROP POLICY IF EXISTS "staff manages exams" ON public.exams;

-- Portée : ce nettoyage couvre les tables directement concernées par ce
-- prompt (Notes/Présences/Examens). D'autres tables plus anciennes que
-- classes/grades/exams pourraient avoir le même défaut (policy is_staff()
-- ou USING(true) sans vérification d'école) — un audit complet de toutes
-- les tables du schéma serait utile en tâche séparée, celui-ci n'a porté
-- que sur ce qui bloquait ce prompt précisément.
