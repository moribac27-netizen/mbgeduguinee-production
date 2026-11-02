-- Enseignant : examens, annonces et paiements de cotisation limités à ses classes.
-- Avant : tout le personnel (dont l'enseignant) voyait/écrivait les examens et voyait les paiements de toute l'école ;
-- l'enseignant pouvait publier des annonces à toute l'école. Idempotent ; aucune donnée modifiée.

-- Enseignant « pur » : a le rôle enseignant sans aucun rôle qui voit toute l'école.
create or replace function public.is_class_scoped_teacher(_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.has_role(_uid, 'enseignant'::public.app_role)
     and not public.is_super_admin(_uid)
     and not public.has_any_role(_uid, array['admin','directeur','directeur_etudes','proviseur','surveillant','secretariat','comptable'])
$function$;
revoke execute on function public.is_class_scoped_teacher(uuid) from public, anon;
grant execute on function public.is_class_scoped_teacher(uuid) to authenticated;

-- Examens : l'enseignant ne voit et ne gère que les examens de ses classes.
drop policy if exists exams_teacher_class_scope on public.exams;
create policy exams_teacher_class_scope on public.exams as restrictive for all to authenticated
  using (not public.is_class_scoped_teacher(auth.uid()) or (class_id is not null and public.teacher_teaches_class(auth.uid(), class_id)))
  with check (not public.is_class_scoped_teacher(auth.uid()) or (class_id is not null and public.teacher_teaches_class(auth.uid(), class_id)));

-- Paiements de cotisation : l'enseignant ne voit que ceux des élèves de ses classes.
drop policy if exists spp_teacher_class_scope on public.student_plan_payments;
create policy spp_teacher_class_scope on public.student_plan_payments as restrictive for select to authenticated
  using (not public.is_class_scoped_teacher(auth.uid()) or public.teacher_teaches_student(auth.uid(), student_id));

-- Annonces : ciblage facultatif d'une classe. Sans classe = toute l'école (direction/secrétariat/surveillance).
alter table public.announcements add column if not exists class_id uuid references public.classes(id) on delete set null;

drop policy if exists annonces_teacher_read_scope on public.announcements;
create policy annonces_teacher_read_scope on public.announcements as restrictive for select to authenticated
  using (not public.is_class_scoped_teacher(auth.uid()) or class_id is null or public.teacher_teaches_class(auth.uid(), class_id));

drop policy if exists annonces_teacher_insert_scope on public.announcements;
create policy annonces_teacher_insert_scope on public.announcements as restrictive for insert to authenticated
  with check (not public.is_class_scoped_teacher(auth.uid()) or (class_id is not null and public.teacher_teaches_class(auth.uid(), class_id)));
drop policy if exists annonces_teacher_update_scope on public.announcements;
create policy annonces_teacher_update_scope on public.announcements as restrictive for update to authenticated
  using (not public.is_class_scoped_teacher(auth.uid()) or (class_id is not null and public.teacher_teaches_class(auth.uid(), class_id)))
  with check (not public.is_class_scoped_teacher(auth.uid()) or (class_id is not null and public.teacher_teaches_class(auth.uid(), class_id)));
drop policy if exists annonces_teacher_delete_scope on public.announcements;
create policy annonces_teacher_delete_scope on public.announcements as restrictive for delete to authenticated
  using (not public.is_class_scoped_teacher(auth.uid()) or (class_id is not null and public.teacher_teaches_class(auth.uid(), class_id)));

-- Parents et élèves : une annonce ciblée sur une classe n'est visible que par les familles/élèves de cette classe.
drop policy if exists annonces_family_class_scope on public.announcements;
create policy annonces_family_class_scope on public.announcements as restrictive for select to authenticated
  using (public.is_staff(auth.uid()) or public.is_super_admin(auth.uid()) or class_id is null
         or exists (select 1 from public.students s where s.class_id = announcements.class_id
                    and (s.student_user_id = auth.uid() or s.parent_user_id = auth.uid() or public.is_parent_of_student(auth.uid(), s.id))));
