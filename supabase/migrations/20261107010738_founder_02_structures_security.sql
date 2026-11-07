-- Module « Vue Fondateur » — migration 2 : liens fondateur-écoles, journal, gardes, fonctions de gestion, fermeture des accès directs
-- Retour arrière (commentaire) : drop policy founder_deny sur chaque table ; drop trigger trg_user_roles_founder_guard ; drop function founder_* / is_founder_of / is_pure_founder ; drop table founder_audit, founder_schools.

-- ===== Liens fondateur -> écoles (multi-écoles) =====
create table if not exists public.founder_schools (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, school_id)
);
create index if not exists founder_schools_school_idx on public.founder_schools (school_id);
alter table public.founder_schools enable row level security;
drop policy if exists founder_schools_read on public.founder_schools;
create policy founder_schools_read on public.founder_schools for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin(auth.uid()));
drop policy if exists founder_schools_super_write on public.founder_schools;
create policy founder_schools_super_write on public.founder_schools for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));
revoke all on public.founder_schools from anon, authenticated;
grant select on public.founder_schools to authenticated;

-- ===== Journal côté serveur (non modifiable) =====
create table if not exists public.founder_audit (
  id bigint generated always as identity primary key,
  user_id uuid,
  school_id uuid references public.schools(id) on delete set null,
  event text not null,
  details jsonb not null default '{}'::jsonb,
  actor uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists founder_audit_school_idx on public.founder_audit (school_id, created_at desc);
alter table public.founder_audit enable row level security;
drop policy if exists founder_audit_read on public.founder_audit;
create policy founder_audit_read on public.founder_audit for select to authenticated using (public.is_super_admin(auth.uid()));
revoke all on public.founder_audit from anon, authenticated;
grant select on public.founder_audit to authenticated;
create or replace function public._founder_audit_immutable() returns trigger language plpgsql set search_path to 'public' as $$
begin raise exception 'AUDIT_IMMUTABLE'; end $$;
drop trigger if exists trg_founder_audit_immutable on public.founder_audit;
create trigger trg_founder_audit_immutable before update or delete on public.founder_audit
  for each row execute function public._founder_audit_immutable();

-- ===== Prédicats =====
-- Fondateur « pur » : seul rôle = fondateur (jamais assimilé au personnel : is_staff / is_direction / is_finance / is_hr ne le contiennent pas)
create or replace function public.is_pure_founder(_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select _uid is not null
     and exists (select 1 from public.user_roles r where r.user_id = _uid and r.role = 'fondateur')
     and not exists (select 1 from public.user_roles r where r.user_id = _uid and r.role <> 'fondateur')
     and not exists (select 1 from public.super_admins s where s.user_id = _uid)
$$;

-- Vrai seulement si : lien existant et non révoqué, rôle présent, compte non désactivé
create or replace function public.is_founder_of(_school_id uuid, _uid uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if _uid is null or _school_id is null then return false; end if;
  if _uid is distinct from auth.uid() and not public.is_super_admin(auth.uid()) then return false; end if;
  return exists (select 1 from public.founder_schools f where f.user_id = _uid and f.school_id = _school_id and f.revoked_at is null)
     and exists (select 1 from public.user_roles r where r.user_id = _uid and r.role = 'fondateur')
     and not exists (select 1 from public.profiles p where p.id = _uid and p.disabled_at is not null);
end $$;

-- ===== Garde : le rôle fondateur n'est attribuable que par le Super Admin (ou le service serveur) =====
create or replace function public._user_roles_founder_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.role = 'fondateur' and auth.uid() is not null and not public.is_super_admin(auth.uid()) then
    raise exception 'FOUNDER_ROLE_RESERVED';
  end if;
  return new;
end $$;
drop trigger if exists trg_user_roles_founder_guard on public.user_roles;
create trigger trg_user_roles_founder_guard before insert or update on public.user_roles
  for each row execute function public._user_roles_founder_guard();

-- ===== Fonctions réservées au Super Admin (ou service serveur) =====
create or replace function public.founder_grant(_user_id uuid, _school_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_prof public.profiles;
begin
  if auth.uid() is not null and not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select * into v_prof from public.profiles where id = _user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if not exists (select 1 from public.schools where id = _school_id) then raise exception 'SCHOOL_NOT_FOUND'; end if;
  if public.is_super_admin(_user_id) then raise exception 'SUPER_ADMIN_NOT_ALLOWED'; end if;
  insert into public.founder_schools(user_id, school_id) values (_user_id, _school_id)
    on conflict (user_id, school_id) do update set revoked_at = null;
  insert into public.user_roles(user_id, role) values (_user_id, 'fondateur') on conflict (user_id, role) do nothing;
  if v_prof.school_id is null and public.is_pure_founder(_user_id) then
    update public.profiles set school_id = _school_id where id = _user_id;
  end if;
  insert into public.founder_audit(user_id, school_id, event, details) values (_user_id, _school_id, 'FOUNDER_LINKED', '{}'::jsonb);
  return jsonb_build_object('user_id', _user_id, 'school_id', _school_id, 'linked', true);
end $$;

create or replace function public.founder_revoke(_user_id uuid, _school_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_left int;
begin
  if auth.uid() is not null and not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  update public.founder_schools set revoked_at = now() where user_id = _user_id and school_id = _school_id and revoked_at is null;
  if not found then raise exception 'NOT_LINKED'; end if;
  select count(*) into v_left from public.founder_schools where user_id = _user_id and revoked_at is null;
  if v_left = 0 then delete from public.user_roles where user_id = _user_id and role = 'fondateur'; end if;
  if (select school_id from public.profiles where id = _user_id) = _school_id
     and not exists (select 1 from public.user_roles r where r.user_id = _user_id and r.role <> 'fondateur') then
    update public.profiles set school_id = (select f.school_id from public.founder_schools f where f.user_id = _user_id and f.revoked_at is null order by f.created_at limit 1)
     where id = _user_id;
  end if;
  insert into public.founder_audit(user_id, school_id, event, details) values (_user_id, _school_id, 'FOUNDER_REVOKED', jsonb_build_object('remaining_links', v_left));
  return jsonb_build_object('user_id', _user_id, 'school_id', _school_id, 'revoked', true, 'remaining_links', v_left, 'ban_required', v_left = 0);
end $$;

create or replace function public.founder_list() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null and not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'full_name', x.full_name, 'disabled', x.disabled, 'schools', x.schools) order by x.full_name)
    from (select f.user_id, p.full_name, (p.disabled_at is not null) as disabled,
                 jsonb_agg(jsonb_build_object('school_id', f.school_id, 'school_name', s.name, 'linked_at', f.created_at, 'revoked_at', f.revoked_at) order by s.name) as schools
            from public.founder_schools f join public.profiles p on p.id = f.user_id left join public.schools s on s.id = f.school_id
           group by f.user_id, p.full_name, p.disabled_at) x), '[]'::jsonb);
end $$;

-- ===== Fonctions du fondateur =====
create or replace function public.my_founder_schools() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_is boolean;
begin
  if v_uid is null then raise exception 'FORBIDDEN'; end if;
  v_is := exists (select 1 from public.user_roles r where r.user_id = v_uid and r.role = 'fondateur');
  return jsonb_build_object('is_founder', v_is, 'is_pure', public.is_pure_founder(v_uid), 'active_school_id', public.current_school_id(),
    'schools', case when not v_is then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('school_id', s.id, 'name', s.name, 'status', s.status,
               'suspended', exists (select 1 from public.flat_billing_state b where b.school_id = s.id and b.state = 'suspended'), 'linked_at', f.created_at) order by s.name)
        from public.founder_schools f join public.schools s on s.id = f.school_id
       where f.user_id = v_uid and f.revoked_at is null), '[]'::jsonb) end);
