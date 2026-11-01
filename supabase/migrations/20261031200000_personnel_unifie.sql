-- Personnel unifié : une seule liste (enseignants + personnel non enseignant), avec coordonnées et lien vers le compte de connexion.
-- Idempotent ; aucune donnée existante modifiée ou supprimée.
alter table public.employee_contracts add column if not exists phone text;
alter table public.employee_contracts add column if not exists email text;
alter table public.employee_contracts add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Annuaire du personnel de l'école courante (direction, directeur des études, proviseur, RH, comptabilité).
create or replace function public.staff_directory()
returns table(kind text, teacher_id uuid, contract_id uuid, full_name text, email text, phone text, job_title text, teacher_type text, user_id uuid)
language plpgsql stable security definer set search_path to 'public' as $function$
declare v_school uuid := public.current_school_id();
begin
  if auth.uid() is null or not (public.is_super_admin(auth.uid()) or public.can_manage_teachers(auth.uid()) or public.is_hr(auth.uid())) then
    raise exception 'FORBIDDEN';
  end if;
  return query
  select 'enseignant'::text, t.id, c.id, t.full_name, t.email, t.phone,
         coalesce(nullif(c."position", ''), case t.teacher_type when 'instituteur' then 'Instituteur' when 'educatrice' then 'Éducatrice' else 'Enseignant' end),
         t.teacher_type, t.user_id
    from public.teachers t
    left join lateral (select x.id, x."position" from public.employee_contracts x where x.teacher_id = t.id order by x.created_at desc limit 1) c on true
   where t.school_id = v_school
  union all
  select 'non_enseignant'::text, null::uuid, c.id, c.full_name, c.email, c.phone, c."position", null::text, c.user_id
    from public.employee_contracts c
   where c.school_id = v_school and c.teacher_id is null and c.status::text <> 'termine'
  order by 4;
end $function$;
revoke all on function public.staff_directory() from public, anon;
grant execute on function public.staff_directory() to authenticated;
