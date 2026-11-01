-- Données sensibles : accès limité aux rôles qui en ont l'usage (aligné sur les pages de l'application).
-- is_staff() regroupe tous les rôles du personnel ; ces politiques RESTRICTIVES retirent l'accès aux rôles sans rapport
-- (ex. éducatrice, comptable, RH, transport, cantine aux notes ; tous sauf santé/pédagogie au dossier médical).
-- Les comptes non-personnel (parents, élèves) et le Super Admin ne sont pas concernés. Idempotent ; aucune donnée modifiée.

create or replace function public.has_any_role(_uid uuid, _roles text[])
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (select 1 from public.user_roles ur where ur.user_id = _uid and ur.role::text = any(_roles))
$function$;
revoke all on function public.has_any_role(uuid, text[]) from public, anon;
grant execute on function public.has_any_role(uuid, text[]) to authenticated;

do $$
declare
  t text;
  grades_roles text := $r$array['admin','directeur','directeur_etudes','proviseur','enseignant','surveillant','secretariat']$r$;
  medical_roles text := $r$array['admin','directeur','directeur_etudes','proviseur','enseignant','infirmerie']$r$;
  discipline_roles text := $r$array['admin','directeur','directeur_etudes','proviseur','surveillant','enseignant','secretariat']$r$;
  spec record;
begin
  for spec in
    select unnest(array['grades','grade_marks','grade_validations','exams']) as tbl, grades_roles as roles
    union all select unnest(array['medical_records','medical_visits','medicines','treatments','accidents']), medical_roles
    union all select 'discipline_incidents', discipline_roles
  loop
    t := spec.tbl;
    execute format('drop policy if exists %I on public.%I', t || '_role_scope', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (not public.is_staff(auth.uid()) or public.is_super_admin(auth.uid()) or public.has_any_role(auth.uid(), %s)) with check (not public.is_staff(auth.uid()) or public.is_super_admin(auth.uid()) or public.has_any_role(auth.uid(), %s))',
      t || '_role_scope', t, spec.roles, spec.roles);
  end loop;
end $$;
