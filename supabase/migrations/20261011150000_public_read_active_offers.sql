-- Les visiteurs (non connectés) peuvent LIRE le catalogue des offres actives, pour la page publique.
-- Informations publiques par nature (tarifs, fonctionnalités). Aucune écriture : les politiques d'écriture
-- restent réservées au Super Admin. Les souscriptions des écoles, paiements et commissions restent privés.
-- Idempotent.
GRANT SELECT ON public.subscription_offers TO anon;
DROP POLICY IF EXISTS offers_public_read ON public.subscription_offers;
CREATE POLICY offers_public_read ON public.subscription_offers FOR SELECT TO anon USING (is_active);
