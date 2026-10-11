-- Une modification d'offre par le Super Admin s'applique AUTOMATIQUEMENT aux établissements qui ont cette offre.
--
-- Principe : quand le nom, le tarif, la commission, les connexions Parents/Élèves, les fonctionnalités ou les rôles
-- payeurs d'une offre changent, la souscription ACTIVE de chaque établissement concerné est remplacée par un nouvel
-- instantané (l'ancien passe en « superseded » avec sa date de fin : l'historique des conditions est conservé).
--
-- Ce qui ne change JAMAIS :
--   * les paiements déjà déclarés ou validés (ils portent leur propre price_snapshot / commission_snapshot) ;
--   * les commissions déjà générées ;
--   * les offres désactivées : désactiver une offre n'enlève rien aux établissements qui l'ont déjà.
--
-- Idempotent. Retour arrière : DROP TRIGGER trg_offers_propagate ON public.subscription_offers;

CREATE OR REPLACE FUNCTION public.propagate_offer_change_to_subscriptions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.school_offer_subscriptions;
BEGIN
  FOR r IN
    SELECT * FROM public.school_offer_subscriptions WHERE offer_id = NEW.id AND status = 'active' FOR UPDATE
  LOOP
    UPDATE public.school_offer_subscriptions SET status = 'superseded', ends_at = now() WHERE id = r.id;
    INSERT INTO public.school_offer_subscriptions(
      school_id, offer_id, academic_year, offer_code, offer_name, annual_price_per_student,
      school_commission_per_student, parent_login_allowed, student_login_allowed, features, payer_roles)
    VALUES (
      r.school_id, NEW.id, r.academic_year, NEW.code, NEW.name, NEW.annual_price_per_student,
      NEW.school_commission_per_student, NEW.parent_login_allowed, NEW.student_login_allowed, NEW.features, NEW.payer_roles);
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_offers_propagate ON public.subscription_offers;
CREATE TRIGGER trg_offers_propagate AFTER UPDATE ON public.subscription_offers
  FOR EACH ROW
  WHEN (
    OLD.name IS DISTINCT FROM NEW.name
    OR OLD.annual_price_per_student IS DISTINCT FROM NEW.annual_price_per_student
    OR OLD.school_commission_per_student IS DISTINCT FROM NEW.school_commission_per_student
    OR OLD.parent_login_allowed IS DISTINCT FROM NEW.parent_login_allowed
    OR OLD.student_login_allowed IS DISTINCT FROM NEW.student_login_allowed
    OR OLD.features IS DISTINCT FROM NEW.features
    OR OLD.payer_roles IS DISTINCT FROM NEW.payer_roles
  )
  EXECUTE FUNCTION public.propagate_offer_change_to_subscriptions();

REVOKE ALL ON FUNCTION public.propagate_offer_change_to_subscriptions() FROM PUBLIC, anon, authenticated;
