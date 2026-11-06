-- Enregistrement dans le dépôt d'une migration déjà appliquée en base (version 20261105231145).
-- ===== B. Logique de l'échéancier (aucun effet tant que billing.flat_installments.enabled = false) =====

-- Vue de l'échéancier pour l'écran « Mon forfait » (conserve les anciennes clés + nouvelles clés en montants)
create or replace function public._flat_installments_view(_sub public.school_offer_subscriptions) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_cfg jsonb := coalesce(public.platform_setting('billing.flat', '{}'::jsonb), '{}'::jsonb);
  v_grace int := greatest(0, coalesce((v_cfg->>'grace_days')::int, 5));
  v_monthly numeric := _sub.monthly_price;
  v_annual numeric := _sub.monthly_price * public._flat_total_months();
  v_pv numeric; v_pend numeric; v_decl numeric; v_balance numeric; v_credit numeric; v_first date;
  v_rows jsonb; v_due_now numeric; v_overdue numeric; v_pay_now numeric; v_next_amt numeric; v_next_due date; v_min numeric;
  v_last date; v_left int; v_annual_mode boolean; v_phase text := public.school_flat_phase(_sub.school_id);
begin
  select coalesce(sum(amount) filter (where status = 'VALIDATED'), 0), coalesce(sum(amount) filter (where status = 'PENDING'), 0),
         min((declared_at at time zone 'Africa/Conakry')::date) filter (where status not in ('REJECTED','CANCELLED'))
    into v_pv, v_pend, v_first
    from public.school_flat_payments where school_id = _sub.school_id and academic_year = _sub.academic_year and period_type = 'monthly';
  v_decl := v_pv + v_pend;
  v_annual_mode := exists (select 1 from public.school_flat_payments x where x.school_id = _sub.school_id and x.academic_year = _sub.academic_year
                           and x.period_type = 'annual' and x.status not in ('REJECTED','CANCELLED'));
  v_balance := case when v_annual_mode then 0 else greatest(v_annual - v_pv, 0) end;
  v_credit := greatest(v_pv - v_annual, 0);

  select coalesce(jsonb_agg(jsonb_build_object(
           'k', i.seq, 'seq', i.seq, 'kind', i.kind, 'id', i.id, 'due_date', i.due_date, 'grace_end_date', i.due_date + v_grace,
           'amount_due', i.amount_due, 'amount_paid', i.amount_paid, 'remaining', greatest(i.amount_due - i.amount_paid, 0), 'status', i.status,
           'required_amount', i.cum, 'required_months', ceil(i.cum / nullif(v_monthly, 0)), 'met', v_pv >= i.cum) order by i.seq), '[]'::jsonb),
         coalesce(sum(greatest(i.amount_due - i.amount_paid, 0)) filter (where i.status <> 'cancelled' and i.due_date <= v_today), 0),
         coalesce(sum(greatest(i.amount_due - i.amount_paid, 0)) filter (where i.status = 'overdue'), 0),
         max(i.due_date) filter (where i.status <> 'cancelled'),
         count(*) filter (where i.seq > 0 and i.status <> 'cancelled' and i.amount_due - i.amount_paid > 0)
    into v_rows, v_due_now, v_overdue, v_last, v_left
    from (select x.*, sum(x.amount_due) over (order by x.seq) as cum from public.school_flat_installments x where x.subscription_id = _sub.id) i;

  select greatest(i.amount_due - i.amount_paid, 0), i.due_date into v_next_amt, v_next_due
    from public.school_flat_installments i
   where i.subscription_id = _sub.id and i.status in ('pending','partial') and i.due_date > v_today and i.amount_due - i.amount_paid > 0
   order by i.seq limit 1;

  v_pay_now := greatest(v_due_now - v_pend, 0);
  v_min := case when v_annual_mode then 0
                when v_pay_now > 0 then v_pay_now
                else greatest(coalesce(v_next_amt, 0) - greatest(v_pend - v_due_now, 0), 0) end;

  return jsonb_build_object(
    'progressive', true, 'mode', 'installments', 'projected', v_decl = 0,
    'total_months', public._flat_total_months(), 'monthly_price', v_monthly,
    'first_payment_date', v_first, 'full_by', v_last,
    'paid_months', floor(v_pv / nullif(v_monthly, 0)), 'declared_months', floor(v_decl / nullif(v_monthly, 0)),
    'remaining_months', ceil(v_balance / nullif(v_monthly, 0)),
    'min_months', ceil(v_min / nullif(v_monthly, 0)), 'min_amount', v_min, 'rows', v_rows,
    'annual_commitment', v_annual, 'paid_amount', v_pv, 'pending_amount', v_pend, 'declared_amount', v_decl,
    'balance', v_balance, 'credit', v_credit, 'overdue_amount', v_overdue, 'pay_now', v_pay_now,
    'next_due_date', v_next_due, 'next_installment_amount', v_next_amt, 'installments_remaining', v_left,
    'last_due_date', v_last, 'grace_days', v_grace, 'phase', v_phase, 'suspended', v_phase in ('unpaid','overdue'),
    'annual_mode', v_annual_mode);
