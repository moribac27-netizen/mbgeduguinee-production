-- Paiement mensuel progressif par établissement :
--  * le calendrier part du PREMIER paiement mensuel de l'école (et non de sa date de souscription) ;
--  * premier paiement = 1 mois, puis 2 mois à chaque échéance (calendrier cumulé 1,3,5,7,9,11,12) jusqu'aux 12 mois ;
--  * les 12 mois doivent être entièrement payés avant la date limite « full_by » (début des vacances) : au-delà, le minimum à payer est
--    augmenté pour rattraper (école qui commence tard) ;
--  * la règle s'applique à toutes les écoles au forfait, quelle que soit leur date de souscription.

-- 1) Réglage (modifiable par la plateforme, historique conservé)
update public.platform_settings
   set value = jsonb_build_object(
         'enabled', true,
         'from', '2020-01-01T00:00:00+00:00',
         'schedule', '[1,3,5,7,9,11,12]'::jsonb,
         'total_months', 12,
         'full_by', '2027-06-30'),
       updated_at = now()
 where key = 'billing.flat_progressive';

-- 2) Outils internes
create or replace function public._flat_full_by()
returns date language sql stable security definer set search_path = public as $$
  select nullif(public._flat_prog_cfg()->>'full_by', '')::date
$$;

create or replace function public._flat_first_declared(_school_id uuid, _year text)
returns timestamptz language sql stable security definer set search_path = public as $$
  select min(declared_at) from public.school_flat_payments
   where school_id = _school_id and academic_year = _year and period_type = 'monthly'
     and status not in ('REJECTED','CANCELLED')
$$;

-- Minimum de mois à payer maintenant (calendrier + rattrapage avant la date limite)
create or replace function public._flat_min_months_at(_credit integer, _today date)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  n int := jsonb_array_length(coalesce(public._flat_prog_cfg()->'schedule', '[1,3,5,7,9,11,12]'::jsonb));
  v_total int := public._flat_total_months(); v_full_by date := public._flat_full_by();
  k int; r int; base int := null; left_p int;
begin
  for k in 1..greatest(n, 1) loop
    r := public._flat_required_months(k);
    if r > _credit then base := r - _credit; exit; end if;
  end loop;
  if base is null then base := greatest(1, v_total - _credit); end if;
  if _credit > 0 and v_full_by is not null then
    if _today > v_full_by then
      base := greatest(1, v_total - _credit);
    else
      left_p := (extract(year from v_full_by)::int * 12 + extract(month from v_full_by)::int)
              - (extract(year from _today)::int * 12 + extract(month from _today)::int) + 1;
      base := greatest(base, ceil((v_total - _credit)::numeric / greatest(left_p, 1))::int);
    end if;
  end if;
  return least(base, greatest(1, v_total - _credit));
end $$;

create or replace function public._flat_min_months(_credit integer)
returns integer language sql stable security definer set search_path = public as $$
  select public._flat_min_months_at(_credit, (now() at time zone 'Africa/Conakry')::date)
$$;

-- 3) École « en règle » à une date donnée
create or replace function public._flat_standing_at(_school_id uuid, _today date)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_sub public.school_offer_subscriptions;
  v_cfg jsonb := public.platform_setting('billing.flat', '{"due_day":5,"grace_days":15,"expiry_grace_days":30}'::jsonb);
  v_due_day int := greatest(1, least(28, coalesce((v_cfg->>'due_day')::int, 5)));
  v_grace int := greatest(0, coalesce((v_cfg->>'grace_days')::int, 15));
  v_exp_grace int := greatest(0, coalesce((v_cfg->>'expiry_grace_days')::int, 30));
  v_full_by date := public._flat_full_by(); v_total int := public._flat_total_months();
  v_start date; m date; v_due date; v_paid int; k int; v_first timestamptz; v_first_d date;
begin
  v_sub := public._school_flat_sub(_school_id);
  if v_sub.id is null then return false; end if;
  if v_sub.valid_until is not null and _today > v_sub.valid_until + v_exp_grace then return false; end if;
  if exists (select 1 from public.school_flat_payments p where p.school_id = _school_id and p.academic_year = v_sub.academic_year
             and p.period_type = 'annual' and p.status = 'VALIDATED') then return true; end if;
  if not exists (select 1 from public.school_flat_payments p where p.school_id = _school_id and p.academic_year = v_sub.academic_year and p.status = 'VALIDATED') then
    return false;
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

create or replace function public.school_flat_in_good_standing(_school_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public._flat_standing_at(_school_id, (now() at time zone 'Africa/Conakry')::date)
$$;

revoke all on function public._flat_full_by(), public._flat_first_declared(uuid, text),
  public._flat_min_months_at(integer, date), public._flat_standing_at(uuid, date) from public, anon, authenticated;

-- 4) Déclaration d'un paiement : le mois de départ suit le premier paiement de l'école
create or replace function public.declare_flat_payment(_period_type text, _period_month date, _payer_reference text, _months integer default 1)
returns uuid language plpgsql security definer set search_path = public as $function$
declare
  v_uid uuid := auth.uid(); v_school uuid := public.current_school_id();
  v_sub public.school_offer_subscriptions; v_amount numeric; v_month date; v_id uuid; v_ref text; v_y int; v_sms bigint;
  v_mc int := 1; v_credit int; v_total int; v_first timestamptz;
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
    if public._flat_is_progressive(v_sub) then
      v_total := public._flat_total_months();
      v_mc := coalesce(_months, 1);
      if v_mc < 1 then raise exception 'MONTHS_INVALID'; end if;
      select coalesce(sum(months_covered), 0), min(declared_at) into v_credit, v_first from public.school_flat_payments
       where school_id = v_school and academic_year = v_sub.academic_year and period_type = 'monthly' and status not in ('REJECTED','CANCELLED');
      if v_credit >= v_total then raise exception 'ALL_MONTHS_PAID'; end if;
      if v_credit + v_mc > v_total then raise exception 'MONTHS_TOO_MANY'; end if;
      if v_mc < public._flat_min_months(v_credit) then raise exception 'MONTHS_BELOW_MINIMUM'; end if;
      -- Le paiement couvre les mois qui suivent ceux déjà déclarés, à partir du mois du PREMIER paiement de l'école.
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
    insert into public.school_flat_payments(reference, school_id, subscription_id, academic_year, period_type, period_month, amount, payer_reference, declared_by, months_covered)
    values (v_ref, v_school, v_sub.id, v_sub.academic_year, _period_type, v_month, v_amount, trim(_payer_reference), v_uid, v_mc)
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
end $function$;

-- 5) Calendrier affiché à l'école (« Mon forfait »)
create or replace function public.my_flat_schedule()
returns jsonb language plpgsql stable security definer set search_path = public as $function$
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
end $function$;
