-- Empêcher la création de NOUVEAUX doublons de notes.
--
-- Clé d'unicité d'une note : élève + matière + période + type d'évaluation
-- + année scolaire (dans un même établissement).
--
-- Pourquoi un trigger et pas un index UNIQUE : la table contient déjà des
-- doublons historiques. Un index unique échouerait, et il faudrait supprimer
-- ou modifier des notes existantes, ce qui est exclu sans décision explicite.
-- Ce trigger ne regarde que les insertions futures : l'existant reste intact.
--
-- Concurrence : un verrou consultatif (par clé) sérialise deux insertions
-- simultanées de la même note ; la seconde voit alors la première et échoue.
--
-- Idempotent : peut être rejoué sans effet de bord.

CREATE OR REPLACE FUNCTION public.grades_prevent_duplicates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      concat_ws('|', NEW.school_id, NEW.student_id, NEW.subject_id, NEW.period,
                coalesce(NEW.evaluation_type, ''), coalesce(NEW.academic_year, '')),
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.grades g
    WHERE g.school_id = NEW.school_id
      AND g.student_id = NEW.student_id
      AND g.subject_id = NEW.subject_id
      AND g.period = NEW.period
      AND g.evaluation_type IS NOT DISTINCT FROM NEW.evaluation_type
      AND g.academic_year IS NOT DISTINCT FROM NEW.academic_year
  ) THEN
    RAISE EXCEPTION 'Cette note existe déjà pour cet élève, cette matière, cette période et cette évaluation.'
      USING ERRCODE = '23505', HINT = 'duplicate_grade';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_grades_prevent_duplicates ON public.grades;
CREATE TRIGGER trg_grades_prevent_duplicates
  BEFORE INSERT ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.grades_prevent_duplicates();

-- Accélère le contrôle ci-dessus et les lectures « notes d'une classe pour
-- une période » du module Notes. Index non unique : aucune donnée n'est refusée.
CREATE INDEX IF NOT EXISTS idx_grades_entry_lookup
  ON public.grades (student_id, subject_id, period, academic_year);
