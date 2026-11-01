-- Un enseignant ne voit, n'ajoute et ne modifie que les élèves des classes qui lui sont affectées.
-- Avant : le rôle « enseignant » lisait tous les élèves de l'école (liste staff) et ne pouvait pas en ajouter malgré le bouton affiché.
-- Idempotent ; aucune donnée modifiée.
create or replace function public.has_student_list_role(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role in ('admin','directeur','directeur_etudes','proviseur','comptable','surveillant',
                      'secretariat','bibliothecaire','infirmerie','educatrice_maternelle','responsable_transport','responsable_cantine')
  )
$function$;

drop policy if exists students_teacher_class_read on public.students;
create policy students_teacher_class_read on public.students for select to authenticated
  using (public.has_role(auth.uid(), 'enseignant'::public.app_role) and school_id = public.current_school_id()
         and class_id is not null and public.teacher_teaches_class(auth.uid(), class_id));

drop policy if exists students_teacher_insert on public.students;
create policy students_teacher_insert on public.students for insert to authenticated
  with check (public.has_role(auth.uid(), 'enseignant'::public.app_role) and school_id = public.current_school_id()
              and class_id is not null and public.teacher_teaches_class(auth.uid(), class_id));

drop policy if exists students_teacher_update on public.students;
create policy students_teacher_update on public.students for update to authenticated
  using (public.has_role(auth.uid(), 'enseignant'::public.app_role) and school_id = public.current_school_id()
         and class_id is not null and public.teacher_teaches_class(auth.uid(), class_id))
  with check (public.has_role(auth.uid(), 'enseignant'::public.app_role) and school_id = public.current_school_id()
              and class_id is not null and public.teacher_teaches_class(auth.uid(), class_id));
