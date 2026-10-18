-- Restriction : le compte RH ne lit plus la liste des élèves de son école.
-- Pourquoi : le rôle RH ne sert qu'à la gestion du personnel (/salaires) et n'a aucun besoin des élèves.
-- Ce qui ne change pas : direction, secrétariat, enseignants (leurs élèves), surveillants, comptables, bibliothèque,
-- infirmerie, transport, cantine et éducatrices gardent la lecture, car leurs écrans affichent le nom de l'élève
-- (jointures `students(full_name)`) : les restreindre casserait ces modules. Les parents et les élèves ne sont pas concernés.
-- Un utilisateur qui cumule RH + un autre rôle autorisé garde l'accès.
-- À exécuter manuellement dans le SQL Editor de Supabase. Idempotent.

create or replace function public.has_student_list_role(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as
$$ select exists (
     select 1 from public.user_roles ur
     where ur.user_id = _user_id
       and ur.role in ('admin','directeur','directeur_etudes','proviseur','comptable','enseignant','surveillant',
                       'secretariat','bibliothecaire','infirmerie','educatrice_maternelle','responsable_transport','responsable_cantine')
   ) $$;

drop policy if exists students_staff_read on public.students;
create policy students_staff_read on public.students for select to authenticated
  using (public.is_super_admin(auth.uid())
         or (public.is_staff(auth.uid()) and public.has_student_list_role(auth.uid()) and school_id = public.current_school_id()));
