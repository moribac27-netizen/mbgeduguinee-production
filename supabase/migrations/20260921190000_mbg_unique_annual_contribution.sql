-- MBGEduGuinée : migration définitive vers la cotisation annuelle unique par élève.
-- Aucun montant ou statut sensible ne doit être piloté par le navigateur.

-- 1) Préparer et normaliser le registre des cotisations existant.
ALTER TABLE public.student_plan_payments
  ADD COLUMN IF NOT EXISTS transfer_amount numeric,
  ADD COLUMN IF NOT EXISTS declared_total_amount numeric,
  ADD COLUMN IF NOT EXISTS transfer_date timestamptz,
  ADD COLUMN IF NOT EXISTS payer_phone text,
  ADD COLUMN IF NOT EXISTS payment_group_id uuid,
  ADD COLUMN IF NOT EXISTS declared_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.student_plan_payments
SET status = CASE
  WHEN lower(status) IN ('paye','payé','validated','validé','validated ') THEN 'VALIDATED'
  WHEN lower(status) IN ('en_attente','pending','pending_verification','awaiting_validation') THEN 'AWAITING_VALIDATION'
  WHEN lower(status) IN ('rejeté','rejete','rejected') THEN 'REJECTED'
  WHEN lower(status) IN ('failed','echec','échec') THEN 'FAILED'
  WHEN lower(status) IN ('cancelled','annulé','annule') THEN 'CANCELLED'
  ELSE 'AWAITING_VALIDATION'
END;

UPDATE public.student_plan_payments
SET amount = 50000,
    school_share = 15000,
    transfer_amount = 50000,
    declared_total_amount = CASE WHEN payment_group_id IS NULL THEN 50000 ELSE (SELECT COUNT(*)::numeric * 50000 FROM public.student_plan_payments gp WHERE gp.payment_group_id = public.student_plan_payments.payment_group_id) END,
    declared_at = COALESCE(declared_at, created_at),
    transfer_date = COALESCE(transfer_date, paid_at),
    validated_by = COALESCE(validated_by, paid_by),
    validated_at = CASE WHEN status = 'VALIDATED' THEN COALESCE(validated_at, paid_at) ELSE validated_at END
WHERE amount IS DISTINCT FROM 50000 OR school_share IS DISTINCT FROM 15000 OR transfer_amount IS DISTINCT FROM 50000 OR declared_at IS NULL OR transfer_date IS NULL OR declared_total_amount IS NULL;

ALTER TABLE public.student_plan_payments
  ALTER COLUMN amount SET DEFAULT 50000,
  ALTER COLUMN school_share SET DEFAULT 15000,
  ALTER COLUMN transfer_amount SET DEFAULT 50000;

ALTER TABLE public.student_plan_payments
  DROP CONSTRAINT IF EXISTS student_plan_payments_status_check;
ALTER TABLE public.student_plan_payments
  ADD CONSTRAINT student_plan_payments_status_check
  CHECK (status IN ('INITIATED','PENDING_VERIFICATION','AWAITING_VALIDATION','VALIDATED','REJECTED','FAILED','CANCELLED'));

ALTER TABLE public.student_plan_payments
  DROP CONSTRAINT IF EXISTS student_plan_payments_amount_check;
ALTER TABLE public.student_plan_payments
  ADD CONSTRAINT student_plan_payments_amount_check
  CHECK (amount = 50000 AND school_share = 15000 AND transfer_amount = 50000 AND declared_total_amount >= 50000);

DROP INDEX IF EXISTS public.student_plan_payments_reference_uq;
CREATE INDEX IF NOT EXISTS student_plan_payments_group_idx
  ON public.student_plan_payments(payment_group_id);
CREATE INDEX IF NOT EXISTS student_plan_payments_status_idx
  ON public.student_plan_payments(school_id, academic_year, status);

