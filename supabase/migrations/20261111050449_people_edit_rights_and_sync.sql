-- Modification des fiches (élèves, enseignants, parents, personnels) : droits cohérents + synchronisation des copies d'une même personne
-- Retour arrière (commentaire) : recréer profiles_staff_manage (ALL, is_staff) ; renommer/rétablir les politiques user_roles_staff_* avec is_staff ;
--   alter policy ec_finance ... with check (is_finance) ; drop policy teachers_rh_update ; drop triggers trg_*_sync / trg_profiles_guard ; drop function can_manage_profiles, _sync_*.

-- 0) Qui peut gérer les profils (fiches de personnes) d'une école
create or replace function public.can_manage_profiles(_uid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.is_super_admin(_uid) or exists (select 1 from public.user_roles r where r.user_id = _uid
         and r.role::text in ('admin','directeur','directeur_etudes','proviseur','secretariat','rh'))
$$;
revoke all on function public.can_manage_profiles(uuid) from public, anon;
grant execute on function public.can_manage_profiles(uuid) to authenticated, service_role;

-- 1) Contrats : la condition de lecture (is_hr) et celle d'écriture (is_finance) étaient incohérentes -> un RH voyait mais ne pouvait pas modifier
alter policy ec_finance on public.employee_contracts
  using (public.is_super_admin(auth.uid()) or (public.is_hr(auth.uid()) and school_id = public.current_school_id()))
  with check (public.is_super_admin(auth.uid()) or (public.is_hr(auth.uid()) and school_id = public.current_school_id()));

-- 2) Enseignants : le RH peut aussi modifier les fiches (comme les contrats)
drop policy if exists teachers_rh_update on public.teachers;
create policy teachers_rh_update on public.teachers for update to authenticated
  using (public.is_super_admin(auth.uid()) or (public.has_role(auth.uid(), 'rh'::public.app_role) and school_id = public.current_school_id()))
  with check (public.is_super_admin(auth.uid()) or (public.has_role(auth.uid(), 'rh'::public.app_role) and school_id = public.current_school_id()));

-- 3) Profils : tout le personnel garde la LECTURE, mais seuls les rôles de gestion peuvent MODIFIER / créer / supprimer les profils de leur école
drop policy if exists profiles_staff_manage on public.profiles;
drop policy if exists profiles_staff_read on public.profiles;
create policy profiles_staff_read on public.profiles for select to authenticated
  using (public.is_super_admin(auth.uid()) or (public.is_staff(auth.uid()) and school_id = public.current_school_id()));
drop policy if exists profiles_manage_write on public.profiles;
create policy profiles_manage_write on public.profiles for all to authenticated
  using (public.is_super_admin(auth.uid()) or (public.can_manage_profiles(auth.uid()) and school_id = public.current_school_id()))
  with check (public.is_super_admin(auth.uid()) or (public.can_manage_profiles(auth.uid()) and school_id = public.current_school_id()));

-- 4) Rôles : seule la direction (ou le Super Admin) attribue, modifie ou retire des rôles (avant : tout membre du personnel, y compris « admin »)
alter policy user_roles_staff_insert_same_school on public.user_roles
  with check (public.is_super_admin(auth.uid()) or (public.is_direction(auth.uid()) and exists (select 1 from public.profiles p where p.id = user_roles.user_id and p.school_id = public.current_school_id())));
alter policy user_roles_staff_update_same_school on public.user_roles
  using (public.is_super_admin(auth.uid()) or (public.is_direction(auth.uid()) and exists (select 1 from public.profiles p where p.id = user_roles.user_id and p.school_id = public.current_school_id())))
  with check (public.is_super_admin(auth.uid()) or (public.is_direction(auth.uid()) and exists (select 1 from public.profiles p where p.id = user_roles.user_id and p.school_id = public.current_school_id())));
alter policy user_roles_staff_delete_same_school on public.user_roles
  using (public.is_super_admin(auth.uid()) or (public.is_direction(auth.uid()) and exists (select 1 from public.profiles p where p.id = user_roles.user_id and p.school_id = public.current_school_id())));
