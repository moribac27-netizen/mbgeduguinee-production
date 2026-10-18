-- Durcissement du module « forfaits établissement » (suite de 20261017120000_school_billing_plans.sql).
--
-- Défaut corrigé : save_billing_config() acceptait un prix mensuel « NaN » ou « Infinity » (valeurs numeric valides pour
-- PostgreSQL, qui passent les contrôles « < 0 » et « >= 0 »). Un Super Admin appelant la fonction directement pouvait ainsi
-- enregistrer un tarif inutilisable (devis et paiements en NaN / Infinity). Un seuil « NaN » renvoyait en outre une erreur
-- brute au lieu d'un code d'erreur métier.
--
-- Correctif : prix fini et strictement inférieur à 1e12 GNF, seuil entier fini compris entre 1 et 2 147 483 647.
-- Idempotent. Aucune donnée supprimée ni modifiée. La contrainte est ajoutée NOT VALID : elle protège toute écriture
-- future sans bloquer si une ligne antérieure était hors limites (à corriger alors par le Super Admin).

ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_monthly_price_finite_chk;
ALTER TABLE public.billing_plans ADD CONSTRAINT billing_plans_monthly_price_finite_chk
  CHECK (monthly_price <> 'NaN'::numeric AND monthly_price < 1000000000000::numeric) NOT VALID;

CREATE OR REPLACE FUNCTION public.billing_compute(_monthly numeric, _cycle text, _free_months integer)
RETURNS TABLE (gross_amount numeric, discount_amount numeric, amount numeric)
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF _monthly IS NULL OR _monthly = 'NaN'::numeric OR _monthly < 0 OR _monthly >= 1000000000000::numeric THEN
    RAISE EXCEPTION 'INVALID_PRICE';
  END IF;
  IF _cycle NOT IN ('monthly', 'yearly') THEN RAISE EXCEPTION 'INVALID_CYCLE'; END IF;
  IF _free_months IS NULL OR _free_months < 0 OR _free_months > 12 THEN RAISE EXCEPTION 'INVALID_FREE_MONTHS'; END IF;
  IF _cycle = 'monthly' THEN
    RETURN QUERY SELECT _monthly, 0::numeric, _monthly;
  ELSE
    RETURN QUERY SELECT _monthly * 12, _monthly * _free_months, _monthly * (12 - _free_months);
  END IF;
END $$;

-- Même fonction que dans 20261017120000, avec lecture puis validation séparées (les conversions de type ne peuvent plus
-- masquer ou déformer un code d'erreur métier).
CREATE OR REPLACE FUNCTION public.save_billing_config(_plans jsonb, _free_months integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  e jsonb;
  v_old public.billing_plans;
  v_price numeric; v_max_num numeric; v_max integer; v_active boolean;
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

    -- 1) Lecture (toute valeur illisible => INVALID_VALUES). Aucun RAISE métier dans ce bloc.
    BEGIN
      v_price := (e->>'monthly_price')::numeric;
      v_max_num := (e->>'max_students')::numeric;
      v_active := COALESCE((e->>'is_active')::boolean, v_old.is_active);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_VALUES';
    END;

    -- 2) Validation métier
    IF v_price IS NULL OR v_price = 'NaN'::numeric OR v_price < 0 OR v_price >= 1000000000000::numeric THEN
      RAISE EXCEPTION 'INVALID_PRICE';
    END IF;
    IF v_max_num IS NULL OR v_max_num = 'NaN'::numeric OR v_max_num < 1 OR v_max_num > 2147483647::numeric
       OR v_max_num <> trunc(v_max_num) THEN
      RAISE EXCEPTION 'INVALID_THRESHOLD';
    END IF;
    v_max := v_max_num::integer;

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
