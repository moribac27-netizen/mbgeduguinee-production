-- MBGEduGuinée — durcissement final production
-- Objectifs :
-- 1) imposer une frontière multi-établissement au niveau RLS pour toute table
--    portant school_id, même si une ancienne policy est trop permissive ;
-- 2) conserver les opérations de paiement accessibles en RESTRICTED ;
-- 3) imposer le verrou individuel VALIDATED sur les données pédagogiques
--    sensibles ;
-- 4) empêcher les lectures inter-écoles des accusés de lecture.

DO $$
DECLARE
  r record;
  policy_name text := 'prod_tenant_boundary';
BEGIN
  FOR r IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'school_id'
      AND c.table_name NOT IN (
        'school_subscriptions',
        'subscription_history',
        'subscription_payment_requests',
        'subscription_plans'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, r.table_name);
    EXECUTE format($fmt$
      CREATE POLICY %I ON public.%I
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        public.is_super_admin(auth.uid())
        OR public.same_school(school_id)
      )
      WITH CHECK (
        public.is_super_admin(auth.uid())
        OR public.same_school(school_id)
      )
    $fmt$, policy_name, r.table_name);
  END LOOP;
END $$;

-- Les notes ne sont accessibles qu'en mode FULL et pour un élève dont la
-- cotisation annuelle de l'année courante est VALIDATED.
DROP POLICY IF EXISTS grades_require_school_full ON public.grades;
CREATE POLICY grades_require_school_full ON public.grades
AS RESTRICTIVE FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.school_access_mode(school_id) = 'FULL'
    AND public.student_plan_paid(student_id)
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.school_access_mode(school_id) = 'FULL'
    AND public.student_plan_paid(student_id)
  )
);

-- Les présences font partie du dossier pédagogique individuel.
DROP POLICY IF EXISTS student_attendance_require_paid ON public.student_attendance;
CREATE POLICY student_attendance_require_paid ON public.student_attendance
AS RESTRICTIVE FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.school_access_mode(school_id) = 'FULL'
    AND public.student_plan_paid(student_id)
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.school_access_mode(school_id) = 'FULL'
    AND public.student_plan_paid(student_id)
  )
);

-- Le calendrier des examens est un module d'école : il suit le seuil global,
-- sans exiger une cotisation individuelle puisque la ligne n'est pas liée à
-- un élève précis.
DROP POLICY IF EXISTS exams_require_school_full ON public.exams;
CREATE POLICY exams_require_school_full ON public.exams
AS RESTRICTIVE FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.school_access_mode(school_id) = 'FULL'
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.school_access_mode(school_id) = 'FULL'
);

-- Les accusés de lecture ne doivent jamais exposer les habitudes de lecture
-- d'une autre école à un membre du personnel.
DROP POLICY IF EXISTS circular_reads_same_school ON public.circular_reads;
CREATE POLICY circular_reads_same_school ON public.circular_reads
AS RESTRICTIVE FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.circulars c
    WHERE c.id = circular_reads.circular_id
      AND public.same_school(c.school_id)
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.circulars c
    WHERE c.id = circular_reads.circular_id
      AND public.same_school(c.school_id)
  )
);

-- Les fonctions de contrôle utilisées par le frontend ne sont pas publiques.
REVOKE ALL ON FUNCTION public.student_plan_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_plan_paid(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.school_access_mode(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_access_mode(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.same_school(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.same_school(uuid) TO authenticated;

-- Mise à jour du millésime scolaire de production : la rentrée de septembre 2026
-- ouvre l'année scolaire 2026-2027. On ne remplace que l'ancien millésime
-- par défaut/placeholder pour ne pas écraser une année volontairement configurée.
UPDATE public.schools
SET academic_year = '2026-2027'
WHERE academic_year IS NULL OR academic_year = '2025-2026';

COMMENT ON SCHEMA public IS 'MBGEduGuinée production: RLS multi-établissement et modèle annuel 50 000 GNF/élève.';
