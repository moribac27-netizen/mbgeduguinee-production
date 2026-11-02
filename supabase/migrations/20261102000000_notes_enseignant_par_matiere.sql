-- Notes : un enseignant ne voit/saisit que les notes des élèves de SES classes et de SES matières.
-- Avant : la politique « grades_staff_manage » (is_staff) incluait le rôle enseignant, donc tout enseignant
-- pouvait lire et modifier toutes les notes de l'école (la règle par classe était contournée).
-- Un titulaire (instituteur/éducatrice : affectation sans matière) garde toutes les matières de sa classe.
-- Idempotent ; aucune donnée modifiée.

create or replace function public.teacher_teaches_student_subject(_uid uuid, _student_id uuid, _subject_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1
    from public.students s
    join public.teacher_class_assignments tca on tca.class_id = s.class_id
    join public.teachers t on t.id = tca.teacher_id
    where t.user_id = _uid and s.id = _student_id
      and (tca.subject_id is null or tca.subject_id = _subject_id)
  )
$function$;
revoke execute on function public.teacher_teaches_student_subject(uuid, uuid, uuid) from public, anon;
grant execute on function public.teacher_teaches_student_subject(uuid, uuid, uuid) to authenticated;

-- Personnel qui voit les notes de toute l'école (hors enseignant).
drop policy if exists grades_staff_manage on public.grades;
create policy grades_staff_manage on public.grades for all to authenticated
  using (public.is_super_admin(auth.uid())
         or (public.has_any_role(auth.uid(), array['admin','directeur','directeur_etudes','proviseur','surveillant','secretariat'])
             and school_id = public.current_school_id()))
  with check (public.is_super_admin(auth.uid())
         or (public.has_any_role(auth.uid(), array['admin','directeur','directeur_etudes','proviseur','surveillant','secretariat'])
             and school_id = public.current_school_id()));

drop policy if exists grades_teacher_manage on public.grades;
create policy grades_teacher_manage on public.grades for all to authenticated
  using (public.has_role(auth.uid(), 'enseignant'::public.app_role)
         and public.teacher_teaches_student_subject(auth.uid(), student_id, subject_id))
  with check (public.has_role(auth.uid(), 'enseignant'::public.app_role)
              and school_id = public.current_school_id()
              and public.teacher_teaches_student_subject(auth.uid(), student_id, subject_id));

-- Infirmerie : le rôle enseignant n'a plus accès au dossier médical (la page n'est plus dans son menu).
do $$
declare t text; r text := $r$array['admin','directeur','directeur_etudes','proviseur','infirmerie']$r$;
begin
  foreach t in array array['medical_records','medical_visits','medicines','treatments','accidents'] loop
    execute format('drop policy if exists %I on public.%I', t || '_role_scope', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (not public.is_staff(auth.uid()) or public.is_super_admin(auth.uid()) or public.has_any_role(auth.uid(), %s)) with check (not public.is_staff(auth.uid()) or public.is_super_admin(auth.uid()) or public.has_any_role(auth.uid(), %s))',
      t || '_role_scope', t, r, r);
  end loop;
end $$;
