-- Active le nouvel échéancier mensuel (solde annuel réparti jusqu'au 30 juin) pour les établissements au forfait mensuel.
-- Retour arrière : update public.platform_settings set value = value || '{"enabled":false}' where key = 'billing.flat_installments';
-- (les calendriers déjà générés restent en base ; l'ancienne règle progressive reprend aussitôt la main.)
-- Aucun paiement n'existe au moment de l'activation.

update public.platform_settings
   set value = value || '{"enabled": true}'::jsonb, updated_at = now()
 where key = 'billing.flat_installments';

do $$
declare r record;
begin
  for r in select id from public.school_offer_subscriptions where offer_type = 'per_school' and status = 'active' loop
    perform public.flat_rebuild_installments(r.id, (now() at time zone 'Africa/Conakry')::date);
  end loop;
end $$;
