-- Enseignants : type (instituteur du primaire, éducatrice de maternelle, enseignant spécialisé), affectations sans doublon,
-- un seul titulaire « toutes matières » par classe et par année, et l'éducatrice référente d'une section de maternelle
-- reçoit automatiquement l'accès à la classe correspondante. Idempotent ; aucune donnée existante supprimée.

alter table public.teachers add column if not exists teacher_type text not null default 'specialise';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'teachers_teacher_type_chk') then
    alter table public.teachers add constraint teachers_teacher_type_chk check (teacher_type in ('instituteur','educatrice','specialise'));
  end if;
end $$;

-- Pas deux fois la même affectation ; un seul titulaire (toutes matières) par classe et par année.
create unique index if not exists tca_unique_assignment on public.teacher_class_assignments
  (teacher_id, class_id, coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid), academic_year);
create unique index if not exists tca_one_titular on public.teacher_class_assignments (class_id, academic_year) where subject_id is null;

-- Maternelle : l'enseignant référent d'une section est affecté (toutes matières) à la classe de la section.
create or replace function public.sync_nursery_referent()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_year text;
begin
  v_year := public.school_academic_year(NEW.school_id);
  if TG_OP = 'UPDATE' and OLD.class_id is not null and OLD.teacher_id is not null
     and (OLD.teacher_id is distinct from NEW.teacher_id or OLD.class_id is distinct from NEW.class_id) then
    delete from public.teacher_class_assignments
     where class_id = OLD.class_id and teacher_id = OLD.teacher_id and subject_id is null and academic_year = v_year;
  end if;
  if NEW.class_id is not null and NEW.teacher_id is not null then
    insert into public.teacher_class_assignments (teacher_id, class_id, subject_id, school_id, academic_year)
    values (NEW.teacher_id, NEW.class_id, null, NEW.school_id, v_year)
    on conflict (class_id, academic_year) where subject_id is null do update set teacher_id = excluded.teacher_id;
  end if;
  return NEW;
end $function$;
drop trigger if exists trg_nursery_referent_sync on public.nursery_sections;
create trigger trg_nursery_referent_sync after insert or update of teacher_id, class_id on public.nursery_sections
  for each row execute function public.sync_nursery_referent();

-- Rattrapage des sections existantes
insert into public.teacher_class_assignments (teacher_id, class_id, subject_id, school_id, academic_year)
select s.teacher_id, s.class_id, null, s.school_id, public.school_academic_year(s.school_id)
from public.nursery_sections s
where s.teacher_id is not null and s.class_id is not null
on conflict do nothing;
