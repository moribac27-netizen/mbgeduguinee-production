-- Espace élève : sécurité et prise en charge complète du plan de cotisation par élève.
-- Cette migration est idempotente afin de pouvoir être appliquée sur une base
-- déjà partiellement configurée.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS price_per_student numeric NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS school_share_per_student numeric NOT NULL DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS access_threshold_students integer NOT NULL DEFAULT 20;

CREATE TABLE IF NOT EXISTS public.student_plan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  school_share numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'en_attente',
  payment_mode text NOT NULL DEFAULT 'individuel',
  payment_method text,
  reference text,
  receipt_number text,
  paid_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_student_plan_payments_school_year
  ON public.student_plan_payments(school_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_student_plan_payments_student_year
  ON public.student_plan_payments(student_id, academic_year);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_plan_payments TO authenticated;
GRANT ALL ON public.student_plan_payments TO service_role;
ALTER TABLE public.student_plan_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "student_plan_payments_staff_manage" ON public.student_plan_payments;
CREATE POLICY "student_plan_payments_staff_manage"
ON public.student_plan_payments FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.is_staff(auth.uid()) AND school_id = public.current_school_id())
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (public.is_staff(auth.uid()) AND school_id = public.current_school_id())
);

DROP POLICY IF EXISTS "student_plan_payments_parent_read" ON public.student_plan_payments;
CREATE POLICY "student_plan_payments_parent_read"
ON public.student_plan_payments FOR SELECT TO authenticated
USING (public.is_parent_of_student(auth.uid(), student_id));

DROP POLICY IF EXISTS "student_plan_payments_student_read" ON public.student_plan_payments;
CREATE POLICY "student_plan_payments_student_read"
ON public.student_plan_payments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = student_plan_payments.student_id
      AND s.student_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "student_plan_payments_student_insert" ON public.student_plan_payments;
CREATE POLICY "student_plan_payments_student_insert"
ON public.student_plan_payments FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = student_plan_payments.student_id
      AND s.student_user_id = auth.uid()
      AND s.school_id = student_plan_payments.school_id
  )
  AND student_plan_payments.school_id = public.current_school_id()
);

DROP POLICY IF EXISTS "student_plan_payments_student_update" ON public.student_plan_payments;
CREATE POLICY "student_plan_payments_student_update"
ON public.student_plan_payments FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = student_plan_payments.student_id
      AND s.student_user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = student_plan_payments.student_id
      AND s.student_user_id = auth.uid()
      AND s.school_id = student_plan_payments.school_id
  )
  AND student_plan_payments.school_id = public.current_school_id()
);

CREATE OR REPLACE FUNCTION public.school_paid_students_count(_school_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.student_plan_payments p
  WHERE p.school_id = _school_id
    AND p.status = 'paye'
    AND p.academic_year = public.school_academic_year(_school_id);
$$;

REVOKE EXECUTE ON FUNCTION public.school_paid_students_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_paid_students_count(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.school_per_student_threshold(_school_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sp.access_threshold_students, 20)::integer
  FROM public.school_subscriptions ss
  JOIN public.subscription_plans sp ON sp.id = ss.plan_id
  WHERE ss.school_id = _school_id
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.school_per_student_threshold(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_per_student_threshold(uuid) TO authenticated;

-- Un élève ne doit voir que ses paiements scolaires classiques.
DROP POLICY IF EXISTS "payments_student_self_read" ON public.payments;
CREATE POLICY "payments_student_self_read"
ON public.payments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = payments.student_id
      AND s.student_user_id = auth.uid()
  )
);

-- L'emploi du temps reste accessible au personnel/enseignants selon les
-- politiques existantes, mais un élève/parent ne peut consulter que la classe
-- concernée.
DROP POLICY IF EXISTS "schedule_same_school_read" ON public.schedule_slots;
CREATE POLICY "schedule_same_school_or_own_class_read"
ON public.schedule_slots FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.is_staff(auth.uid()) AND school_id = public.current_school_id())
  OR public.teacher_teaches_class(auth.uid(), class_id)
  OR EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.class_id = schedule_slots.class_id
      AND s.student_user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.class_id = schedule_slots.class_id
      AND s.parent_user_id = auth.uid()
  )
);
