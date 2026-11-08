-- Suspension / mise en attente décidées par le Super Admin : elles bloquent réellement l'accès (SQL 43).
-- Avant, schools.status n'était qu'une étiquette sans effet. Le Super Admin n'est jamais bloqué.
-- Retour arrière : recréer my_school_suspended sans la ligne « schools.status » et retirer le bloc « manual » de my_school_suspension.
create or replace function public.my_school_suspended() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select case
    when auth.uid() is null then false
    when public.is_super_admin(auth.uid()) then false
    when public.current_school_id() is null then false
    when exists (select 1 from public.schools sc where sc.id = public.current_school_id() and sc.status in ('suspended', 'pending')) then true
    when coalesce((public.platform_setting('billing.flat', '{}'::jsonb)->>'enforce_suspension')::boolean, true) is not true then false
    else public.school_flat_phase(public.current_school_id()) in ('unpaid', 'overdue')
  end
$$;

do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.my_school_suspension()'::regprocedure) into d;
  if d like '%''manual''%' then return; end if;
  n := replace(d, 'v_sub := public._school_flat_sub(v_school);',
    'if exists (select 1 from public.schools sc where sc.id = v_school and sc.status in (''suspended'', ''pending'')) then
    return jsonb_build_object(''suspended'', true, ''manual'', true, ''status'', (select sc.status from public.schools sc where sc.id = v_school),
      ''school_name'', (select sc.name from public.schools sc where sc.id = v_school), ''can_manage'', false);
  end if;
  v_sub := public._school_flat_sub(v_school);');
  if n = d then raise exception 'PATCH_NOT_APPLIED'; end if;
  execute n;
end $$;
