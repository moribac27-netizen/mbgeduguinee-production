-- Comptabilité : intégrité (écritures non modifiables / non supprimables, annulation motivée), journal d'audit, virements entre comptes,
-- totaux calculés côté serveur, comptabilisation des paiements élèves validés et des salaires payés.
-- Idempotent. Les tables concernées sont vides au moment de l'écriture ; aucune donnée existante n'est supprimée.

-- 1. Colonnes ---------------------------------------------------------------------------------------------------------
alter table public.revenues
  add column if not exists voided_at timestamptz, add column if not exists voided_by uuid, add column if not exists void_reason text,
  add column if not exists payment_id uuid references public.payments(id) on delete set null;
alter table public.expenses
  add column if not exists voided_at timestamptz, add column if not exists voided_by uuid, add column if not exists void_reason text,
  add column if not exists payslip_id uuid references public.payslips(id) on delete set null;
alter table public.financial_accounts add column if not exists is_active boolean not null default true;

-- Un paiement (ou un bulletin de paie) ne peut être comptabilisé qu'une fois, tant que l'écriture n'est pas annulée.
create unique index if not exists revenues_payment_uq on public.revenues (payment_id) where payment_id is not null and voided_at is null;
create unique index if not exists expenses_payslip_uq on public.expenses (payslip_id) where payslip_id is not null and voided_at is null;

-- 2. Virements entre comptes -------------------------------------------------------------------------------------------
create table if not exists public.account_transfers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools(id) on delete restrict,
  from_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  to_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  amount numeric not null check (amount > 0),
  occurred_at date not null default current_date,
  reference text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz, voided_by uuid, void_reason text,
  check (from_account_id <> to_account_id)
);
alter table public.account_transfers enable row level security;
drop policy if exists at_finance on public.account_transfers;
create policy at_finance on public.account_transfers for all to authenticated
  using (public.is_super_admin(auth.uid()) or (public.is_finance(auth.uid()) and school_id = public.current_school_id()))
  with check (public.is_super_admin(auth.uid()) or (public.is_finance(auth.uid()) and school_id = public.current_school_id()));
drop policy if exists prod_tenant_boundary on public.account_transfers;
create policy prod_tenant_boundary on public.account_transfers as restrictive for all to authenticated
  using (public.is_super_admin(auth.uid()) or public.same_school(school_id))
  with check (public.is_super_admin(auth.uid()) or public.same_school(school_id));
drop policy if exists offer_login_gate on public.account_transfers;
create policy offer_login_gate on public.account_transfers as restrictive for all to authenticated
  using ((select public.school_login_allowed())) with check ((select public.school_login_allowed()));
drop policy if exists block_insert_when_expired on public.account_transfers;
create policy block_insert_when_expired on public.account_transfers as restrictive for insert to authenticated
  with check (not public.school_write_blocked(school_id));

-- 3. Journal d'audit comptable -----------------------------------------------------------------------------------------
create table if not exists public.accounting_audit (
  id bigint generated always as identity primary key,
  school_id uuid,
  table_name text not null,
  row_id uuid,
  action text not null,           -- INSERT | UPDATE | VOID | DELETE
  actor uuid,
  old_row jsonb,
  new_row jsonb,
  at timestamptz not null default now()
);
alter table public.accounting_audit enable row level security;
drop policy if exists accounting_audit_read on public.accounting_audit;
create policy accounting_audit_read on public.accounting_audit for select to authenticated
  using (public.is_super_admin(auth.uid()) or (public.is_finance(auth.uid()) and school_id = public.current_school_id()));
revoke insert, update, delete on public.accounting_audit from anon, authenticated;
create index if not exists accounting_audit_school_at on public.accounting_audit (school_id, at desc);

-- 4. Garde d'intégrité : écritures figées, annulation motivée, comptes cohérents, suppression interdite --------------------
create or replace function public.accounting_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_keys text[] := array['description','reference','beneficiary','note','notes','student_id','updated_at','voided_at','voided_by','void_reason'];
  v_old jsonb; v_new jsonb; v_school uuid;
