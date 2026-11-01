-- Comptabilité : comptabilisation automatique.
-- Si la direction/finance choisit un compte, chaque paiement élève validé devient automatiquement une recette et chaque
-- salaire payé une dépense sur ce compte (une seule fois chacun). Si l'écriture est impossible (ex. période clôturée,
-- compte archivé), le paiement reste enregistré et apparaît dans « À comptabiliser » : rien n'est perdu ni bloqué.
-- Idempotent ; aucune donnée existante modifiée (les paiements déjà là restent à comptabiliser manuellement).
alter table public.accounting_settings add column if not exists auto_post_account_id uuid references public.financial_accounts(id) on delete set null;

create or replace function public.set_accounting_auto_post(_account_id uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_school uuid := public.current_school_id(); v_old uuid;
begin
  if auth.uid() is null or v_school is null then raise exception 'FORBIDDEN'; end if;
  if not (public.is_finance(auth.uid()) or public.is_direction(auth.uid())) then raise exception 'FORBIDDEN'; end if;
  if _account_id is not null and not exists (select 1 from public.financial_accounts a where a.id = _account_id and a.school_id = v_school and a.is_active) then
    raise exception 'Compte invalide : il doit exister, être actif et appartenir à votre établissement.' using errcode = 'P0001';
  end if;
  select auto_post_account_id into v_old from public.accounting_settings where school_id = v_school for update;
  insert into public.accounting_settings(school_id, auto_post_account_id, updated_by, updated_at) values (v_school, _account_id, auth.uid(), now())
  on conflict (school_id) do update set auto_post_account_id = excluded.auto_post_account_id, updated_by = excluded.updated_by, updated_at = now();
  insert into public.accounting_audit(school_id, table_name, row_id, action, actor, old_row, new_row)
  values (v_school, 'accounting_settings', null, 'UPDATE', auth.uid(), jsonb_build_object('auto_post_account_id', v_old), jsonb_build_object('auto_post_account_id', _account_id));
  return _account_id;
end $function$;
revoke all on function public.set_accounting_auto_post(uuid) from public, anon;
grant execute on function public.set_accounting_auto_post(uuid) to authenticated;

create or replace function public.auto_post_payment()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_acc uuid; v_name text; v_type text; v_method text;
begin
  if NEW.validation_status <> 'validé' or NEW.amount <= 0 then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.validation_status = 'validé' then return NEW; end if;
  select auto_post_account_id into v_acc from public.accounting_settings where school_id = NEW.school_id;
  if v_acc is null then return NEW; end if;
  begin
    if exists (select 1 from public.revenues where payment_id = NEW.id and voided_at is null) then return NEW; end if;
    select full_name into v_name from public.students where id = NEW.student_id;
    v_type := case lower(coalesce(NEW.payment_type,'')) when 'inscription' then 'inscription' when 'reinscription' then 'reinscription' when 'réinscription' then 'reinscription'
                when 'scolarite' then 'scolarite' when 'scolarité' then 'scolarite' when 'transport' then 'transport' when 'cantine' then 'cantine'
                when 'uniforme' then 'uniforme' when 'examens' then 'examens' when 'examen' then 'examens' else 'autres' end;
    v_method := case lower(coalesce(NEW.payment_method,'')) when 'espèces' then 'especes' when 'especes' then 'especes' when 'orange money' then 'orange_money'
                when 'mtn momo' then 'mobile_money' when 'virement' then 'virement' when 'chèque' then 'cheque' when 'cheque' then 'cheque' else 'autre' end;
    insert into public.revenues(school_id, account_id, type, amount, method, reference, description, student_id, occurred_at, payment_id)
    values (NEW.school_id, v_acc, v_type::public.revenue_type, NEW.amount, v_method::public.payment_method, coalesce(NEW.receipt_number, NEW.transaction_reference),
            'Paiement élève' || coalesce(' — ' || v_name, '') || coalesce(' — reçu ' || NEW.receipt_number, ''), NEW.student_id, (NEW.paid_at at time zone 'Africa/Conakry')::date, NEW.id);
  exception when others then
    null; -- reste dans « À comptabiliser »
  end;
  return NEW;
end $function$;
drop trigger if exists trg_auto_post_payment on public.payments;
create trigger trg_auto_post_payment after insert or update of validation_status on public.payments for each row execute function public.auto_post_payment();

create or replace function public.auto_post_payslip()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_acc uuid; v_name text;
begin
  if not NEW.paid or NEW.net_pay <= 0 then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.paid then return NEW; end if;
  select auto_post_account_id into v_acc from public.accounting_settings where school_id = NEW.school_id;
  if v_acc is null then return NEW; end if;
  begin
    if exists (select 1 from public.expenses where payslip_id = NEW.id and voided_at is null) then return NEW; end if;
    select full_name into v_name from public.employee_contracts where id = NEW.contract_id;
    insert into public.expenses(school_id, account_id, type, amount, method, description, beneficiary, occurred_at, payslip_id)
    values (NEW.school_id, v_acc, 'salaires', NEW.net_pay, 'especes', 'Salaire ' || lpad(NEW.period_month::text, 2, '0') || '/' || NEW.period_year, v_name,
            coalesce((NEW.paid_at at time zone 'Africa/Conakry')::date, current_date), NEW.id);
  exception when others then
    null;
  end;
  return NEW;
end $function$;
drop trigger if exists trg_auto_post_payslip on public.payslips;
create trigger trg_auto_post_payslip after insert or update of paid on public.payslips for each row execute function public.auto_post_payslip();
