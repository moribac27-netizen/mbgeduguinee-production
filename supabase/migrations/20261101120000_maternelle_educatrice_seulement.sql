-- Maternelle : l'instituteur (rôle « enseignant ») n'a plus accès aux fiches Maternelle.
-- Seuls la direction et l'éducatrice (rôle educatrice_maternelle), limitée à ses sections affectées, y accèdent.
-- Idempotent ; aucune donnée modifiée.
create or replace function public.nursery_section_access(_uid uuid, _section uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.is_direction(_uid) or public.is_super_admin(_uid) or (
    public.has_role(_uid, 'educatrice_maternelle'::public.app_role)
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
    public.has_role(_uid, 'educatrice_maternelle'::public.app_role)
    and (
      public.teacher_teaches_student(_uid, _student)
      or exists (select 1 from public.nursery_children nc where nc.student_id = _student and nc.section_id is not null
                 and public.nursery_section_access(_uid, nc.section_id))
    )
  )
$function$;