end $$;

-- Changement d'école active : réservé au fondateur « pur » (un fondateur qui est aussi directeur ne doit pas déplacer ses droits de directeur)
create or replace function public.founder_set_active_school(_school_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_old uuid;
begin
  if v_uid is null or not public.is_pure_founder(v_uid) or not public.is_founder_of(_school_id) then raise exception 'FORBIDDEN'; end if;
  select school_id into v_old from public.profiles where id = v_uid;
  if v_old is distinct from _school_id then
    update public.profiles set school_id = _school_id where id = v_uid;
    insert into public.founder_audit(user_id, school_id, event, details) values (v_uid, _school_id, 'SCHOOL_SWITCH', jsonb_build_object('from', v_old, 'to', _school_id));
  end if;
  return jsonb_build_object('active_school_id', _school_id);
end $$;

create or replace function public.founder_log_export(_school_id uuid, _kind text, _details jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not (public.is_founder_of(_school_id) or public.is_super_admin(auth.uid())) then raise exception 'FORBIDDEN'; end if;
  if coalesce(length(_kind), 0) not between 1 and 50 then raise exception 'KIND_INVALID'; end if;
  if pg_column_size(coalesce(_details, '{}'::jsonb)) > 4000 then raise exception 'DETAILS_TOO_LARGE'; end if;
  insert into public.founder_audit(user_id, school_id, event, details)
  values (auth.uid(), _school_id, 'EXPORT', jsonb_build_object('kind', _kind) || coalesce(_details, '{}'::jsonb));
end $$;

-- ===== Droits d'exécution =====
revoke all on function public.is_pure_founder(uuid), public.is_founder_of(uuid, uuid), public.founder_grant(uuid, uuid), public.founder_revoke(uuid, uuid),
  public.founder_list(), public.my_founder_schools(), public.founder_set_active_school(uuid), public.founder_log_export(uuid, text, jsonb), public._user_roles_founder_guard()
  from public, anon;
grant execute on function public.is_pure_founder(uuid), public.is_founder_of(uuid, uuid), public.founder_grant(uuid, uuid), public.founder_revoke(uuid, uuid),
  public.founder_list(), public.my_founder_schools(), public.founder_set_active_school(uuid), public.founder_log_export(uuid, text, jsonb) to authenticated, service_role;

-- ===== Fermeture des accès directs : un fondateur « pur » ne lit ni n'écrit AUCUNE table de l'établissement (il ne passe que par les fonctions) =====
do $$
declare t text; n int := 0;
  excl text[] := array['profiles','notifications','founder_schools'];
begin
  for t in
    select c.table_name from information_schema.columns c
      join pg_class k on k.oid = format('public.%I', c.table_name)::regclass
     where c.table_schema = 'public' and c.column_name = 'school_id' and k.relkind = 'r' and k.relrowsecurity and c.table_name <> all (excl)
  loop
    execute format('drop policy if exists founder_deny on public.%I', t);
    execute format('create policy founder_deny on public.%I as restrictive for all to authenticated using ((select not public.is_pure_founder())) with check ((select not public.is_pure_founder()))', t);
    n := n + 1;
  end loop;
  raise notice 'founder_deny créée sur % tables', n;
end $$;
