-- Module « Vue Fondateur » — migration 5 : correction de founder_revoke (profiles.school_id est NOT NULL)
-- À la dernière révocation le rôle 'fondateur' reste (inerte : aucun lien => aucune donnée ; la politique founder_deny continue de fermer tout accès direct).
-- Retour arrière : recréer la version de la migration 2.
create or replace function public.founder_revoke(_user_id uuid, _school_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_left int; v_next uuid;
begin
  if auth.uid() is not null and not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  update public.founder_schools set revoked_at = now() where user_id = _user_id and school_id = _school_id and revoked_at is null;
  if not found then raise exception 'NOT_LINKED'; end if;
  select count(*) into v_left from public.founder_schools where user_id = _user_id and revoked_at is null;
  -- École active : bascule sur une autre école encore liée (fondateur « pur » uniquement) ; sinon inchangée
  if public.is_pure_founder(_user_id) and (select school_id from public.profiles where id = _user_id) = _school_id then
    select f.school_id into v_next from public.founder_schools f where f.user_id = _user_id and f.revoked_at is null order by f.created_at limit 1;
    if v_next is not null then update public.profiles set school_id = v_next where id = _user_id; end if;
  end if;
  insert into public.founder_audit(user_id, school_id, event, details) values (_user_id, _school_id, 'FOUNDER_REVOKED', jsonb_build_object('remaining_links', v_left));
  return jsonb_build_object('user_id', _user_id, 'school_id', _school_id, 'revoked', true, 'remaining_links', v_left, 'ban_required', v_left = 0);
end $$;
revoke all on function public.founder_revoke(uuid, uuid) from public, anon;
grant execute on function public.founder_revoke(uuid, uuid) to authenticated, service_role;
