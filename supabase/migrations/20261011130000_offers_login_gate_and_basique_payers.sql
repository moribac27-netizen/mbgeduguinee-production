-- Complément aux migrations « offers_phase1 / offers_phase2 » déjà appliquées en production.
--
-- 1) Offre Basique : les enseignants peuvent initier un paiement (règle métier demandée).
--    N'affecte aucun paiement existant : les paiements gardent l'instantané de leurs conditions.
-- 2) Connexion Parents / Élèves selon l'offre, appliquée AUSSI aux données (RLS), pas seulement à l'interface.
--    `school_login_allowed()` (déjà en base) renvoie true pour le personnel, le Super Admin, les écoles sans
--    souscription (conditions historiques) et selon l'offre pour les comptes Parent / Élève.
--    Conséquence immédiate en production : aucune (aucune école n'a encore de souscription).
--
-- Idempotent : peut être rejoué sans effet de bord.

UPDATE public.subscription_offers
   SET payer_roles = array_append(payer_roles, 'enseignant'::public.app_role)
 WHERE code = 'basique'
   AND NOT ('enseignant'::public.app_role = ANY (payer_roles));

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN pg_tables p ON p.schemaname = 'public' AND p.tablename = c.table_name
    WHERE c.table_schema = 'public' AND c.column_name = 'school_id'
      AND c.table_name NOT IN (
        'profiles','schools','user_roles','super_admins','activity_logs','notifications',
        'subscription_offers','school_offer_subscriptions','subscription_offer_history',
        'school_commissions','commission_payouts'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS offer_login_gate ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY offer_login_gate ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.school_login_allowed())) WITH CHECK ((SELECT public.school_login_allowed()))',
      t);
  END LOOP;
END $$;

-- Retour arrière (si besoin) :
--   DO $$ DECLARE t text; BEGIN FOR t IN SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='offer_login_gate'
--   LOOP EXECUTE format('DROP POLICY offer_login_gate ON public.%I', t); END LOOP; END $$;