end $$;
revoke all on function public._flat_installments_view(public.school_offer_subscriptions) from public, anon, authenticated;

-- Règle de blocage : cumul des échéances dont le délai de grâce est dépassé <= paiements validés
create or replace function public._flat_standing_at(_school_id uuid, _today date)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_sub public.school_offer_subscriptions;
  v_cfg jsonb := public.platform_setting('billing.flat', '{"due_day":5,"grace_days":15,"expiry_grace_days":30}'::jsonb);
  v_due_day int := greatest(1, least(28, coalesce((v_cfg->>'due_day')::int, 5)));
  v_grace int := greatest(0, coalesce((v_cfg->>'grace_days')::int, 15));
  v_exp_grace int := greatest(0, coalesce((v_cfg->>'expiry_grace_days')::int, 30));
  v_full_by date := public._flat_full_by(); v_total int := public._flat_total_months();
  v_start date; m date; v_due date; v_paid int; k int; v_first timestamptz; v_first_d date;
  v_pv numeric; v_req numeric;
begin
  v_sub := public._school_flat_sub(_school_id);
  if v_sub.id is null then return false; end if;
  if v_sub.valid_until is not null and _today > v_sub.valid_until + v_exp_grace then return false; end if;
  if exists (select 1 from public.school_flat_payments p where p.school_id = _school_id and p.academic_year = v_sub.academic_year
             and p.period_type = 'annual' and p.status = 'VALIDATED') then return true; end if;
  if not exists (select 1 from public.school_flat_payments p where p.school_id = _school_id and p.academic_year = v_sub.academic_year and p.status = 'VALIDATED') then
    return false;
  end if;

  if public._flat_uses_installments(v_sub) then
    select coalesce(sum(p.amount), 0) into v_pv from public.school_flat_payments p
     where p.school_id = _school_id and p.academic_year = v_sub.academic_year and p.period_type = 'monthly' and p.status = 'VALIDATED';
    select coalesce(sum(i.amount_due), 0) into v_req from public.school_flat_installments i
     where i.subscription_id = v_sub.id and i.status <> 'cancelled' and i.due_date + v_grace < _today;
    return v_pv >= v_req;
  end if;

  if public._flat_is_progressive(v_sub) then
    v_first := public._flat_first_declared(_school_id, v_sub.academic_year);
    if v_first is null then return false; end if;
    v_first_d := (v_first at time zone 'Africa/Conakry')::date;
    v_start := date_trunc('month', v_first_d)::date;
    select coalesce(sum(p.months_covered), 0) into v_paid from public.school_flat_payments p
     where p.school_id = _school_id and p.academic_year = v_sub.academic_year and p.period_type = 'monthly' and p.status = 'VALIDATED';
    k := 0;
    for m in select generate_series(v_start, date_trunc('month', _today)::date, interval '1 month')::date loop
      k := k + 1;
      v_due := greatest(m + (v_due_day - 1), (v_first_d + make_interval(months => k - 1))::date);
      if _today > v_due + v_grace and v_paid < public._flat_required_months(k) then return false; end if;
    end loop;
    if v_full_by is not null and _today > v_full_by + v_grace and v_paid < v_total then return false; end if;
    return true;
  end if;

  v_start := date_trunc('month', (v_sub.created_at at time zone 'Africa/Conakry'))::date;
  for m in select generate_series(v_start, date_trunc('month', _today)::date, interval '1 month')::date loop
    v_due := greatest(m + (v_due_day - 1), (v_sub.created_at at time zone 'Africa/Conakry')::date);
    if _today > v_due + v_grace and not exists (
      select 1 from public.school_flat_payments p where p.school_id = _school_id and p.academic_year = v_sub.academic_year
        and p.period_type = 'monthly' and p.period_month = m and p.status = 'VALIDATED') then
      return false;
    end if;
  end loop;
  return true;
end $$;

-- Écran « Mon forfait » : en mode échéancier, renvoie la vue par montants
create or replace function public.my_flat_schedule() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_school uuid := public.current_school_id();
  v_sub public.school_offer_subscriptions;
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_cfg jsonb := public.platform_setting('billing.flat', '{"due_day":5,"grace_days":15}'::jsonb);
  v_due_day int := greatest(1, least(28, coalesce((v_cfg->>'due_day')::int, 5)));
  v_grace int := greatest(0, coalesce((v_cfg->>'grace_days')::int, 15));
  v_total int := public._flat_total_months(); v_full_by date := public._flat_full_by();
  v_n int := jsonb_array_length(coalesce(public._flat_prog_cfg()->'schedule', '[1,3,5,7,9,11,12]'::jsonb));
  v_first timestamptz; v_first_d date; v_start date; v_paid int; v_credit int; v_rows jsonb := '[]'::jsonb;
  k int; v_due date; v_req int; v_min int; v_projected boolean;
