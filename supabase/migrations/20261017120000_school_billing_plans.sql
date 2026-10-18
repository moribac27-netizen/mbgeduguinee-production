-- Facturation des établissements : 2 forfaits configurables selon l'effectif, paiement mensuel ou annuel.
--
-- Ce module est AJOUTÉ à côté du modèle existant (offres par élève `subscription_offers`, cotisations
-- `student_plan_payments`, commissions). Il ne modifie, ne supprime et ne recalcule aucune de ces données.
--
-- Règles métier
--   * Deux forfaits (forfait_1, forfait_2), prix mensuel et effectif maximal modifiables par le Super Admin.
--     Valeurs initiales : 150 000 GNF/mois jusqu'à 600 élèves ; 200 000 GNF/mois jusqu'à 1 000 000 d'élèves.
--   * Pas de chevauchement : seuls les effectifs MAXIMAUX sont enregistrés. Le minimum d'un forfait est
--     toujours (maximum du forfait actif précédent + 1). Le forfait applicable est le forfait actif dont le
--     maximum est le plus petit tout en couvrant l'effectif réel (élèves au statut « actif »).
--   * Mensuel  : prix mensuel.
--     Annuel   : prix mensuel × (12 − mois offerts). Mois offerts : paramètre Super Admin, 2 par défaut (0 à 12).
--   * Tout montant est calculé PAR LE SERVEUR au moment de la déclaration, puis figé (instantané) dans le paiement.
--   * Application des changements de tarif : ils valent pour les NOUVELLES déclarations et les renouvellements.
--     Un paiement déjà déclaré garde son montant ; un paiement validé n'est jamais modifié ni supprimé ;
--     un abonnement en cours garde ses conditions jusqu'à la fin de sa période.
--   * Historique des changements de tarifs (qui, quand, ancienne/nouvelle valeur).
--
-- Idempotent. Aucune suppression de données. Retour arrière : DROP des objets ci-dessous (aucun existant n'en dépend).

-- ---------------------------------------------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  monthly_price numeric NOT NULL CHECK (monthly_price >= 0),
  max_students integer NOT NULL CHECK (max_students >= 1),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  annual_free_months integer NOT NULL DEFAULT 2 CHECK (annual_free_months BETWEEN 0 AND 12),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.billing_plan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_by_email text,
  entity text NOT NULL CHECK (entity IN ('plan', 'settings')),
  plan_code text,
  field text NOT NULL,
  old_value text,
  new_value text
);
CREATE INDEX IF NOT EXISTS billing_plan_history_at_idx ON public.billing_plan_history(changed_at DESC);

CREATE SEQUENCE IF NOT EXISTS public.school_billing_receipt_seq;

CREATE TABLE IF NOT EXISTS public.school_billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.billing_plans(id) ON DELETE SET NULL,
  plan_code text NOT NULL,
  plan_name text NOT NULL,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  students_count integer NOT NULL CHECK (students_count >= 0),
  monthly_price numeric NOT NULL CHECK (monthly_price >= 0),
  free_months integer NOT NULL CHECK (free_months BETWEEN 0 AND 12),
  gross_amount numeric NOT NULL CHECK (gross_amount >= 0),
  discount_amount numeric NOT NULL CHECK (discount_amount >= 0),
  amount numeric NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VALIDATED', 'REJECTED')),
  reference text NOT NULL,
  payer_phone text,
  declared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  declared_at timestamptz NOT NULL DEFAULT now(),
  validated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at timestamptz,
  rejection_reason text,
  receipt_number text UNIQUE,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (gross_amount - discount_amount = amount)
);
CREATE INDEX IF NOT EXISTS school_billing_payments_school_idx ON public.school_billing_payments(school_id, created_at DESC);
-- Une référence de transaction ne sert qu'une fois (sauf paiement refusé) ; un seul paiement en attente par école.
CREATE UNIQUE INDEX IF NOT EXISTS school_billing_payments_reference_uq ON public.school_billing_payments(reference) WHERE status <> 'REJECTED';
CREATE UNIQUE INDEX IF NOT EXISTS school_billing_payments_one_pending_uq ON public.school_billing_payments(school_id) WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS public.school_billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  plan_code text NOT NULL,
  plan_name text NOT NULL,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  monthly_price numeric NOT NULL CHECK (monthly_price >= 0),
  free_months integer NOT NULL CHECK (free_months BETWEEN 0 AND 12),
  last_payment_id uuid REFERENCES public.school_billing_payments(id) ON DELETE SET NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------------------------------------------
