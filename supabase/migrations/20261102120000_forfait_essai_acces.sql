-- Forfait établissement : accès complet (notes, bulletins, examens…) pendant la période d'essai et tant que le forfait est en règle.
-- Avant : la base ne reconnaissait « en règle » qu'après un premier paiement validé, alors que l'application annonce un essai
-- (7 jours / 10 élèves) : notes, bulletins et examens restaient bloqués pour tous les enseignants d'une école en essai.
-- Reste bloqué : essai terminé sans paiement (unpaid) et forfait en retard (overdue). Idempotent ; aucune donnée modifiée.

create or replace function public.school_access_mode(_school_id uuid)
returns text language sql stable security definer set search_path to 'public' as $function$
  SELECT CASE
    WHEN public.is_super_admin(auth.uid()) THEN 'FULL'
    WHEN (public._school_flat_sub(_school_id)).id IS NOT NULL THEN
      CASE WHEN public.same_school(_school_id) AND public.school_flat_phase(_school_id) IN ('active','trial') THEN 'FULL' ELSE 'RESTRICTED' END
    WHEN public.school_paid_students_count(_school_id) >= 20 THEN 'FULL'
    ELSE 'RESTRICTED'
  END;
$function$;

create or replace function public.student_contribution_validated(_student_id uuid, _academic_year text default null)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
DECLARE v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.students WHERE id = _student_id;
  IF v_school IS NULL THEN RETURN false; END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR public.same_school(v_school)
          OR public.is_parent_of_student(auth.uid(), _student_id)
          OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = _student_id AND s.student_user_id = auth.uid())) THEN
    RETURN false;
  END IF;
  IF (public._school_flat_sub(v_school)).id IS NOT NULL THEN
    RETURN public.school_flat_phase(v_school) IN ('active','trial');
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.student_plan_payments p
                 WHERE p.student_id = _student_id AND p.school_id = v_school
                   AND p.academic_year = COALESCE(_academic_year, public.school_academic_year(v_school))
                   AND p.status = 'VALIDATED');
END;
$function$;