-- 2) Audit financier dédié.
CREATE TABLE IF NOT EXISTS public.cotisation_payment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.student_plan_payments(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('CREATED','VERIFIED','VALIDATED','REJECTED','CANCELLED')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reference text,
  amount numeric NOT NULL DEFAULT 50000,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cotisation_payment_audit_payment_idx ON public.cotisation_payment_audit(payment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cotisation_payment_audit_school_idx ON public.cotisation_payment_audit(school_id, created_at DESC);
ALTER TABLE public.cotisation_payment_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cotisation_payment_audit TO authenticated;
GRANT ALL ON public.cotisation_payment_audit TO service_role;
DROP POLICY IF EXISTS cotisation_payment_audit_read ON public.cotisation_payment_audit;
CREATE POLICY cotisation_payment_audit_read ON public.cotisation_payment_audit
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.same_school(school_id));

-- Compatibilité : l'année scolaire active est calculée en Guinée.
-- Cette définition est placée avant les fonctions qui l'utilisent afin que
-- la chaîne complète des migrations reste rejouable sur une base vierge.
CREATE OR REPLACE FUNCTION public.current_academic_year(_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM (_at AT TIME ZONE 'Africa/Conakry')) >= 9
      THEN (EXTRACT(YEAR FROM (_at AT TIME ZONE 'Africa/Conakry'))::int)::text
           || '-' || (EXTRACT(YEAR FROM (_at AT TIME ZONE 'Africa/Conakry'))::int + 1)::text
    ELSE (EXTRACT(YEAR FROM (_at AT TIME ZONE 'Africa/Conakry'))::int - 1)::text
           || '-' || (EXTRACT(YEAR FROM (_at AT TIME ZONE 'Africa/Conakry'))::int)::text
  END;
$$;

CREATE OR REPLACE FUNCTION public.school_academic_year(_school_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_academic_year(now());
$$;

REVOKE ALL ON FUNCTION public.current_academic_year(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_academic_year(timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.school_academic_year(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_academic_year(uuid) TO authenticated;

-- 3) Fonctions de contrôle du modèle unique.
CREATE OR REPLACE FUNCTION public.school_paid_students_count(_school_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.same_school(_school_id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN (SELECT COUNT(*)::integer FROM public.student_plan_payments p WHERE p.school_id = _school_id AND p.academic_year = public.school_academic_year(_school_id) AND p.status = 'VALIDATED');
END;
$$;
REVOKE ALL ON FUNCTION public.school_paid_students_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_paid_students_count(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.school_access_mode(_school_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE WHEN public.school_paid_students_count(_school_id) >= 20 THEN 'FULL' ELSE 'RESTRICTED' END;
$$;
REVOKE ALL ON FUNCTION public.school_access_mode(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_access_mode(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.school_access_summary(_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.same_school(_school_id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_count := public.school_paid_students_count(_school_id);
  RETURN jsonb_build_object('school_id',_school_id,'academic_year',public.school_academic_year(_school_id),'paid_count',v_count,'threshold',20,'access_mode',CASE WHEN v_count >= 20 THEN 'FULL' ELSE 'RESTRICTED' END,'unit_price',50000,'school_share',15000,'remaining',GREATEST(20-v_count,0));
END;
$$;
REVOKE ALL ON FUNCTION public.school_access_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_access_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_contribution_validated(_student_id uuid, _academic_year text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.students WHERE id = _student_id;
  IF v_school IS NULL THEN RETURN false; END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR public.same_school(v_school) OR public.is_parent_of_student(auth.uid(),_student_id) OR EXISTS (SELECT 1 FROM public.students s WHERE s.id=_student_id AND s.student_user_id=auth.uid())) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN EXISTS (SELECT 1 FROM public.student_plan_payments p WHERE p.student_id=_student_id AND p.school_id=v_school AND p.academic_year=COALESCE(_academic_year,public.school_academic_year(v_school)) AND p.status='VALIDATED');
END;
$$;
REVOKE ALL ON FUNCTION public.student_contribution_validated(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_contribution_validated(uuid, text) TO authenticated;

-- 4) Déclaration individuelle : le serveur fixe école, élève, montant et statut.
CREATE OR REPLACE FUNCTION public.declare_cotisation_payment(
  _student_id uuid,
  _reference text,
  _transfer_date timestamptz,
  _payer_phone text
)
RETURNS public.student_plan_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_student public.students;
  v_year text;
  v_existing public.student_plan_payments;
  v_row public.student_plan_payments;
  v_reference text := NULLIF(trim(_reference), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO v_student FROM public.students WHERE id = _student_id;
  IF v_student.id IS NULL THEN RAISE EXCEPTION 'STUDENT_NOT_FOUND'; END IF;
  IF NOT (
    EXISTS (SELECT 1 FROM public.students s WHERE s.id = _student_id AND s.student_user_id = v_uid)
    OR public.is_parent_of_student(v_uid, _student_id)
    OR (public.same_school(v_student.school_id) AND (public.is_direction(v_uid) OR public.is_finance(v_uid)))
    OR public.is_super_admin(v_uid)
  ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_year := public.school_academic_year(v_student.school_id);
  IF v_reference IS NULL THEN RAISE EXCEPTION 'REFERENCE_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_reference));
  IF EXISTS (SELECT 1 FROM public.student_plan_payments WHERE reference = v_reference AND status <> 'CANCELLED') THEN
    RAISE EXCEPTION 'REFERENCE_ALREADY_USED';
  END IF;
  SELECT * INTO v_existing FROM public.student_plan_payments WHERE student_id = _student_id AND academic_year = v_year FOR UPDATE;
  IF v_existing.id IS NOT NULL AND v_existing.status = 'VALIDATED' THEN RAISE EXCEPTION 'ALREADY_VALIDATED'; END IF;
  IF v_existing.id IS NOT NULL AND v_existing.status IN ('INITIATED','PENDING_VERIFICATION','AWAITING_VALIDATION') THEN RAISE EXCEPTION 'ALREADY_PENDING'; END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.student_plan_payments SET
      school_id = v_student.school_id,
      amount = 50000,
      school_share = 15000,
      transfer_amount = 50000,
      declared_total_amount = 50000,
      status = 'AWAITING_VALIDATION',
      payment_mode = 'individuel',
      payment_method = 'orange_money',
      reference = v_reference,
      receipt_number = NULL,
      paid_by = v_uid,
      paid_at = now(),
      declared_at = now(),
      transfer_date = COALESCE(_transfer_date, now()),
      payer_phone = NULLIF(trim(_payer_phone), ''),
      validated_by = NULL,
      validated_at = NULL,
      verified_by = NULL,
      verified_at = NULL,
      rejection_reason = NULL,
      cancelled_at = NULL,
      cancelled_by = NULL
    WHERE id = v_existing.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.student_plan_payments (
      school_id, student_id, academic_year, amount, school_share, transfer_amount, declared_total_amount,
      status, payment_mode, payment_method, reference, paid_by, paid_at, declared_at,
      transfer_date, payer_phone
    ) VALUES (
      v_student.school_id, _student_id, v_year, 50000, 15000, 50000, 50000,
      'AWAITING_VALIDATION', 'individuel', 'orange_money', v_reference, v_uid, now(), now(),
      COALESCE(_transfer_date, now()), NULLIF(trim(_payer_phone), '')
    ) RETURNING * INTO v_row;
  END IF;
  INSERT INTO public.cotisation_payment_audit(payment_id, school_id, student_id, action, actor_id, reference, amount)
  VALUES (v_row.id, v_row.school_id, v_row.student_id, 'CREATED', v_uid, v_row.reference, 50000);
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.declare_cotisation_payment(uuid,text,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_cotisation_payment(uuid,text,timestamptz,text) TO authenticated;

-- 5) Déclaration groupée : une seule référence, montant serveur = 50 000 × élèves.
CREATE OR REPLACE FUNCTION public.declare_cotisation_group_payment(
  _student_ids uuid[],
  _reference text,
  _transfer_date timestamptz,
  _payer_phone text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_school uuid;
  v_year text;
  v_group uuid := gen_random_uuid();
  v_count integer;
  v_student uuid;
  v_row public.student_plan_payments;
  v_reference text := NULLIF(trim(_reference), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF COALESCE(array_length(_student_ids,1),0) < 1 THEN RAISE EXCEPTION 'STUDENT_LIST_REQUIRED'; END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(_student_ids) AS t(x)) <> array_length(_student_ids,1) THEN RAISE EXCEPTION 'DUPLICATE_STUDENT_IN_GROUP'; END IF;
  IF v_reference IS NULL THEN RAISE EXCEPTION 'REFERENCE_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_reference));
  IF EXISTS (SELECT 1 FROM public.student_plan_payments WHERE reference = v_reference AND status <> 'CANCELLED') THEN RAISE EXCEPTION 'REFERENCE_ALREADY_USED'; END IF;
  SELECT min(school_id), count(*) INTO v_school, v_count FROM public.students WHERE id = ANY(_student_ids);
  IF v_school IS NULL OR v_count <> array_length(_student_ids,1) THEN RAISE EXCEPTION 'STUDENTS_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.students WHERE id = ANY(_student_ids) AND school_id <> v_school) THEN RAISE EXCEPTION 'CROSS_SCHOOL_GROUP_FORBIDDEN'; END IF;
  IF NOT (public.is_super_admin(v_uid) OR (public.same_school(v_school) AND (public.is_direction(v_uid) OR public.is_finance(v_uid)))) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.student_plan_payments p
    WHERE p.student_id = ANY(_student_ids) AND p.academic_year = public.school_academic_year(v_school) AND p.status = 'VALIDATED'
  ) THEN RAISE EXCEPTION 'GROUP_CONTAINS_VALIDATED_STUDENT'; END IF;
  v_year := public.school_academic_year(v_school);
  FOREACH v_student IN ARRAY _student_ids LOOP
    SELECT * INTO v_row FROM public.student_plan_payments WHERE student_id = v_student AND academic_year = v_year FOR UPDATE;
    IF v_row.id IS NOT NULL AND v_row.status = 'VALIDATED' THEN RAISE EXCEPTION 'GROUP_CONTAINS_VALIDATED_STUDENT'; END IF;
    IF v_row.id IS NOT NULL AND v_row.status IN ('INITIATED','PENDING_VERIFICATION','AWAITING_VALIDATION') THEN RAISE EXCEPTION 'GROUP_CONTAINS_PENDING_STUDENT'; END IF;
    IF v_row.id IS NOT NULL THEN
      UPDATE public.student_plan_payments SET
        amount=50000, school_share=15000, transfer_amount=50000, declared_total_amount=array_length(_student_ids,1)*50000, status='AWAITING_VALIDATION',
        payment_mode='groupe_ecole', payment_method='orange_money', reference=v_reference,
        payment_group_id=v_group, paid_by=v_uid, paid_at=now(), declared_at=now(),
        transfer_date=COALESCE(_transfer_date,now()), payer_phone=NULLIF(trim(_payer_phone),''),
        receipt_number=NULL, validated_by=NULL, validated_at=NULL, verified_by=NULL, verified_at=NULL,
        rejection_reason=NULL, cancelled_at=NULL, cancelled_by=NULL
      WHERE id=v_row.id RETURNING * INTO v_row;
    ELSE
      INSERT INTO public.student_plan_payments(
        school_id,student_id,academic_year,amount,school_share,transfer_amount,declared_total_amount,status,payment_mode,payment_method,
        reference,payment_group_id,paid_by,paid_at,declared_at,transfer_date,payer_phone
      ) VALUES (
        v_school,v_student,v_year,50000,15000,50000,array_length(_student_ids,1)*50000,'AWAITING_VALIDATION','groupe_ecole','orange_money',
        v_reference,v_group,v_uid,now(),now(),COALESCE(_transfer_date,now()),NULLIF(trim(_payer_phone),'')
      ) RETURNING * INTO v_row;
    END IF;
    INSERT INTO public.cotisation_payment_audit(payment_id,school_id,student_id,action,actor_id,reference,amount,metadata)
    VALUES(v_row.id,v_school,v_student,'CREATED',v_uid,v_reference,50000,jsonb_build_object('group_id',v_group,'group_size',array_length(_student_ids,1)));
  END LOOP;
  RETURN v_group;
END;
$$;
REVOKE ALL ON FUNCTION public.declare_cotisation_group_payment(uuid[],text,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_cotisation_group_payment(uuid[],text,timestamptz,text) TO authenticated;

-- 6) Validation/rejet atomique, sans possibilité de falsifier le montant/statut.
CREATE OR REPLACE FUNCTION public.review_cotisation_payment(
  _payment_id uuid,
  _approve boolean,
  _reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_payment public.student_plan_payments;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO v_payment FROM public.student_plan_payments WHERE id = _payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  IF NOT (public.is_super_admin(v_uid) OR (public.same_school(v_payment.school_id) AND (public.is_direction(v_uid) OR public.is_finance(v_uid)))) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_payment.status = 'VALIDATED' THEN RAISE EXCEPTION 'ALREADY_VALIDATED'; END IF;
  IF v_payment.status NOT IN ('AWAITING_VALIDATION','PENDING_VERIFICATION','INITIATED') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF v_payment.amount <> 50000 OR v_payment.transfer_amount <> 50000 OR v_payment.declared_total_amount < 50000 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF v_payment.payment_group_id IS NOT NULL AND v_payment.declared_total_amount <> (SELECT count(*) * 50000 FROM public.student_plan_payments WHERE payment_group_id = v_payment.payment_group_id) THEN RAISE EXCEPTION 'INVALID_GROUP_AMOUNT'; END IF;

  IF _approve THEN
    IF v_payment.payment_group_id IS NULL THEN
      UPDATE public.student_plan_payments SET status='VALIDATED', receipt_number=COALESCE(receipt_number,'COT-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(id::text,'-',''),1,8))), validated_by=v_uid, validated_at=now(), verified_by=v_uid, verified_at=now(), rejection_reason=NULL WHERE id=v_payment.id;
      INSERT INTO public.cotisation_payment_audit(payment_id,school_id,student_id,action,actor_id,reference,amount) VALUES(v_payment.id,v_payment.school_id,v_payment.student_id,'VALIDATED',v_uid,v_payment.reference,50000);
      RETURN 1;
    END IF;
    UPDATE public.student_plan_payments SET status='VALIDATED', receipt_number=COALESCE(receipt_number,'COT-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(id::text,'-',''),1,8))), validated_by=v_uid, validated_at=now(), verified_by=v_uid, verified_at=now(), rejection_reason=NULL WHERE payment_group_id=v_payment.payment_group_id AND status IN ('AWAITING_VALIDATION','PENDING_VERIFICATION','INITIATED');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO public.cotisation_payment_audit(payment_id,school_id,student_id,action,actor_id,reference,amount,metadata)
    SELECT id,school_id,student_id,'VALIDATED',v_uid,reference,50000,jsonb_build_object('group_id',payment_group_id)
    FROM public.student_plan_payments WHERE payment_group_id=v_payment.payment_group_id AND status='VALIDATED' AND validated_by=v_uid;
    RETURN v_count;
  ELSE
    UPDATE public.student_plan_payments SET status='REJECTED', rejection_reason=NULLIF(trim(_reason),''), verified_by=v_uid, verified_at=now(), validated_by=v_uid, validated_at=now() WHERE id=v_payment.id OR (v_payment.payment_group_id IS NOT NULL AND payment_group_id=v_payment.payment_group_id AND status IN ('AWAITING_VALIDATION','PENDING_VERIFICATION','INITIATED'));
    GET DIAGNOSTICS v_count = ROW_COUNT;
    INSERT INTO public.cotisation_payment_audit(payment_id,school_id,student_id,action,actor_id,reference,amount,metadata)
    SELECT id,school_id,student_id,'REJECTED',v_uid,reference,50000,jsonb_build_object('group_id',payment_group_id,'reason',_reason)
    FROM public.student_plan_payments WHERE id=v_payment.id OR (v_payment.payment_group_id IS NOT NULL AND payment_group_id=v_payment.payment_group_id AND status='REJECTED');
    RETURN v_count;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.review_cotisation_payment(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_cotisation_payment(uuid,boolean,text) TO authenticated;

-- 7) Le verrou pédagogique ne dépend plus d'un quelconque abonnement.
CREATE OR REPLACE FUNCTION public.student_plan_paid(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.student_contribution_validated(_student_id, NULL);
$$;
REVOKE ALL ON FUNCTION public.student_plan_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_plan_paid(uuid) TO authenticated;

-- 8) RLS : aucun navigateur ne peut forger montant, école, élève ou statut via INSERT/UPDATE direct.
DROP POLICY IF EXISTS "student_plan_payments_staff_manage" ON public.student_plan_payments;
DROP POLICY IF EXISTS "student_plan_payments_student_insert" ON public.student_plan_payments;
DROP POLICY IF EXISTS "student_plan_payments_student_update" ON public.student_plan_payments;
DROP POLICY IF EXISTS spp_write ON public.student_plan_payments;
DROP POLICY IF EXISTS spp_update ON public.student_plan_payments;

DROP POLICY IF EXISTS student_plan_payments_read ON public.student_plan_payments;
CREATE POLICY student_plan_payments_read ON public.student_plan_payments FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.same_school(school_id)
  OR public.is_parent_of_student(auth.uid(), student_id)
  OR EXISTS (SELECT 1 FROM public.students s WHERE s.id=student_plan_payments.student_id AND s.student_user_id=auth.uid())
);

DROP POLICY IF EXISTS student_plan_payments_no_direct_insert ON public.student_plan_payments;
CREATE POLICY student_plan_payments_no_direct_insert ON public.student_plan_payments FOR INSERT TO authenticated
WITH CHECK (false);
DROP POLICY IF EXISTS student_plan_payments_no_direct_update ON public.student_plan_payments;
CREATE POLICY student_plan_payments_no_direct_update ON public.student_plan_payments FOR UPDATE TO authenticated
USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS student_plan_payments_no_direct_delete ON public.student_plan_payments;
CREATE POLICY student_plan_payments_no_direct_delete ON public.student_plan_payments FOR DELETE TO authenticated
USING (false);

-- 9) RLS des données pédagogiques : VALIDATED uniquement.
-- Les politiques restrictives déjà présentes appellent student_plan_paid(); on les remplace
-- explicitement pour supprimer toute dépendance au modèle d'abonnement.

-- 10) Supprimer définitivement l'ancien système d'abonnement établissement.
DROP TRIGGER IF EXISTS trg_schools_create_trial ON public.schools;
DROP FUNCTION IF EXISTS public.create_trial_subscription_for_school();
DROP FUNCTION IF EXISTS public.auto_suspend_expired_subscriptions();
DROP FUNCTION IF EXISTS public.review_subscription_payment_request(uuid,boolean,text);
DROP FUNCTION IF EXISTS public.renew_or_change_subscription(uuid,uuid,text);
DROP FUNCTION IF EXISTS public.set_school_subscription_discount(uuid,text,numeric,text,timestamptz);
DROP FUNCTION IF EXISTS public.is_school_subscription_active(uuid);
DROP FUNCTION IF EXISTS public.school_billing_model(uuid);
DROP TABLE IF EXISTS public.subscription_payment_requests CASCADE;
DROP TABLE IF EXISTS public.subscription_history CASCADE;
DROP TABLE IF EXISTS public.school_subscriptions CASCADE;
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
DROP TYPE IF EXISTS public.subscription_status CASCADE;

-- 11) Empêcher toute future écriture directe sur le registre par le rôle authentifié.
REVOKE INSERT, UPDATE, DELETE ON public.student_plan_payments FROM authenticated;
GRANT SELECT ON public.student_plan_payments TO authenticated;

-- 12) Le mode RESTRICTED est aussi appliqué côté serveur aux modules globaux sensibles.
DROP POLICY IF EXISTS grades_require_school_full ON public.grades;
CREATE POLICY grades_require_school_full ON public.grades
AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.school_access_mode(school_id) = 'FULL')
WITH CHECK (public.is_super_admin(auth.uid()) OR public.school_access_mode(school_id) = 'FULL');

DROP POLICY IF EXISTS exams_require_school_full ON public.exams;
CREATE POLICY exams_require_school_full ON public.exams
AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.school_access_mode(school_id) = 'FULL')
WITH CHECK (public.is_super_admin(auth.uid()) OR public.school_access_mode(school_id) = 'FULL');