begin
  if v_uid is null or v_school is null then return null; end if;
  if not (public.has_role(v_uid,'admin') or public.has_role(v_uid,'directeur') or public.has_role(v_uid,'comptable')) then return null; end if;
  v_sub := public._school_flat_sub(v_school);
  if v_sub.id is not null and public._flat_uses_installments(v_sub) then
    return public._flat_installments_view(v_sub);
  end if;
  if v_sub.id is null or not public._flat_is_progressive(v_sub) then return jsonb_build_object('progressive', false); end if;
  v_first := public._flat_first_declared(v_school, v_sub.academic_year);
  v_projected := v_first is null;
  v_first_d := coalesce((v_first at time zone 'Africa/Conakry')::date, v_today);
  v_start := date_trunc('month', v_first_d)::date;
  select coalesce(sum(months_covered), 0) into v_paid from public.school_flat_payments
   where school_id = v_school and academic_year = v_sub.academic_year and period_type = 'monthly' and status = 'VALIDATED';
  select coalesce(sum(months_covered), 0) into v_credit from public.school_flat_payments
   where school_id = v_school and academic_year = v_sub.academic_year and period_type = 'monthly' and status not in ('REJECTED','CANCELLED');
  for k in 1..greatest(v_n, 1) loop
    v_due := greatest((v_start + make_interval(months => k - 1))::date + (v_due_day - 1), (v_first_d + make_interval(months => k - 1))::date);
    v_req := case when v_full_by is not null and v_due >= v_full_by then v_total else public._flat_required_months(k) end;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'k', k, 'due_date', v_due, 'grace_end_date', v_due + v_grace, 'required_months', v_req,
      'required_amount', v_req * v_sub.monthly_price, 'met', v_paid >= v_req));
  end loop;
  v_min := case when v_credit >= v_total then 0 else public._flat_min_months(v_credit) end;
  return jsonb_build_object(
    'progressive', true, 'projected', v_projected, 'total_months', v_total, 'monthly_price', v_sub.monthly_price,
    'first_payment_date', case when v_projected then null else v_first_d end, 'full_by', v_full_by,
    'paid_months', v_paid, 'declared_months', v_credit, 'remaining_months', greatest(v_total - v_credit, 0),
    'min_months', v_min, 'min_amount', v_min * v_sub.monthly_price, 'rows', v_rows);
end $$;

