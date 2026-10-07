-- Évaluations Maternelle : rattachement à l'année scolaire + pas de doublon.
--
-- Avant : « Trimestre 1 » de deux années différentes se mélangeaient et rien
-- n'empêchait deux évaluations identiques pour le même enfant.
-- Additif : la colonne reçoit l'année courante par défaut (même fonction que
-- grades.academic_year) ; les lignes existantes prennent donc l'année courante.
-- Idempotent : peut être rejoué sans effet de bord.

ALTER TABLE public.nursery_evaluations
  ADD COLUMN IF NOT EXISTS academic_year text NOT NULL DEFAULT public.current_academic_year_default();

CREATE UNIQUE INDEX IF NOT EXISTS nursery_evaluations_unique_idx
  ON public.nursery_evaluations (school_id, student_id, competency_id, period, academic_year);

-- L'ancienne règle (enfant + compétence + période, sans année) empêchait
-- d'évaluer le même trimestre l'année suivante : remplacée par la règle ci-dessus.
ALTER TABLE public.nursery_evaluations
  DROP CONSTRAINT IF EXISTS nursery_evaluations_student_id_competency_id_period_key;