-- 2) Valeurs initiales (jamais écrasées si le Super Admin les a déjà changées)
-- ---------------------------------------------------------------------------------------------------------------
INSERT INTO public.billing_plans (code, name, monthly_price, max_students, is_active, sort_order) VALUES
  ('forfait_1', 'Forfait 1', 150000, 600, true, 1),
  ('forfait_2', 'Forfait 2', 200000, 1000000, true, 2)
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.billing_settings (id, annual_free_months) VALUES (true, 2) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Accès : lecture seule côté client, toute écriture passe par les fonctions serveur ci-dessous
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plan_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_billing_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_plans, public.billing_settings, public.billing_plan_history,
              public.school_billing_payments, public.school_billing_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.billing_plans, public.billing_settings TO anon, authenticated;
GRANT SELECT ON public.billing_plan_history, public.school_billing_payments, public.school_billing_subscriptions TO authenticated;
GRANT ALL ON public.billing_plans, public.billing_settings, public.billing_plan_history,
             public.school_billing_payments, public.school_billing_subscriptions TO service_role;

DROP POLICY IF EXISTS billing_plans_public_read ON public.billing_plans;
CREATE POLICY billing_plans_public_read ON public.billing_plans FOR SELECT TO anon USING (is_active);
DROP POLICY IF EXISTS billing_plans_auth_read ON public.billing_plans;
CREATE POLICY billing_plans_auth_read ON public.billing_plans FOR SELECT TO authenticated
  USING (is_active OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS billing_settings_read ON public.billing_settings;
CREATE POLICY billing_settings_read ON public.billing_settings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS billing_history_super_admin_read ON public.billing_plan_history;
CREATE POLICY billing_history_super_admin_read ON public.billing_plan_history FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS billing_payments_read ON public.school_billing_payments;
CREATE POLICY billing_payments_read ON public.school_billing_payments FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR (public.same_school(school_id) AND (public.is_direction(auth.uid()) OR public.is_finance(auth.uid()))));

DROP POLICY IF EXISTS billing_subscriptions_read ON public.school_billing_subscriptions;
CREATE POLICY billing_subscriptions_read ON public.school_billing_subscriptions FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR (public.same_school(school_id) AND (public.is_direction(auth.uid()) OR public.is_finance(auth.uid()))));

-- Un paiement validé ne se modifie ni ne se supprime jamais (montants figés).
CREATE OR REPLACE FUNCTION public.school_billing_payments_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'VALIDATED' THEN RAISE EXCEPTION 'PAYMENT_IMMUTABLE'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'VALIDATED' THEN RAISE EXCEPTION 'PAYMENT_IMMUTABLE'; END IF;
  IF OLD.status = 'REJECTED' THEN RAISE EXCEPTION 'PAYMENT_IMMUTABLE'; END IF;
  -- Les montants et instantanés ne changent jamais après la déclaration.
  IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount OR NEW.monthly_price IS DISTINCT FROM OLD.monthly_price
     OR NEW.free_months IS DISTINCT FROM OLD.free_months OR NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle
     OR NEW.plan_code IS DISTINCT FROM OLD.plan_code OR NEW.school_id IS DISTINCT FROM OLD.school_id THEN
    RAISE EXCEPTION 'PAYMENT_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_school_billing_payments_guard ON public.school_billing_payments;
CREATE TRIGGER trg_school_billing_payments_guard BEFORE UPDATE OR DELETE ON public.school_billing_payments
  FOR EACH ROW EXECUTE FUNCTION public.school_billing_payments_guard();