begin
  if TG_OP = 'DELETE' then
    -- Seuls le Super Admin et les opérations de maintenance (sauvegarde/restauration, sans utilisateur) peuvent supprimer.
    if auth.uid() is null or public.is_super_admin(auth.uid()) then return OLD; end if;
    raise exception 'Suppression interdite : annulez l''écriture avec un motif (elle reste visible dans le journal).' using errcode = 'P0001', hint = 'DELETE_FORBIDDEN';
  end if;

  if TG_TABLE_NAME = 'financial_accounts' then
    if TG_OP = 'UPDATE' and NEW.initial_balance is distinct from OLD.initial_balance
       and (exists (select 1 from public.revenues where account_id = OLD.id) or exists (select 1 from public.expenses where account_id = OLD.id)
            or exists (select 1 from public.account_transfers where from_account_id = OLD.id or to_account_id = OLD.id)) then
      raise exception 'Le solde initial ne peut plus être modifié : le compte contient déjà des écritures.' using errcode = 'P0001', hint = 'ACCOUNT_HAS_ENTRIES';
    end if;
    return NEW;
  end if;

  -- Écritures (recettes, dépenses, virements)
  v_school := NEW.school_id;
  if TG_OP = 'INSERT' then
    NEW.created_by := coalesce(NEW.created_by, auth.uid());
    NEW.voided_at := null; NEW.voided_by := null; NEW.void_reason := null;
    if TG_TABLE_NAME = 'account_transfers' then
      if (select count(*) from public.financial_accounts a where a.id in (NEW.from_account_id, NEW.to_account_id) and a.school_id = v_school and a.is_active) <> 2 then
        raise exception 'Comptes invalides : les deux comptes doivent exister, être actifs et appartenir à votre établissement.' using errcode = 'P0001', hint = 'ACCOUNT_INVALID';
      end if;
    else
      if not exists (select 1 from public.financial_accounts a where a.id = NEW.account_id and a.school_id = v_school and a.is_active) then
        raise exception 'Compte invalide : il doit exister, être actif et appartenir à votre établissement.' using errcode = 'P0001', hint = 'ACCOUNT_INVALID';
      end if;
    end if;
    return NEW;
  end if;

  -- UPDATE
  if OLD.voided_at is not null then
    raise exception 'Cette écriture est annulée : elle n''est plus modifiable.' using errcode = 'P0001', hint = 'ENTRY_VOIDED';
  end if;
  v_old := to_jsonb(OLD) - v_keys; v_new := to_jsonb(NEW) - v_keys;
  if v_old is distinct from v_new then
    raise exception 'Montant, compte, date, type et mode d''une écriture ne sont pas modifiables : annulez-la avec un motif puis saisissez-en une nouvelle.' using errcode = 'P0001', hint = 'ENTRY_IMMUTABLE';
  end if;
  if NEW.voided_at is not null then
    if length(trim(coalesce(NEW.void_reason, ''))) < 3 then
      raise exception 'Le motif d''annulation est obligatoire (3 caractères minimum).' using errcode = 'P0001', hint = 'VOID_REASON_REQUIRED';
    end if;
    NEW.voided_at := now(); NEW.voided_by := auth.uid();
  else
    NEW.voided_by := null; NEW.void_reason := null;
  end if;
  return NEW;
end $function$;