alter policy user_roles_staff_insert_same_school on public.user_roles rename to user_roles_direction_insert_same_school;
alter policy user_roles_staff_update_same_school on public.user_roles rename to user_roles_direction_update_same_school;
alter policy user_roles_staff_delete_same_school on public.user_roles rename to user_roles_direction_delete_same_school;

-- 5) Garde : seul un gestionnaire (ou le serveur) peut (ré)activer/désactiver un compte via profiles.disabled_at
create or replace function public._profiles_guard() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.disabled_at is distinct from old.disabled_at and auth.uid() is not null and not public.can_manage_profiles(auth.uid()) then
    raise exception 'FORBIDDEN_FIELD' using hint = 'Seule la direction ou le Super Admin peut activer ou désactiver un compte.';
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard before update of disabled_at on public.profiles for each row execute function public._profiles_guard();

-- 6) Synchronisation des copies d'une même personne (nom, téléphone, e-mail) — chaque propagation est isolée : elle ne peut jamais faire échouer la modification d'origine
create or replace function public._sync_from_profile() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.full_name is not distinct from old.full_name and new.phone is not distinct from old.phone then return null; end if;
  begin update public.teachers set full_name = new.full_name, phone = coalesce(new.phone, phone)
         where user_id = new.id and (full_name is distinct from new.full_name or phone is distinct from coalesce(new.phone, phone));
  exception when others then null; end;
  begin update public.employee_contracts set full_name = new.full_name, phone = coalesce(new.phone, phone)
         where user_id = new.id and (full_name is distinct from new.full_name or phone is distinct from coalesce(new.phone, phone));
  exception when others then null; end;
  begin update public.students set parent_name = new.full_name, parent_phone = coalesce(new.phone, parent_phone)
         where parent_user_id = new.id and (parent_name is distinct from new.full_name or parent_phone is distinct from coalesce(new.phone, parent_phone));
  exception when others then null; end;
  return null;
end $$;
drop trigger if exists trg_profiles_sync on public.profiles;
create trigger trg_profiles_sync after update of full_name, phone on public.profiles for each row execute function public._sync_from_profile();

create or replace function public._sync_from_teacher() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.full_name is not distinct from old.full_name and new.phone is not distinct from old.phone and new.email is not distinct from old.email then return null; end if;
  if new.user_id is not null and (auth.uid() is null or public.can_manage_profiles(auth.uid())) then
    begin update public.profiles set full_name = new.full_name, phone = coalesce(new.phone, phone)
           where id = new.user_id and (full_name is distinct from new.full_name or phone is distinct from coalesce(new.phone, phone));
    exception when others then null; end;
  end if;
  begin update public.employee_contracts set full_name = new.full_name, phone = coalesce(new.phone, phone), email = coalesce(new.email, email)
         where teacher_id = new.id and (full_name is distinct from new.full_name or phone is distinct from coalesce(new.phone, phone) or email is distinct from coalesce(new.email, email));
  exception when others then null; end;
  return null;
end $$;
drop trigger if exists trg_teachers_sync on public.teachers;
create trigger trg_teachers_sync after update of full_name, phone, email on public.teachers for each row execute function public._sync_from_teacher();

create or replace function public._sync_from_contract() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.full_name is not distinct from old.full_name and new.phone is not distinct from old.phone and new.email is not distinct from old.email then return null; end if;
  if auth.uid() is null or public.can_manage_profiles(auth.uid()) then
    if new.teacher_id is not null then
      begin update public.teachers set full_name = new.full_name, phone = coalesce(new.phone, phone), email = coalesce(new.email, email)
             where id = new.teacher_id and (full_name is distinct from new.full_name or phone is distinct from coalesce(new.phone, phone) or email is distinct from coalesce(new.email, email));
      exception when others then null; end;
    end if;
    if new.user_id is not null then
      begin update public.profiles set full_name = new.full_name, phone = coalesce(new.phone, phone)
             where id = new.user_id and (full_name is distinct from new.full_name or phone is distinct from coalesce(new.phone, phone));
      exception when others then null; end;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_contracts_sync on public.employee_contracts;
create trigger trg_contracts_sync after update of full_name, phone, email on public.employee_contracts for each row execute function public._sync_from_contract();

revoke all on function public._profiles_guard(), public._sync_from_profile(), public._sync_from_teacher(), public._sync_from_contract() from public, anon, authenticated;