-- Déclaration d'un paiement : nouveau paramètre _amount (paiement partiel / anticipé en mode échéancier)
drop function if exists public.declare_flat_payment(text, date, text, integer);
create or replace function public.declare_flat_payment(_period_type text, _period_month date, _payer_reference text, _months integer default 1, _amount numeric default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_school uuid := public.current_school_id();
  v_sub public.school_offer_subscriptions; v_amount numeric; v_month date; v_id uuid; v_ref text; v_y int; v_sms bigint;
  v_mc int := 1; v_credit int; v_total int; v_first timestamptz;
  v_inst boolean := false; v_decl numeric; v_annual numeric; v_minpay numeric;
begin
  if v_uid is null or v_school is null then raise exception 'FORBIDDEN'; end if;
  if not (public.has_role(v_uid,'admin') or public.has_role(v_uid,'directeur') or public.has_role(v_uid,'comptable')) then raise exception 'FORBIDDEN'; end if;
  v_sub := public._school_flat_sub(v_school);
  if v_sub.id is null then raise exception 'NO_FLAT_OFFER'; end if;
  if coalesce(length(trim(_payer_reference)),0) < 4 then raise exception 'REFERENCE_REQUIRED'; end if;
  if _period_type = 'annual' then
    v_month := null;
    v_amount := public.flat_offer_annual_price(v_sub.monthly_price, v_sub.free_months_annual);
    if exists (select 1 from public.school_flat_payments where school_id = v_school and academic_year = v_sub.academic_year
               and period_type = 'monthly' and status not in ('REJECTED','CANCELLED')) then raise exception 'MONTHLY_ALREADY_DECLARED'; end if;
  elsif _period_type = 'monthly' then
    if public._flat_uses_installments(v_sub) then
      perform 1 from public.school_offer_subscriptions where id = v_sub.id for update;  -- sérialise les déclarations concurrentes
      v_annual := v_sub.monthly_price * public._flat_total_months();
      select coalesce(sum(amount), 0) into v_decl from public.school_flat_payments
       where school_id = v_school and academic_year = v_sub.academic_year and period_type = 'monthly' and status not in ('REJECTED','CANCELLED');
      if v_decl >= v_annual then raise exception 'ALL_MONTHS_PAID'; end if;
      v_amount := coalesce(_amount, nullif((public._flat_installments_view(v_sub)->>'min_amount')::numeric, 0));
      if v_amount is null or v_amount <= 0 or v_amount <> trunc(v_amount) then raise exception 'AMOUNT_INVALID'; end if;
      if v_decl = 0 and v_amount < v_sub.monthly_price then raise exception 'FIRST_PAYMENT_BELOW_MONTHLY'; end if;
      v_minpay := coalesce((public._flat_inst_cfg()->>'min_payment')::numeric, 10000);
      if v_amount < least(v_minpay, v_annual - v_decl) then raise exception 'AMOUNT_BELOW_MINIMUM'; end if;
      if v_decl + v_amount > v_annual then raise exception 'AMOUNT_EXCEEDS_BALANCE'; end if;
      v_month := date_trunc('month', now() at time zone 'Africa/Conakry')::date; v_mc := 1; v_inst := true;
    elsif public._flat_is_progressive(v_sub) then
      v_total := public._flat_total_months();
      v_mc := coalesce(_months, 1);
      if v_mc < 1 then raise exception 'MONTHS_INVALID'; end if;
      select coalesce(sum(months_covered), 0), min(declared_at) into v_credit, v_first from public.school_flat_payments
       where school_id = v_school and academic_year = v_sub.academic_year and period_type = 'monthly' and status not in ('REJECTED','CANCELLED');
      if v_credit >= v_total then raise exception 'ALL_MONTHS_PAID'; end if;
      if v_credit + v_mc > v_total then raise exception 'MONTHS_TOO_MANY'; end if;
      if v_mc < public._flat_min_months(v_credit) then raise exception 'MONTHS_BELOW_MINIMUM'; end if;
      v_month := (date_trunc('month', coalesce(v_first, now()) at time zone 'Africa/Conakry')::date + make_interval(months => v_credit))::date;
      v_amount := v_sub.monthly_price * v_mc;
    else
      if _period_month is null then raise exception 'MONTH_REQUIRED'; end if;
      v_month := date_trunc('month', _period_month)::date;
      v_y := split_part(v_sub.academic_year, '-', 1)::int;
      if v_month < make_date(v_y, 9, 1) or v_month > make_date(v_y + 1, 8, 1) then raise exception 'MONTH_OUTSIDE_YEAR'; end if;
      v_amount := v_sub.monthly_price;
    end if;
    if exists (select 1 from public.school_flat_payments where school_id = v_school and academic_year = v_sub.academic_year
               and period_type = 'annual' and status not in ('REJECTED','CANCELLED')) then raise exception 'ANNUAL_ALREADY_DECLARED'; end if;
  else
    raise exception 'PERIOD_INVALID';
  end if;
  v_ref := 'FP-' || to_char(now() at time zone 'Africa/Conakry','YYYY') || '-' || lpad(nextval('public.school_flat_payment_seq')::text, 6, '0');
  begin
    insert into public.school_flat_payments(reference, school_id, subscription_id, academic_year, period_type, period_month, amount, payer_reference, declared_by, months_covered, is_installment)
    values (v_ref, v_school, v_sub.id, v_sub.academic_year, _period_type, v_month, v_amount, trim(_payer_reference), v_uid, v_mc, v_inst)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'DUPLICATE_PAYMENT';
  end;
  insert into public.school_flat_payment_events(payment_id, event, actor, details)
  values (v_id, 'DECLARED', v_uid, jsonb_build_object('amount', v_amount, 'period_type', _period_type, 'period_month', v_month, 'months', v_mc));
  begin
    insert into public.notifications(user_id, type, title, body, link)
    select sa.user_id, 'flat_payment', 'Paiement de forfait à valider', 'Référence ' || v_ref || ' — ' || v_amount::bigint || ' GNF', '/offres'
    from public.super_admins sa;
  exception when others then null;
  end;
  begin
    select id into v_sms from public.payment_sms_inbox
     where ref_norm = upper(regexp_replace(trim(_payer_reference), '[^A-Za-z0-9]', '', 'g')) and status in ('RECEIVED','AMOUNT_MISMATCH') limit 1;
    if v_sms is not null then perform public._auto_validate_flat_by_sms(v_sms); end if;
  exception when others then null;
  end;
  return v_id;
end $$;
revoke all on function public.declare_flat_payment(text, date, text, integer, numeric) from public, anon;
grant execute on function public.declare_flat_payment(text, date, text, integer, numeric) to authenticated, service_role;
revoke all on function public.my_flat_schedule() from public, anon;
grant execute on function public.my_flat_schedule() to authenticated, service_role;