-- ---------------------------------------------------------------------------------------------------------------
-- 4) Calculs (source unique côté serveur ; src/lib/billing.ts reproduit la même formule pour l'affichage)
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.billing_compute(_monthly numeric, _cycle text, _free_months integer)
RETURNS TABLE (gross_amount numeric, discount_amount numeric, amount numeric)
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _monthly IS NULL OR _monthly < 0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
  IF _cycle NOT IN ('monthly', 'yearly') THEN RAISE EXCEPTION 'INVALID_CYCLE'; END IF;
  IF _free_months IS NULL OR _free_months < 0 OR _free_months > 12 THEN RAISE EXCEPTION 'INVALID_FREE_MONTHS'; END IF;
  IF _cycle = 'monthly' THEN
    RETURN QUERY SELECT _monthly, 0::numeric, _monthly;
  ELSE
    RETURN QUERY SELECT _monthly * 12, _monthly * _free_months, _monthly * (12 - _free_months);
  END IF;
END $$;

-- Forfait applicable à un effectif : forfait actif au plus petit maximum qui couvre l'effectif.
CREATE OR REPLACE FUNCTION public.billing_plan_for_headcount(_students integer)
RETURNS public.billing_plans
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.* FROM public.billing_plans p
  WHERE p.is_active AND p.max_students >= GREATEST(COALESCE(_students, 0), 0)
  ORDER BY p.max_students ASC, p.sort_order ASC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.billing_plan_for_headcount(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_plan_for_headcount(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.school_active_students_count(_school_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM public.students WHERE school_id = _school_id AND COALESCE(status, 'actif') = 'actif';
$$;
REVOKE ALL ON FUNCTION public.school_active_students_count(uuid) FROM PUBLIC, anon, authenticated;

-- Devis : forfait, montants mensuel/annuel bruts, réduction et net, pour l'effectif réel de l'école.
CREATE OR REPLACE FUNCTION public.billing_quote(_school_id uuid, _cycle text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_n integer;
  v_plan public.billing_plans;
  v_free integer;
  v_gross numeric; v_disc numeric; v_amount numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT (public.is_super_admin(v_uid)
          OR (public.same_school(_school_id) AND (public.is_direction(v_uid) OR public.is_finance(v_uid)))) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  v_n := public.school_active_students_count(_school_id);
  v_plan := public.billing_plan_for_headcount(v_n);
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'NO_PLAN_FOR_HEADCOUNT'; END IF;
  SELECT annual_free_months INTO v_free FROM public.billing_settings WHERE id;
  SELECT c.gross_amount, c.discount_amount, c.amount INTO v_gross, v_disc, v_amount
    FROM public.billing_compute(v_plan.monthly_price, _cycle, v_free) c;
  RETURN jsonb_build_object(
    'school_id', _school_id, 'students_count', v_n, 'billing_cycle', _cycle,
    'plan_id', v_plan.id, 'plan_code', v_plan.code, 'plan_name', v_plan.name,
    'monthly_price', v_plan.monthly_price, 'free_months', v_free,
    'gross_amount', v_gross, 'discount_amount', v_disc, 'amount', v_amount);
END $$;
REVOKE ALL ON FUNCTION public.billing_quote(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_quote(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 5) Configuration par le Super Admin (atomique : les deux forfaits sont validés ensemble)
--    _plans : [{"code":"forfait_1","monthly_price":150000,"max_students":600,"is_active":true}, ...]
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_billing_config(_plans jsonb, _free_months integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  e jsonb;
  v_old public.billing_plans;
  v_price numeric; v_max integer; v_active boolean;
  v_old_free integer;
  v_prev_max integer := 0;
  r record;
  v_active_count integer := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin(v_uid) THEN RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED'; END IF;
  IF _plans IS NULL OR jsonb_typeof(_plans) <> 'array' THEN RAISE EXCEPTION 'INVALID_PLANS'; END IF;
  IF _free_months IS NULL OR _free_months < 0 OR _free_months > 12 THEN RAISE EXCEPTION 'INVALID_FREE_MONTHS'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  FOR e IN SELECT * FROM jsonb_array_elements(_plans) LOOP
    SELECT * INTO v_old FROM public.billing_plans WHERE code = e->>'code' FOR UPDATE;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'UNKNOWN_PLAN'; END IF;
    BEGIN
      v_price := (e->>'monthly_price')::numeric;
      v_max := (e->>'max_students')::numeric::integer;
      v_active := COALESCE((e->>'is_active')::boolean, v_old.is_active);
      IF (e->>'max_students')::numeric <> v_max THEN RAISE EXCEPTION 'INVALID_THRESHOLD'; END IF;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'INVALID_VALUES';
    END;
    IF v_price IS NULL OR v_price < 0 THEN RAISE EXCEPTION 'INVALID_PRICE'; END IF;
    IF v_max IS NULL OR v_max < 1 THEN RAISE EXCEPTION 'INVALID_THRESHOLD'; END IF;

    IF v_price IS DISTINCT FROM v_old.monthly_price THEN
      INSERT INTO public.billing_plan_history(changed_by, changed_by_email, entity, plan_code, field, old_value, new_value)
      VALUES (v_uid, v_email, 'plan', v_old.code, 'monthly_price', v_old.monthly_price::text, v_price::text);
    END IF;
    IF v_max IS DISTINCT FROM v_old.max_students THEN
      INSERT INTO public.billing_plan_history(changed_by, changed_by_email, entity, plan_code, field, old_value, new_value)
      VALUES (v_uid, v_email, 'plan', v_old.code, 'max_students', v_old.max_students::text, v_max::text);
    END IF;
    IF v_active IS DISTINCT FROM v_old.is_active THEN
      INSERT INTO public.billing_plan_history(changed_by, changed_by_email, entity, plan_code, field, old_value, new_value)
      VALUES (v_uid, v_email, 'plan', v_old.code, 'is_active', v_old.is_active::text, v_active::text);
    END IF;
    UPDATE public.billing_plans SET monthly_price = v_price, max_students = v_max, is_active = v_active, updated_at = now()
     WHERE id = v_old.id;
  END LOOP;

  -- Cohérence globale : au moins un forfait actif, maxima strictement croissants (donc aucun chevauchement).
  FOR r IN SELECT code, max_students FROM public.billing_plans WHERE is_active ORDER BY sort_order LOOP
    v_active_count := v_active_count + 1;
    IF r.max_students <= v_prev_max THEN RAISE EXCEPTION 'THRESHOLDS_OVERLAP'; END IF;
    v_prev_max := r.max_students;
  END LOOP;
  IF v_active_count = 0 THEN RAISE EXCEPTION 'NO_ACTIVE_PLAN'; END IF;

  SELECT annual_free_months INTO v_old_free FROM public.billing_settings WHERE id FOR UPDATE;
  IF _free_months IS DISTINCT FROM v_old_free THEN
    INSERT INTO public.billing_plan_history(changed_by, changed_by_email, entity, plan_code, field, old_value, new_value)
    VALUES (v_uid, v_email, 'settings', NULL, 'annual_free_months', v_old_free::text, _free_months::text);
  END IF;
  UPDATE public.billing_settings SET annual_free_months = _free_months, updated_at = now(), updated_by = v_uid WHERE id;
END $$;
REVOKE ALL ON FUNCTION public.save_billing_config(jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_billing_config(jsonb, integer) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 6) Déclaration d'un paiement par l'école (montant recalculé par le serveur, jamais fourni par le client)
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.declare_school_billing_payment(
  _school_id uuid, _cycle text, _reference text, _payer_phone text DEFAULT NULL)
RETURNS public.school_billing_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ref text := NULLIF(trim(_reference), '');
  v_q jsonb;
  v_row public.school_billing_payments;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT (public.is_super_admin(v_uid)
          OR (public.same_school(_school_id) AND (public.is_direction(v_uid) OR public.is_finance(v_uid)))) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_ref IS NULL THEN RAISE EXCEPTION 'REFERENCE_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_ref));
  PERFORM pg_advisory_xact_lock(hashtext(_school_id::text));
  IF EXISTS (SELECT 1 FROM public.school_billing_payments WHERE reference = v_ref AND status <> 'REJECTED') THEN
    RAISE EXCEPTION 'REFERENCE_ALREADY_USED';
  END IF;
  IF EXISTS (SELECT 1 FROM public.school_billing_payments WHERE school_id = _school_id AND status = 'PENDING') THEN
    RAISE EXCEPTION 'ALREADY_PENDING';
  END IF;
  v_q := public.billing_quote(_school_id, _cycle);
  INSERT INTO public.school_billing_payments (
    school_id, plan_id, plan_code, plan_name, billing_cycle, students_count, monthly_price, free_months,
    gross_amount, discount_amount, amount, reference, payer_phone, declared_by)
  VALUES (
    _school_id, (v_q->>'plan_id')::uuid, v_q->>'plan_code', v_q->>'plan_name', _cycle,
    (v_q->>'students_count')::integer, (v_q->>'monthly_price')::numeric,
    (v_q->>'free_months')::integer,
    (v_q->>'gross_amount')::numeric, (v_q->>'discount_amount')::numeric, (v_q->>'amount')::numeric,
    v_ref, NULLIF(trim(_payer_phone), ''), v_uid)
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.declare_school_billing_payment(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.declare_school_billing_payment(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 7) Validation / refus par le Super Admin uniquement
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_school_billing_payment(_payment_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS public.school_billing_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.school_billing_payments;
  v_sub public.school_billing_subscriptions;
  v_start timestamptz;
  v_end timestamptz;
  v_receipt text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin(v_uid) THEN RAISE EXCEPTION 'SUPER_ADMIN_REQUIRED'; END IF;
  SELECT * INTO v_p FROM public.school_billing_payments WHERE id = _payment_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  IF v_p.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;

  IF NOT _approve THEN
    IF NULLIF(trim(_reason), '') IS NULL THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
    UPDATE public.school_billing_payments SET status = 'REJECTED', rejection_reason = trim(_reason),
           validated_by = v_uid, validated_at = now() WHERE id = v_p.id RETURNING * INTO v_p;
    RETURN v_p;
  END IF;

  -- Renouvellement : la nouvelle période commence à la fin de la période encore active, sinon maintenant.
  SELECT * INTO v_sub FROM public.school_billing_subscriptions WHERE school_id = v_p.school_id FOR UPDATE;
  v_start := CASE WHEN v_sub.id IS NOT NULL AND v_sub.period_end > now() THEN v_sub.period_end ELSE now() END;
  v_end := v_start + CASE WHEN v_p.billing_cycle = 'yearly' THEN interval '1 year' ELSE interval '1 month' END;
  v_receipt := 'FAC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.school_billing_receipt_seq')::text, 6, '0');

  UPDATE public.school_billing_payments SET status = 'VALIDATED', validated_by = v_uid, validated_at = now(),
         receipt_number = v_receipt, period_start = v_start, period_end = v_end
   WHERE id = v_p.id RETURNING * INTO v_p;

  INSERT INTO public.school_billing_subscriptions AS s (
    school_id, plan_code, plan_name, billing_cycle, monthly_price, free_months, last_payment_id, period_start, period_end)
  VALUES (v_p.school_id, v_p.plan_code, v_p.plan_name, v_p.billing_cycle, v_p.monthly_price, v_p.free_months, v_p.id, v_start, v_end)
  ON CONFLICT (school_id) DO UPDATE SET
    plan_code = EXCLUDED.plan_code, plan_name = EXCLUDED.plan_name, billing_cycle = EXCLUDED.billing_cycle,
    monthly_price = EXCLUDED.monthly_price, free_months = EXCLUDED.free_months, last_payment_id = EXCLUDED.last_payment_id,
    period_start = EXCLUDED.period_start, period_end = EXCLUDED.period_end, updated_at = now();
  RETURN v_p;
END $$;
REVOKE ALL ON FUNCTION public.review_school_billing_payment(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_school_billing_payment(uuid, boolean, text) TO authenticated;
