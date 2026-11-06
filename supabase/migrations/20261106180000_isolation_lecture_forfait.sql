-- Sécurité : un utilisateur connecté ne doit pas pouvoir lire l'abonnement / l'état de paiement d'UN AUTRE établissement
-- en appelant directement ces fonctions. Autorisés : son propre établissement, le Super Admin, et les tâches internes (sans utilisateur).
create or replace function public._flat_can_see_school(_school uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is null or public.is_super_admin(auth.uid()) or _school is not distinct from public.current_school_id()
$$;
revoke execute on function public._flat_can_see_school(uuid) from public, anon;
grant execute on function public._flat_can_see_school(uuid) to authenticated, service_role;

-- school_flat_phase et school_flat_in_good_standing passent par cette fonction : « none » / « false » pour un autre établissement.
create or replace function public._school_flat_sub(_school_id uuid)
returns public.school_offer_subscriptions
language sql stable security definer set search_path to 'public' as $function$
  select s.* from public.school_offer_subscriptions s
   where s.school_id = _school_id and s.status = 'active' and s.offer_type = 'per_school'
     and s.academic_year = public.school_academic_year(_school_id)
     and public._flat_can_see_school(_school_id)
   order by s.created_at desc limit 1
$function$;
