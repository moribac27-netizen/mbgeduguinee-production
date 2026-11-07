-- Vue Fondateur : compléments côté base (additifs, idempotents).
-- Retour arrière (à exécuter à la main si besoin) :
--   drop index if exists public.revenues_school_occurred_idx, public.expenses_school_occurred_idx, public.payments_school_paid_idx,
--     public.payslips_school_period_idx, public.student_attendance_school_date_idx, public.students_school_status_class_idx;
--   -- et réécrire _user_roles_founder_guard() en version INSERT/UPDATE seule, puis recréer le déclencheur « before insert or update ».

-- 1) Index sur les colonnes de filtre des agrégats (école + date)
create index if not exists revenues_school_occurred_idx on public.revenues (school_id, occurred_at);
create index if not exists expenses_school_occurred_idx on public.expenses (school_id, occurred_at);
create index if not exists payments_school_paid_idx on public.payments (school_id, paid_at);
create index if not exists payslips_school_period_idx on public.payslips (school_id, period_year, period_month);
create index if not exists student_attendance_school_date_idx on public.student_attendance (school_id, date);
create index if not exists students_school_status_class_idx on public.students (school_id, status, class_id);

-- 2) Le rôle fondateur ne peut être ni attribué, ni modifié, ni RETIRÉ par le personnel d'une école :
--    seul le Super Admin (ou le serveur) y touche (D4).
create or replace function public._user_roles_founder_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_super_admin(auth.uid()) then
    if TG_OP in ('INSERT','UPDATE') and NEW.role::text = 'fondateur' then raise exception 'FOUNDER_ROLE_RESERVED'; end if;
    if TG_OP in ('UPDATE','DELETE') and OLD.role::text = 'fondateur' then raise exception 'FOUNDER_ROLE_RESERVED'; end if;
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end $$;
revoke all on function public._user_roles_founder_guard() from public, anon, authenticated;

drop trigger if exists trg_user_roles_founder_guard on public.user_roles;
create trigger trg_user_roles_founder_guard
  before insert or update or delete on public.user_roles
  for each row execute function public._user_roles_founder_guard();
