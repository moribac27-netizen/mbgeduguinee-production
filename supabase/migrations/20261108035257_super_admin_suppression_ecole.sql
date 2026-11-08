-- Suppression d'une école par le Super Admin (SQL 42). Retour arrière : drop function public.super_delete_school(uuid), public.super_school_delete_preview(uuid);
create or replace function public.super_school_delete_preview(_school_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.schools where id = _school_id) then raise exception 'SCHOOL_NOT_FOUND'; end if;
  return jsonb_build_object(
    'students', (select count(*) from public.students where school_id = _school_id),
    'users', (select count(*) from public.profiles where school_id = _school_id),
    'subscriptions', (select count(*) from public.school_offer_subscriptions where school_id = _school_id),
    'validated_payments', (select count(*) from public.school_flat_payments where school_id = _school_id and status = 'VALIDATED'),
    'super_admins', (select count(*) from public.profiles p where p.school_id = _school_id and exists (select 1 from public.super_admins s where s.user_id = p.id)),
    'founders', (select count(*) from public.profiles p where p.school_id = _school_id and exists (select 1 from public.founder_schools f where f.user_id = p.id and f.revoked_at is null)));
end $$;

create or replace function public.super_delete_school(_school_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_p jsonb; v_trg text; v_users uuid[]; v_subs int; v_n int;
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  v_p := public.super_school_delete_preview(_school_id);
  if (v_p->>'students')::int > 0 then raise exception 'SCHOOL_HAS_STUDENTS'; end if;
  if (v_p->>'validated_payments')::int > 0 then raise exception 'SCHOOL_HAS_PAYMENTS'; end if;
  if (v_p->>'super_admins')::int > 0 then raise exception 'SCHOOL_HAS_SUPER_ADMIN'; end if;
  if (v_p->>'founders')::int > 0 then raise exception 'SCHOOL_HAS_FOUNDER'; end if;
  select coalesce(array_agg(id), '{}') into v_users from public.profiles where school_id = _school_id;
  -- Le journal de facturation est non modifiable : on lève la protection le temps de la suppression (dans la même transaction)
  select tgname into v_trg from pg_trigger where tgrelid = 'public.flat_billing_audit'::regclass and not tgisinternal and tgfoid = 'public._flat_audit_immutable'::regproc limit 1;
  if v_trg is null then raise exception 'AUDIT_TRIGGER_NOT_FOUND'; end if;
  execute format('alter table public.flat_billing_audit disable trigger %I', v_trg);
  begin
    delete from public.school_flat_payments where school_id = _school_id;
    delete from public.school_offer_subscriptions where school_id = _school_id; get diagnostics v_subs = row_count;
    delete from auth.users where id = any(v_users);
    delete from public.schools where id = _school_id; get diagnostics v_n = row_count;
  exception when foreign_key_violation then
    raise exception 'SCHOOL_HAS_DATA';
  end;
  execute format('alter table public.flat_billing_audit enable trigger %I', v_trg);
  if v_n <> 1 then raise exception 'SCHOOL_NOT_FOUND'; end if;
  return jsonb_build_object('deleted', true, 'users_deleted', coalesce(array_length(v_users, 1), 0), 'subscriptions_deleted', v_subs);
end $$;

revoke all on function public.super_school_delete_preview(uuid), public.super_delete_school(uuid) from public, anon;
grant execute on function public.super_school_delete_preview(uuid), public.super_delete_school(uuid) to authenticated, service_role;
