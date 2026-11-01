-- Comptabilité : rapprochement (pointage des écritures sur le relevé du compte).
-- Pointer ne modifie ni montant, ni date, ni compte : seules les colonnes reconciled_at / reconciled_by changent, même dans une période clôturée.
-- Idempotent ; aucune donnée existante modifiée.
alter table public.revenues add column if not exists reconciled_at timestamptz, add column if not exists reconciled_by uuid;
alter table public.expenses add column if not exists reconciled_at timestamptz, add column if not exists reconciled_by uuid;
alter table public.account_transfers add column if not exists reconciled_at timestamptz, add column if not exists reconciled_by uuid;

-- Le pointage n'est pas une modification de l'écriture (garde d'intégrité).
create or replace function public.accounting_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_keys text[] := array['description','reference','beneficiary','note','notes','student_id','updated_at','voided_at','voided_by','void_reason','reconciled_at','reconciled_by'];
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

-- La clôture de période n'empêche pas de pointer une écriture ancienne.
create or replace function public.accounting_period_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_closed date;
begin
  if auth.uid() is null then return NEW; end if;
  select closed_until into v_closed from public.accounting_settings where school_id = NEW.school_id;
  if v_closed is null then return NEW; end if;
  if TG_OP = 'INSERT' and NEW.occurred_at <= v_closed then
    raise exception 'Période clôturée jusqu''au % : aucune écriture ne peut être créée à cette date ou avant.', to_char(v_closed, 'DD/MM/YYYY') using errcode = 'P0001', hint = 'PERIOD_CLOSED';
  end if;
  if TG_OP = 'UPDATE' and OLD.occurred_at <= v_closed
     and (to_jsonb(OLD) - array['reconciled_at','reconciled_by','updated_at']) is distinct from (to_jsonb(NEW) - array['reconciled_at','reconciled_by','updated_at']) then
    raise exception 'Période clôturée jusqu''au % : cette écriture ne peut plus être modifiée ni annulée.', to_char(v_closed, 'DD/MM/YYYY') using errcode = 'P0001', hint = 'PERIOD_CLOSED';
  end if;
  return NEW;
end $function$;

create table if not exists public.account_reconciliations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools(id) on delete restrict,
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  statement_date date not null,
  statement_balance numeric not null,
  pointed_balance numeric not null,
  difference numeric not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.account_reconciliations enable row level security;
drop policy if exists ar_read on public.account_reconciliations;
create policy ar_read on public.account_reconciliations for select to authenticated
  using (public.is_super_admin(auth.uid()) or (public.same_school(school_id) and (public.is_finance(auth.uid()) or public.is_direction(auth.uid()))));
revoke insert, update, delete on public.account_reconciliations from anon, authenticated;

-- Solde pointé d'un compte = solde initial + écritures pointées non annulées (recettes − dépenses ± virements).
create or replace function public.reconciliation_status(_account_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare v_school uuid := public.current_school_id(); a public.financial_accounts; v_pointed numeric; v_book numeric; v_unp int;
begin
  if auth.uid() is null or not (public.is_finance(auth.uid()) or public.is_direction(auth.uid())) then raise exception 'FORBIDDEN'; end if;
  select * into a from public.financial_accounts where id = _account_id and school_id = v_school;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  select a.initial_balance
    + coalesce((select sum(amount) from public.revenues where account_id = a.id and voided_at is null and reconciled_at is not null), 0)
    - coalesce((select sum(amount) from public.expenses where account_id = a.id and voided_at is null and reconciled_at is not null), 0)
    + coalesce((select sum(amount) from public.account_transfers where to_account_id = a.id and voided_at is null and reconciled_at is not null), 0)
    - coalesce((select sum(amount) from public.account_transfers where from_account_id = a.id and voided_at is null and reconciled_at is not null), 0)
  into v_pointed;
  select a.initial_balance
    + coalesce((select sum(amount) from public.revenues where account_id = a.id and voided_at is null), 0)
    - coalesce((select sum(amount) from public.expenses where account_id = a.id and voided_at is null), 0)
    + coalesce((select sum(amount) from public.account_transfers where to_account_id = a.id and voided_at is null), 0)
    - coalesce((select sum(amount) from public.account_transfers where from_account_id = a.id and voided_at is null), 0)
  into v_book;
  select (select count(*) from public.revenues where account_id = a.id and voided_at is null and reconciled_at is null)
       + (select count(*) from public.expenses where account_id = a.id and voided_at is null and reconciled_at is null)
       + (select count(*) from public.account_transfers where (to_account_id = a.id or from_account_id = a.id) and voided_at is null and reconciled_at is null)
  into v_unp;
  return jsonb_build_object('pointed_balance', v_pointed, 'book_balance', v_book, 'unpointed_count', v_unp);
end $function$;
revoke all on function public.reconciliation_status(uuid) from public, anon;
grant execute on function public.reconciliation_status(uuid) to authenticated;

-- Pointer / dépointer des écritures (kind : revenue | expense | transfer).
create or replace function public.set_reconciled(_kind text, _ids uuid[], _value boolean)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare v_school uuid := public.current_school_id(); n integer;
begin
  if auth.uid() is null or v_school is null or not (public.is_finance(auth.uid()) or public.is_direction(auth.uid())) then raise exception 'FORBIDDEN'; end if;
  if _kind = 'revenue' then
    update public.revenues set reconciled_at = case when _value then now() end, reconciled_by = case when _value then auth.uid() end
      where id = any(_ids) and school_id = v_school and voided_at is null;
  elsif _kind = 'expense' then
    update public.expenses set reconciled_at = case when _value then now() end, reconciled_by = case when _value then auth.uid() end
      where id = any(_ids) and school_id = v_school and voided_at is null;
  elsif _kind = 'transfer' then
    update public.account_transfers set reconciled_at = case when _value then now() end, reconciled_by = case when _value then auth.uid() end
      where id = any(_ids) and school_id = v_school and voided_at is null;
  else raise exception 'KIND_INVALID'; end if;
  get diagnostics n = row_count;
  return n;
end $function$;
revoke all on function public.set_reconciled(text, uuid[], boolean) from public, anon;
grant execute on function public.set_reconciled(text, uuid[], boolean) to authenticated;

-- Enregistrer un rapprochement (relevé à une date, écart constaté).
create or replace function public.save_reconciliation(_account_id uuid, _statement_date date, _statement_balance numeric, _note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_school uuid := public.current_school_id(); v_st jsonb; v_id uuid; v_pointed numeric;
begin
  v_st := public.reconciliation_status(_account_id);
  v_pointed := (v_st->>'pointed_balance')::numeric;
  insert into public.account_reconciliations(school_id, account_id, statement_date, statement_balance, pointed_balance, difference, note, created_by)
  values (v_school, _account_id, _statement_date, _statement_balance, v_pointed, _statement_balance - v_pointed, nullif(trim(coalesce(_note,'')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $function$;
revoke all on function public.save_reconciliation(uuid, date, numeric, text) from public, anon;
grant execute on function public.save_reconciliation(uuid, date, numeric, text) to authenticated;