create or replace function public.accounting_audit_log()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_action text; v_row jsonb; v_old jsonb;
begin
  if TG_OP = 'DELETE' then v_action := 'DELETE'; v_row := null; v_old := to_jsonb(OLD);
  elsif TG_OP = 'INSERT' then v_action := 'INSERT'; v_row := to_jsonb(NEW); v_old := null;
  else
    v_row := to_jsonb(NEW); v_old := to_jsonb(OLD);
    v_action := case when (v_old->>'voided_at') is null and (v_row->>'voided_at') is not null then 'VOID' else 'UPDATE' end;
    if v_action = 'UPDATE' and v_row - 'updated_at' = v_old - 'updated_at' then return NEW; end if;
  end if;
  insert into public.accounting_audit(school_id, table_name, row_id, action, actor, old_row, new_row)
  values (coalesce((v_row->>'school_id')::uuid, (v_old->>'school_id')::uuid), TG_TABLE_NAME, coalesce((v_row->>'id')::uuid, (v_old->>'id')::uuid), v_action, auth.uid(), v_old, v_row);
  return coalesce(NEW, OLD);
end $function$;

do $$
declare t text;
begin
  foreach t in array array['revenues','expenses','account_transfers','financial_accounts'] loop
    execute format('drop trigger if exists trg_zz_accounting_guard on public.%I', t);
    execute format('create trigger trg_zz_accounting_guard before insert or update or delete on public.%I for each row execute function public.accounting_guard()', t);
    execute format('drop trigger if exists trg_zz_accounting_audit on public.%I', t);
    execute format('create trigger trg_zz_accounting_audit after insert or update or delete on public.%I for each row execute function public.accounting_audit_log()', t);
  end loop;
end $$;

-- 5. Soldes et synthèse calculés côté serveur (plus de limite de 1000 lignes côté navigateur) ---------------------------------
create or replace function public.accounting_balances()
returns table(account_id uuid, name text, type text, is_active boolean, initial_balance numeric,
              revenues numeric, expenses numeric, transfers_in numeric, transfers_out numeric, balance numeric)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not (public.is_finance(auth.uid()) or public.is_super_admin(auth.uid())) then raise exception 'FORBIDDEN'; end if;
  return query
  select a.id, a.name, a.type::text, a.is_active, a.initial_balance,
         coalesce((select sum(r.amount) from public.revenues r where r.account_id = a.id and r.voided_at is null), 0),
         coalesce((select sum(e.amount) from public.expenses e where e.account_id = a.id and e.voided_at is null), 0),
         coalesce((select sum(t.amount) from public.account_transfers t where t.to_account_id = a.id and t.voided_at is null), 0),
         coalesce((select sum(t.amount) from public.account_transfers t where t.from_account_id = a.id and t.voided_at is null), 0),
         a.initial_balance
           + coalesce((select sum(r.amount) from public.revenues r where r.account_id = a.id and r.voided_at is null), 0)
           - coalesce((select sum(e.amount) from public.expenses e where e.account_id = a.id and e.voided_at is null), 0)
           + coalesce((select sum(t.amount) from public.account_transfers t where t.to_account_id = a.id and t.voided_at is null), 0)
           - coalesce((select sum(t.amount) from public.account_transfers t where t.from_account_id = a.id and t.voided_at is null), 0)
  from public.financial_accounts a
  where a.school_id = public.current_school_id()
  order by a.name;
end $function$;

