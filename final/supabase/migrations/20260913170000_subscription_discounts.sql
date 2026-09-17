-- Prompt 4 : remises/bourses accordées par le Super Admin sur l'abonnement d'une école.
--
-- ⚠️ Faille corrigée au passage (découverte en travaillant sur cette table) :
-- les policies "Staff can insert/update own school subscription" autorisaient
-- TOUT admin/directeur d'une école à modifier directement sa propre ligne
-- school_subscriptions (plan_id, status, current_period_end...) par un simple
-- appel client, sans jamais passer par renew_or_change_subscription() ni par
-- un paiement. Un admin malveillant aurait pu s'auto-attribuer le plan le
-- plus cher avec une échéance dans 10 ans, gratuitement. Vérifié : aucun
-- code applicatif légitime ne fait d'update direct sur cette table côté
-- école (souscription.tsx crée une demande dans subscription_payment_requests,
-- abonnement.tsx appelle le RPC) — seul super-admin.tsx en a besoin, et il
-- est déjà réservé au Super Admin. On restreint donc l'écriture directe.

DROP POLICY IF EXISTS "Staff can insert own school subscription" ON public.school_subscriptions;
DROP POLICY IF EXISTS "Staff can update own school subscription" ON public.school_subscriptions;

CREATE POLICY "Only super admin can insert subscriptions"
  ON public.school_subscriptions FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Only super admin can update subscriptions"
  ON public.school_subscriptions FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- --------------------------------------------------------------------------
-- Colonnes de remise
-- --------------------------------------------------------------------------
ALTER TABLE public.school_subscriptions
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_value numeric CHECK (discount_value >= 0),
  ADD COLUMN IF NOT EXISTS discount_reason text,
  ADD COLUMN IF NOT EXISTS discount_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS discount_granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_granted_at timestamptz;

-- --------------------------------------------------------------------------
-- Attribution/retrait d'une remise (Super Admin uniquement)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_school_subscription_discount(
  p_school_id uuid,
  p_discount_type text,        -- 'percent' | 'fixed' | NULL pour retirer la remise
  p_discount_value numeric,
  p_reason text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS public.school_subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.school_subscriptions;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Accès refusé : Super Admin uniquement';
  END IF;

  IF p_discount_type IS NOT NULL AND p_discount_type NOT IN ('percent', 'fixed') THEN
    RAISE EXCEPTION 'Type de remise invalide';
  END IF;
  IF p_discount_type = 'percent' AND (p_discount_value < 0 OR p_discount_value > 100) THEN
    RAISE EXCEPTION 'Un pourcentage de remise doit être compris entre 0 et 100';
  END IF;

  UPDATE public.school_subscriptions SET
    discount_type = p_discount_type,
    discount_value = CASE WHEN p_discount_type IS NULL THEN NULL ELSE p_discount_value END,
    discount_reason = CASE WHEN p_discount_type IS NULL THEN NULL ELSE p_reason END,
    discount_expires_at = CASE WHEN p_discount_type IS NULL THEN NULL ELSE p_expires_at END,
    discount_granted_by = CASE WHEN p_discount_type IS NULL THEN NULL ELSE auth.uid() END,
    discount_granted_at = CASE WHEN p_discount_type IS NULL THEN NULL ELSE now() END,
    updated_at = now()
  WHERE school_id = p_school_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun abonnement existant pour cette école — impossible d''appliquer une remise avant la première souscription.';
  END IF;

  INSERT INTO public.activity_logs (school_id, user_id, actor_name, action, entity_type, entity_id, entity_label, metadata)
  VALUES (
    p_school_id, auth.uid(), NULL,
    CASE WHEN p_discount_type IS NULL THEN 'delete' ELSE 'update' END,
    'subscription_discount', v_row.id,
    CASE WHEN p_discount_type IS NULL THEN 'Remise retirée'
         WHEN p_discount_type = 'percent' THEN p_discount_value || '% de remise'
         ELSE p_discount_value || ' GNF de remise' END,
    jsonb_build_object('discount_type', p_discount_type, 'discount_value', p_discount_value, 'reason', p_reason, 'expires_at', p_expires_at)
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_school_subscription_discount(uuid, text, numeric, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_school_subscription_discount(uuid, text, numeric, text, timestamptz) TO authenticated;

-- --------------------------------------------------------------------------
-- Applique automatiquement la remise active (et non expirée) au renouvellement
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renew_or_change_subscription(
  p_school_id uuid,
  p_new_plan_id uuid,
  p_billing_cycle text DEFAULT 'monthly'
)
RETURNS public.school_subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan public.subscription_plans;
  v_start timestamptz := now();
  v_end timestamptz;
  v_amount numeric;
  v_row public.school_subscriptions;
  v_discount_type text;
  v_discount_value numeric;
  v_discount_expires_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF p_billing_cycle NOT IN ('monthly', 'yearly') THEN
    RAISE EXCEPTION 'Cycle de facturation invalide';
  END IF;

  IF NOT (
    public.is_super_admin(auth.uid())
    OR (
      public.same_school(p_school_id)
      AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'directeur'))
    )
  ) THEN
    RAISE EXCEPTION 'Accès refusé : vous ne pouvez pas modifier cet abonnement';
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans
    WHERE id = p_new_plan_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offre introuvable ou inactive';
  END IF;

  IF p_billing_cycle = 'yearly' THEN
    v_end := v_start + interval '1 year';
    v_amount := v_plan.price_yearly;
  ELSE
    v_end := v_start + interval '1 month';
    v_amount := v_plan.price_monthly;
  END IF;

  -- Remise éventuelle : on ne l'écrase jamais ici, on la lit seulement pour
  -- calculer le montant facturé. Elle reste en place tant qu'un Super Admin
  -- ne la modifie/retire pas explicitement via set_school_subscription_discount().
  SELECT discount_type, discount_value, discount_expires_at
    INTO v_discount_type, v_discount_value, v_discount_expires_at
    FROM public.school_subscriptions WHERE school_id = p_school_id;

  IF v_discount_type IS NOT NULL AND (v_discount_expires_at IS NULL OR v_discount_expires_at > now()) THEN
    IF v_discount_type = 'percent' THEN
      v_amount := GREATEST(v_amount * (1 - v_discount_value / 100.0), 0);
    ELSE
      v_amount := GREATEST(v_amount - v_discount_value, 0);
    END IF;
  END IF;

  INSERT INTO public.school_subscriptions AS s (
    school_id, plan_id, status, billing_cycle,
    current_period_start, current_period_end,
    last_payment_at, last_payment_amount, metadata
  ) VALUES (
    p_school_id, p_new_plan_id, 'active', p_billing_cycle,
    v_start, v_end, v_start, v_amount,
    jsonb_build_object('source', 'self-service', 'action', 'renew_or_change')
  )
  ON CONFLICT (school_id) DO UPDATE SET
    plan_id = excluded.plan_id,
    status = 'active',
    billing_cycle = excluded.billing_cycle,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    last_payment_at = excluded.last_payment_at,
    last_payment_amount = excluded.last_payment_amount,
    metadata = s.metadata || excluded.metadata,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.renew_or_change_subscription(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_or_change_subscription(uuid, uuid, text) TO authenticated;
