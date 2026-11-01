-- Maternelle : accès limité aux sections affectées (comme pour les élèves).
--  - direction : accès complet ;
--  - éducatrice / enseignant : uniquement les sections dont la classe leur est affectée (ou dont ils sont référents) ;
--  - sections : création/modification réservées à la direction ;
--  - les autres membres du personnel ne lisent plus les fiches enfants, le suivi quotidien ni les évaluations.
-- Idempotent ; aucune donnée modifiée.

create or replace function public.nursery_section_access(_uid uuid, _section uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.is_direction(_uid) or public.is_super_admin(_uid) or (
    (public.has_role(_uid, 'enseignant'::public.app_role) or public.has_role(_uid, 'educatrice_maternelle'::public.app_role))
    and exists (
      select 1 from public.nursery_sections s
      where s.id = _section
        and (public.teacher_teaches_class(_uid, s.class_id)
             or exists (select 1 from public.teachers t where t.id = s.teacher_id and t.user_id = _uid))
    )
  )
$function$;

create or replace function public.nursery_student_access(_uid uuid, _student uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.is_direction(_uid) or public.is_super_admin(_uid) or (
    (public.has_role(_uid, 'enseignant'::public.app_role) or public.has_role(_uid, 'educatrice_maternelle'::public.app_role))
    and (
      public.teacher_teaches_student(_uid, _student)
      or exists (select 1 from public.nursery_children nc where nc.student_id = _student and nc.section_id is not null
                 and public.nursery_section_access(_uid, nc.section_id))
    )
  )
$function$;

create or replace function public.nursery_has_any_section(_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.is_direction(_uid) or public.is_super_admin(_uid) or exists (
    select 1 from public.nursery_sections s where public.nursery_section_access(_uid, s.id)
  )
$function$;
revoke all on function public.nursery_section_access(uuid, uuid), public.nursery_student_access(uuid, uuid), public.nursery_has_any_section(uuid) from public, anon;
grant execute on function public.nursery_section_access(uuid, uuid), public.nursery_student_access(uuid, uuid), public.nursery_has_any_section(uuid) to authenticated;

-- Sections : écriture réservée à la direction
drop policy if exists nursery_sections_write on public.nursery_sections;
create policy nursery_sections_write on public.nursery_sections for all to authenticated
  using (public.is_super_admin(auth.uid()) or (same_school(school_id) and public.is_direction(auth.uid())))
  with check (public.is_super_admin(auth.uid()) or (same_school(school_id) and public.is_direction(auth.uid())));

-- Fiches enfants
drop policy if exists nursery_children_write on public.nursery_children;
drop policy if exists nursery_children_staff_read on public.nursery_children;
create policy nursery_children_staff_read on public.nursery_children for select to authenticated
  using (same_school(school_id) and public.nursery_student_access(auth.uid(), student_id));
create policy nursery_children_write on public.nursery_children for all to authenticated
  using (same_school(school_id) and public.nursery_student_access(auth.uid(), student_id))
  with check (same_school(school_id) and public.nursery_student_access(auth.uid(), student_id));

-- Suivi quotidien
drop policy if exists nursery_logs_write on public.nursery_daily_logs;
drop policy if exists nursery_logs_staff_read on public.nursery_daily_logs;
create policy nursery_logs_staff_read on public.nursery_daily_logs for select to authenticated
  using (same_school(school_id) and public.nursery_student_access(auth.uid(), student_id));
create policy nursery_logs_write on public.nursery_daily_logs for all to authenticated
  using (same_school(school_id) and public.nursery_student_access(auth.uid(), student_id))
  with check (same_school(school_id) and public.nursery_student_access(auth.uid(), student_id));

-- Évaluations
drop policy if exists nursery_eval_write on public.nursery_evaluations;
drop policy if exists nursery_eval_staff_read on public.nursery_evaluations;
create policy nursery_eval_staff_read on public.nursery_evaluations for select to authenticated
  using (same_school(school_id) and public.nursery_student_access(auth.uid(), student_id));
create policy nursery_eval_write on public.nursery_evaluations for all to authenticated
  using (same_school(school_id) and public.nursery_student_access(auth.uid(), student_id))
  with check (same_school(school_id) and public.nursery_student_access(auth.uid(), student_id));

-- Catalogue de compétences : direction, ou personnel affecté à au moins une section
drop policy if exists nursery_comp_write on public.nursery_competencies;
create policy nursery_comp_write on public.nursery_competencies for all to authenticated
  using (same_school(school_id) and public.nursery_has_any_section(auth.uid()))
  with check (same_school(school_id) and public.nursery_has_any_section(auth.uid()));

-- Emploi du temps maternelle
drop policy if exists nursery_slots_write on public.nursery_schedule_slots;
create policy nursery_slots_write on public.nursery_schedule_slots for all to authenticated
  using (same_school(school_id) and public.nursery_section_access(auth.uid(), section_id))
  with check (same_school(school_id) and public.nursery_section_access(auth.uid(), section_id));

-- Élèves : l'éducatrice, comme l'enseignant, ne lit et n'inscrit que dans ses classes affectées
create or replace function public.has_student_list_role(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role in ('admin','directeur','directeur_etudes','proviseur','comptable','surveillant',
                      'secretariat','bibliothecaire','infirmerie','responsable_transport','responsable_cantine')
  )
$function$;

drop policy if exists students_teacher_class_read on public.students;
create policy students_teacher_class_read on public.students for select to authenticated
  using ((public.has_role(auth.uid(), 'enseignant'::public.app_role) or public.has_role(auth.uid(), 'educatrice_maternelle'::public.app_role))
         and school_id = public.current_school_id() and class_id is not null and public.teacher_teaches_class(auth.uid(), class_id));

drop policy if exists students_nursery_insert on public.students;
create policy students_nursery_insert on public.students for insert to authenticated
  with check (public.has_role(auth.uid(), 'educatrice_maternelle'::public.app_role) and school_id = public.current_school_id()
              and class_id is not null and public.is_nursery_student_scope(class_id) and public.teacher_teaches_class(auth.uid(), class_id));

drop policy if exists students_nursery_update on public.students;
create policy students_nursery_update on public.students for update to authenticated
  using (public.has_role(auth.uid(), 'educatrice_maternelle'::public.app_role) and school_id = public.current_school_id()
         and class_id is not null and public.teacher_teaches_class(auth.uid(), class_id))
  with check (public.has_role(auth.uid(), 'educatrice_maternelle'::public.app_role) and school_id = public.current_school_id()
              and class_id is not null and public.is_nursery_student_scope(class_id) and public.teacher_teaches_class(auth.uid(), class_id));
