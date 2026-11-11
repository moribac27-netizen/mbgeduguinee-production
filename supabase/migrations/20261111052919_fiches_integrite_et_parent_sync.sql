-- Fiches : cohérence élève ↔ parent, garde-fous inter-écoles, et fermeture de la lecture anonyme des réglages (SQL 44)
-- Retour arrière : drop trigger trg_students_integrity / trg_teachers_integrity / trg_students_parent_sync ; drop function _students_integrity, _teachers_integrity, _sync_from_student ;
--   grant execute on function public.platform_setting(text, jsonb) to anon;

-- 1) Réglages : la table limite déjà les anonymes aux clés « public.* », mais la fonction platform_setting() les laissait lire TOUTES les clés (modes de paiement, facturation)
revoke execute on function public.platform_setting(text, jsonb) from anon, public;
grant execute on function public.platform_setting(text, jsonb) to authenticated, service_role;

-- 2) Une classe ou un parent d'un autre établissement ne peut jamais être rattaché à un élève (ni un compte d'une autre école à un enseignant)
create or replace function public._students_integrity() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.class_id is not null and not exists (select 1 from public.classes c where c.id = new.class_id and c.school_id = new.school_id) then
    raise exception 'CLASS_OTHER_SCHOOL' using hint = 'Cette classe n''appartient pas à l''établissement de l''élève.';
  end if;
  if new.parent_user_id is not null and not exists (select 1 from public.profiles p where p.id = new.parent_user_id and p.school_id = new.school_id) then
    raise exception 'PARENT_OTHER_SCHOOL' using hint = 'Ce compte parent n''appartient pas à l''établissement de l''élève.';
  end if;
  return new;
end $$;
drop trigger if exists trg_students_integrity on public.students;
create trigger trg_students_integrity before insert or update of class_id, parent_user_id, school_id on public.students
  for each row execute function public._students_integrity();

create or replace function public._teachers_integrity() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.user_id is not null and not exists (select 1 from public.profiles p where p.id = new.user_id and p.school_id = new.school_id) then
    raise exception 'USER_OTHER_SCHOOL' using hint = 'Ce compte n''appartient pas à l''établissement de l''enseignant.';
  end if;
  return new;
end $$;
drop trigger if exists trg_teachers_integrity on public.teachers;
create trigger trg_teachers_integrity before insert or update of user_id, school_id on public.teachers
  for each row execute function public._teachers_integrity();

-- 3) Modifier le nom / téléphone du parent sur la fiche d'un élève met aussi à jour son compte (et donc les fiches de ses autres enfants, via la synchronisation existante).
--    Réservé à ceux qui gèrent les profils : un enseignant qui corrige une fiche élève ne modifie pas le compte d'un parent.
create or replace function public._sync_from_student() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.parent_user_id is null then return null; end if;
  if new.parent_name is not distinct from old.parent_name and new.parent_phone is not distinct from old.parent_phone then return null; end if;
  if auth.uid() is null or public.can_manage_profiles(auth.uid()) then
    begin
      update public.profiles set full_name = coalesce(nullif(trim(new.parent_name), ''), full_name), phone = coalesce(nullif(trim(new.parent_phone), ''), phone)
       where id = new.parent_user_id and school_id = new.school_id
         and (full_name is distinct from coalesce(nullif(trim(new.parent_name), ''), full_name) or phone is distinct from coalesce(nullif(trim(new.parent_phone), ''), phone));
    exception when others then null; end;
  end if;
  return null;
end $$;
drop trigger if exists trg_students_parent_sync on public.students;
create trigger trg_students_parent_sync after update of parent_name, parent_phone on public.students
  for each row execute function public._sync_from_student();

revoke all on function public._students_integrity(), public._teachers_integrity(), public._sync_from_student() from public, anon, authenticated;
