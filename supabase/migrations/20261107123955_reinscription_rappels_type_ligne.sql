-- Correctif SQL 41 : la boucle des rappels J-30/J-7/jour J utilisait un « record » non convertible ; on type la variable (comportement inchangé).
-- Retour arrière : recréer run_flat_renewal_reminders avec « r record » (non recommandé : le rappel principal échouerait).
do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.run_flat_renewal_reminders(date)'::regprocedure) into d;
  if d like '%r public.school_offer_subscriptions;%' then return; end if;
  n := replace(d, 'r record;', 'r public.school_offer_subscriptions;');
  if n = d then raise exception 'PATCH_NOT_APPLIED'; end if;
  execute n;
end $$;
