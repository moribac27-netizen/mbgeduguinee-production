-- Contrainte d'unicité des notes (remplace la simple vérification par trigger, qui reste en place
-- pour le message d'erreur clair).
--
-- Clé : établissement + élève + matière + période + type d'évaluation + année scolaire.
-- Les doublons historiques ont été supprimés le 2026-10-12 (6 notes de test, vérifié : 0 groupe restant).
-- Si cette commande échoue avec « could not create unique index », des doublons sont revenus :
-- les lister avec la requête en commentaire ci-dessous avant de réessayer.
--
-- SELECT school_id, student_id, subject_id, period, evaluation_type, academic_year, count(*)
-- FROM public.grades
-- GROUP BY 1,2,3,4,5,6 HAVING count(*) > 1;
--
-- Idempotent : peut être rejoué sans effet de bord.

CREATE UNIQUE INDEX IF NOT EXISTS uq_grades_student_subject_period_eval_year
  ON public.grades (school_id, student_id, subject_id, period, coalesce(evaluation_type, ''), coalesce(academic_year, ''));