create or replace function public.accounting_summary(_from date default null, _to date default null, _account_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare v_school uuid := public.current_school_id(); v_rev numeric; v_exp numeric; v_by_rev jsonb; v_by_exp jsonb; v_months jsonb;
begin
  if auth.uid() is null or not (public.is_finance(auth.uid()) or public.is_super_admin(auth.uid())) then raise exception 'FORBIDDEN'; end if;
  select coalesce(sum(amount),0) into v_rev from public.revenues
    where school_id = v_school and voided_at is null and (_from is null or occurred_at >= _from) and (_to is null or occurred_at <= _to) and (_account_id is null or account_id = _account_id);
  select coalesce(sum(amount),0) into v_exp from public.expenses
    where school_id = v_school and voided_at is null and (_from is null or occurred_at >= _from) and (_to is null or occurred_at <= _to) and (_account_id is null or account_id = _account_id);
  select coalesce(jsonb_object_agg(t, s), '{}'::jsonb) into v_by_rev from (
    select type::text t, sum(amount) s from public.revenues
     where school_id = v_school and voided_at is null and (_from is null or occurred_at >= _from) and (_to is null or occurred_at <= _to) and (_account_id is null or account_id = _account_id) group by type) x;
  select coalesce(jsonb_object_agg(t, s), '{}'::jsonb) into v_by_exp from (
    select type::text t, sum(amount) s from public.expenses
     where school_id = v_school and voided_at is null and (_from is null or occurred_at >= _from) and (_to is null or occurred_at <= _to) and (_account_id is null or account_id = _account_id) group by type) x;
  select coalesce(jsonb_agg(jsonb_build_object('month', m, 'revenue', r, 'expense', e) order by m), '[]'::jsonb) into v_months from (
    select m, sum(r) r, sum(e) e from (
      select to_char(occurred_at, 'YYYY-MM') m, amount r, 0::numeric e from public.revenues
       where school_id = v_school and voided_at is null and (_from is null or occurred_at >= _from) and (_to is null or occurred_at <= _to) and (_account_id is null or account_id = _account_id)
      union all
      select to_char(occurred_at, 'YYYY-MM'), 0, amount from public.expenses
       where school_id = v_school and voided_at is null and (_from is null or occurred_at >= _from) and (_to is null or occurred_at <= _to) and (_account_id is null or account_id = _account_id)) u
    group by m) y;
  return jsonb_build_object('revenue_total', v_rev, 'expense_total', v_exp, 'net', v_rev - v_exp,
                            'revenue_by_type', v_by_rev, 'expense_by_type', v_by_exp, 'by_month', v_months);
end $function$;

-- 6. Comptabilisation des paiements élèves validés ---------------------------------------------------------------------------
create or replace function public.unposted_payments()
returns table(id uuid, student_name text, amount numeric, payment_type text, payment_method text, receipt_number text, paid_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not (public.is_finance(auth.uid()) or public.is_super_admin(auth.uid())) then raise exception 'FORBIDDEN'; end if;
  return query
  select p.id, s.full_name, p.amount, p.payment_type, p.payment_method, p.receipt_number, p.paid_at
  from public.payments p left join public.students s on s.id = p.student_id
  where p.school_id = public.current_school_id() and p.validation_status = 'validé' and p.amount > 0
    and not exists (select 1 from public.revenues r where r.payment_id = p.id and r.voided_at is null)
  order by p.paid_at;
end $function$;

create or replace function public._post_payment(_payment_id uuid, _account_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare p public.payments; v_name text; v_type text; v_method text; v_id uuid;
begin
  select * into p from public.payments where id = _payment_id and school_id = public.current_school_id() for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.validation_status <> 'validé' or p.amount <= 0 then raise exception 'PAYMENT_NOT_VALIDATED'; end if;
  if exists (select 1 from public.revenues where payment_id = p.id and voided_at is null) then raise exception 'ALREADY_POSTED'; end if;
  select full_name into v_name from public.students where id = p.student_id;
  v_type := case lower(coalesce(p.payment_type,'')) when 'inscription' then 'inscription' when 'reinscription' then 'reinscription' when 'réinscription' then 'reinscription'
              when 'scolarite' then 'scolarite' when 'scolarité' then 'scolarite' when 'transport' then 'transport' when 'cantine' then 'cantine'
              when 'uniforme' then 'uniforme' when 'examens' then 'examens' when 'examen' then 'examens' else 'autres' end;
  v_method := case lower(coalesce(p.payment_method,'')) when 'espèces' then 'especes' when 'especes' then 'especes' when 'orange money' then 'orange_money'
              when 'mtn momo' then 'mobile_money' when 'virement' then 'virement' when 'chèque' then 'cheque' when 'cheque' then 'cheque' else 'autre' end;
  insert into public.revenues(account_id, type, amount, method, reference, description, student_id, occurred_at, payment_id)
  values (_account_id, v_type::public.revenue_type, p.amount, v_method::public.payment_method, coalesce(p.receipt_number, p.transaction_reference),
          'Paiement élève' || coalesce(' — ' || v_name, '') || coalesce(' — reçu ' || p.receipt_number, ''), p.student_id, (p.paid_at at time zone 'Africa/Conakry')::date, p.id)
  returning id into v_id;
  return v_id;
end $function$;

create or replace function public.post_payment_to_revenue(_payment_id uuid, _account_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not public.is_finance(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return public._post_payment(_payment_id, _account_id);
end $function$;

create or replace function public.post_all_payments(_account_id uuid)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare r record; n integer := 0;
begin
  if auth.uid() is null or not public.is_finance(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  for r in select u.id from public.unposted_payments() u loop
    perform public._post_payment(r.id, _account_id); n := n + 1;
  end loop;
  return n;
end $function$;

-- 7. Comptabilisation des salaires payés --------------------------------------------------------------------------------------
create or replace function public.unposted_payslips()
returns table(id uuid, employee text, period_month integer, period_year integer, net_pay numeric, paid_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not (public.is_finance(auth.uid()) or public.is_super_admin(auth.uid())) then raise exception 'FORBIDDEN'; end if;
  return query
  select p.id, c.full_name, p.period_month, p.period_year, p.net_pay, p.paid_at
  from public.payslips p join public.employee_contracts c on c.id = p.contract_id
  where p.school_id = public.current_school_id() and p.paid and p.net_pay > 0
    and not exists (select 1 from public.expenses e where e.payslip_id = p.id and e.voided_at is null)
  order by p.period_year, p.period_month;
end $function$;

create or replace function public._post_payslip(_payslip_id uuid, _account_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare p public.payslips; v_name text; v_id uuid;
begin
  select * into p from public.payslips where id = _payslip_id and school_id = public.current_school_id() for update;
  if not found then raise exception 'PAYSLIP_NOT_FOUND'; end if;
  if not p.paid or p.net_pay <= 0 then raise exception 'PAYSLIP_NOT_PAID'; end if;
  if exists (select 1 from public.expenses where payslip_id = p.id and voided_at is null) then raise exception 'ALREADY_POSTED'; end if;
  select full_name into v_name from public.employee_contracts where id = p.contract_id;
  insert into public.expenses(account_id, type, amount, method, description, beneficiary, occurred_at, payslip_id)
  values (_account_id, 'salaires', p.net_pay, 'especes', 'Salaire ' || lpad(p.period_month::text, 2, '0') || '/' || p.period_year, v_name,
          coalesce((p.paid_at at time zone 'Africa/Conakry')::date, current_date), p.id)
  returning id into v_id;
  return v_id;
end $function$;

create or replace function public.post_payslip_to_expense(_payslip_id uuid, _account_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not public.is_finance(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return public._post_payslip(_payslip_id, _account_id);
end $function$;

create or replace function public.post_all_payslips(_account_id uuid)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare r record; n integer := 0;
begin
  if auth.uid() is null or not public.is_finance(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  for r in select u.id from public.unposted_payslips() u loop
    perform public._post_payslip(r.id, _account_id); n := n + 1;
  end loop;
  return n;
end $function$;

revoke all on function public._post_payment(uuid, uuid), public._post_payslip(uuid, uuid) from public, anon, authenticated;
revoke all on function public.accounting_balances(), public.accounting_summary(date, date, uuid), public.unposted_payments(), public.unposted_payslips(),
  public.post_payment_to_revenue(uuid, uuid), public.post_all_payments(uuid), public.post_payslip_to_expense(uuid, uuid), public.post_all_payslips(uuid) from public, anon;
grant execute on function public.accounting_balances(), public.accounting_summary(date, date, uuid), public.unposted_payments(), public.unposted_payslips(),
  public.post_payment_to_revenue(uuid, uuid), public.post_all_payments(uuid), public.post_payslip_to_expense(uuid, uuid), public.post_all_payslips(uuid) to authenticated;
