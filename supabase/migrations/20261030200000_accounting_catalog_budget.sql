-- Comptabilité : budget prévisionnel par année scolaire et par catégorie du plan comptable (accounting_categories).
-- Idempotent. Aucune donnée supprimée ni modifiée. Dépend de accounting_categories (plan comptable par établissement).

create table if not exists public.accounting_budgets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools(id) on delete cascade,
  academic_year text not null check (academic_year ~ '^[0-9]{4}-[0-9]{4}$'),
  category_id uuid not null references public.accounting_categories(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year, category_id)
);
alter table public.accounting_budgets enable row level security;

drop policy if exists ab_finance on public.accounting_budgets;
create policy ab_finance on public.accounting_budgets for all to authenticated
  using (public.is_super_admin(auth.uid()) or (public.is_finance(auth.uid()) and school_id = public.current_school_id()))
  with check (public.is_super_admin(auth.uid()) or (public.is_finance(auth.uid()) and school_id = public.current_school_id()));
drop policy if exists prod_tenant_boundary on public.accounting_budgets;
create policy prod_tenant_boundary on public.accounting_budgets as restrictive for all to authenticated
  using (public.is_super_admin(auth.uid()) or public.same_school(school_id))
  with check (public.is_super_admin(auth.uid()) or public.same_school(school_id));
drop policy if exists offer_login_gate on public.accounting_budgets;
create policy offer_login_gate on public.accounting_budgets as restrictive for all to authenticated
  using ((select public.school_login_allowed())) with check ((select public.school_login_allowed()));
drop policy if exists block_insert_when_expired on public.accounting_budgets;
create policy block_insert_when_expired on public.accounting_budgets as restrictive for insert to authenticated
  with check (not public.school_write_blocked(school_id));

-- La catégorie doit appartenir au même établissement ; date de mise à jour automatique.
create or replace function public.accounting_budget_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if not exists (select 1 from public.accounting_categories c where c.id = NEW.category_id and c.school_id = NEW.school_id) then
    raise exception 'Catégorie invalide pour cet établissement.' using errcode = 'P0001', hint = 'CATEGORY_INVALID';
  end if;
  NEW.updated_at := now();
  if TG_OP = 'INSERT' then NEW.created_by := coalesce(NEW.created_by, auth.uid()); end if;
  return NEW;
end $function$;
drop trigger if exists trg_ab_guard on public.accounting_budgets;
create trigger trg_ab_guard before insert or update on public.accounting_budgets for each row execute function public.accounting_budget_guard();
drop trigger if exists trg_zz_accounting_audit on public.accounting_budgets;
create trigger trg_zz_accounting_audit after insert or update or delete on public.accounting_budgets for each row execute function public.accounting_audit_log();

-- Budget prévu et réalisé (hors écritures annulées) par catégorie pour une année scolaire (par défaut : l'année en cours).
create or replace function public.accounting_budget_status(_year text default null)
returns table(category_id uuid, kind text, code text, label text, budget numeric, actual numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
declare v_school uuid := public.current_school_id(); v_year text := coalesce(nullif(trim(_year), ''), public.school_academic_year(public.current_school_id())); v_from date; v_to date;
begin
  if auth.uid() is null or not (public.is_finance(auth.uid()) or public.is_super_admin(auth.uid())) then raise exception 'FORBIDDEN'; end if;
  if v_year !~ '^[0-9]{4}-[0-9]{4}$' then raise exception 'YEAR_INVALID'; end if;
  v_from := make_date(split_part(v_year, '-', 1)::int, 9, 1);
  v_to := make_date(split_part(v_year, '-', 2)::int, 8, 31);
  return query
  with r as (
    select x.category_id c, sum(x.amount) s from public.revenues x
     where x.school_id = v_school and x.voided_at is null and x.occurred_at between v_from and v_to group by x.category_id
    union all
    select y.category_id, sum(y.amount) from public.expenses y
     where y.school_id = v_school and y.voided_at is null and y.occurred_at between v_from and v_to group by y.category_id)
  select c.id, c.kind, c.code, c.label,
         coalesce((select ab.amount from public.accounting_budgets ab where ab.school_id = v_school and ab.academic_year = v_year and ab.category_id = c.id), 0),
         coalesce((select sum(r.s) from r where r.c = c.id), 0)
  from public.accounting_categories c
  where c.school_id = v_school
    and (c.is_active or exists (select 1 from public.accounting_budgets ab where ab.school_id = v_school and ab.academic_year = v_year and ab.category_id = c.id)
         or exists (select 1 from r where r.c = c.id))
  order by c.kind, c.sort_order, c.code;
end $function$;
revoke all on function public.accounting_budget_status(text) from public, anon;
grant execute on function public.accounting_budget_status(text) to authenticated;
