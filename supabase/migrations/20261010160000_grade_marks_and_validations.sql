-- Module Notes : « absent » en masse (statuts de saisie) et validation de la saisie.
--
-- 1) grade_marks : statut d'une case (élève × matière × période × évaluation × année) quand
--    AUCUNE note n'est attendue (absent, non concerné, annulé) ou « en attente ».
--    Ce n'est jamais un zéro et ça ne crée aucune ligne dans `grades`.
-- 2) grade_validations : saisie validée pour une classe × matière × période × évaluation × année.
--    Une saisie validée n'est plus modifiable (sauf direction, qui peut la rouvrir).
--
-- Additif et idempotent : aucune donnée existante n'est modifiée.

CREATE TABLE IF NOT EXISTS public.grade_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT public.current_school_id(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  period text NOT NULL,
  evaluation_type text NOT NULL DEFAULT 'composition',
  academic_year text NOT NULL DEFAULT public.current_academic_year_default(),
  status text NOT NULL CHECK (status IN ('absent','non_concerne','annule','en_attente')),
  reason text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, student_id, subject_id, period, evaluation_type, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_grade_marks_lookup ON public.grade_marks (student_id, period, academic_year);

CREATE TABLE IF NOT EXISTS public.grade_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT public.current_school_id(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  period text NOT NULL,
  evaluation_type text NOT NULL DEFAULT 'composition',
  academic_year text NOT NULL DEFAULT public.current_academic_year_default(),
  validated_by uuid DEFAULT auth.uid(),
  validated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, class_id, subject_id, period, evaluation_type, academic_year)
);
CREATE INDEX IF NOT EXISTS idx_grade_validations_lookup ON public.grade_validations (class_id, period, academic_year);

ALTER TABLE public.grade_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_validations ENABLE ROW LEVEL SECURITY;

-- Frontière d'établissement (même règle que toutes les tables à school_id).
DROP POLICY IF EXISTS prod_tenant_boundary ON public.grade_marks;
CREATE POLICY prod_tenant_boundary ON public.grade_marks AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.same_school(school_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.same_school(school_id));
DROP POLICY IF EXISTS prod_tenant_boundary ON public.grade_validations;
CREATE POLICY prod_tenant_boundary ON public.grade_validations AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.same_school(school_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.same_school(school_id));

-- Établissement suspendu : pas d'écriture (comme pour `grades`).
DROP POLICY IF EXISTS block_write_when_expired ON public.grade_marks;
CREATE POLICY block_write_when_expired ON public.grade_marks AS RESTRICTIVE FOR ALL TO authenticated
  USING (true) WITH CHECK (NOT public.school_write_blocked(school_id));
DROP POLICY IF EXISTS block_write_when_expired ON public.grade_validations;
CREATE POLICY block_write_when_expired ON public.grade_validations AS RESTRICTIVE FOR ALL TO authenticated
  USING (true) WITH CHECK (NOT public.school_write_blocked(school_id));

-- Le personnel (dont enseignants) lit et écrit les statuts ; les élèves/parents n'y ont pas accès.
DROP POLICY IF EXISTS grade_marks_staff ON public.grade_marks;
CREATE POLICY grade_marks_staff ON public.grade_marks FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.is_staff(auth.uid()) AND school_id = public.current_school_id()))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (public.is_staff(auth.uid()) AND school_id = public.current_school_id()));

-- Validations : le personnel lit et valide ; seule la direction peut rouvrir (supprimer).
DROP POLICY IF EXISTS grade_validations_staff_read ON public.grade_validations;
CREATE POLICY grade_validations_staff_read ON public.grade_validations FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.is_staff(auth.uid()) AND school_id = public.current_school_id()));
DROP POLICY IF EXISTS grade_validations_staff_insert ON public.grade_validations;
CREATE POLICY grade_validations_staff_insert ON public.grade_validations FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR (public.is_staff(auth.uid()) AND school_id = public.current_school_id()));
DROP POLICY IF EXISTS grade_validations_direction_delete ON public.grade_validations;
CREATE POLICY grade_validations_direction_delete ON public.grade_validations FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.is_direction(auth.uid()) AND school_id = public.current_school_id()));

-- Une saisie validée ne se modifie plus : insertion / modification de note refusées, sauf direction.
CREATE OR REPLACE FUNCTION public.grades_block_when_validated()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_class uuid;
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin(auth.uid()) OR public.is_direction(auth.uid()) THEN
    RETURN NEW;
  END IF;
  SELECT class_id INTO v_class FROM public.students WHERE id = NEW.student_id;
  IF v_class IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.grade_validations v
    WHERE v.school_id = NEW.school_id AND v.class_id = v_class AND v.subject_id = NEW.subject_id
      AND v.period = NEW.period
      AND v.evaluation_type = coalesce(NEW.evaluation_type, 'composition')
      AND v.academic_year = coalesce(NEW.academic_year, public.current_academic_year_default())
  ) THEN
    RAISE EXCEPTION 'Saisie validée : les notes de cette classe, matière et période ne sont plus modifiables. Demandez à la direction de la rouvrir.'
      USING ERRCODE = 'P0001', HINT = 'grades_validated';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_grades_block_when_validated ON public.grades;
CREATE TRIGGER trg_grades_block_when_validated
  BEFORE INSERT OR UPDATE ON public.grades
  FOR EACH ROW EXECUTE FUNCTION public.grades_block_when_validated();
