-- Module « Vue Fondateur » — migration 6
-- 1) Le garde d'abonnement (_flat_can_see_school) laisse passer un fondateur lié à l'école (is_founder_of vérifie lien non révoqué + rôle + compte actif).
--    Retour arrière : recréer sans le « or public.is_founder_of(_school) ».
-- 2) founder_overview : headline.unpaid_amount (montant) et headline.unpaid_families (nombre de familles) séparés.
create or replace function public._flat_can_see_school(_school uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is null or public.is_super_admin(auth.uid()) or _school is not distinct from public.current_school_id() or public.is_founder_of(_school)
$$;

do $$
declare d text;
begin
  select pg_get_functiondef('public.founder_overview(uuid,date,date)'::regprocedure) into d;
  d := replace(d, '''unpaid_families'', v_rec->''amount_due'',', '''unpaid_amount'', v_rec->''amount_due'', ''unpaid_families'', v_rec->''families_late'',');
  if d not like '%''unpaid_amount''%' then raise exception 'PATCH_NOT_APPLIED'; end if;
  execute d;
end $$;
