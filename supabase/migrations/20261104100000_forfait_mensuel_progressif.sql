-- Paiement mensuel PROGRESSIF du forfait établissement.
-- Une école au paiement mensuel doit avoir payé ses 12 mois avant la fin de l'année, par acomptes de plus en plus gros :
-- calendrier réglable (réglage « billing.flat_progressive »), par défaut 1 mois, puis 3, 6, 9 et 12 mois cumulés payés.
--   • Un paiement peut couvrir plusieurs mois (colonne months_covered) ; son montant = mois × tarif mensuel.
--   • La règle « établissement à jour » compare les mois payés (validés) au calendrier, avec le même délai de grâce qu'avant.
--   • Seules les écoles souscrites À PARTIR DE CETTE MISE EN SERVICE sont concernées (date « from ») : les écoles déjà
--     inscrites gardent leurs conditions d'origine, leurs paiements et leur règle actuelle ne changent pas.
--   • Le paiement annuel (2 mois offerts) n'est pas touché.
-- Idempotent ; aucune donnée existante modifiée.

alter table public.school_flat_payments
  add column if not exists months_covered int not null default 1 check (months_covered between 1 and 12);

insert into public.platform_settings(key, value)
values ('billing.flat_progressive',
        jsonb_build_object('enabled', true, 'from', now(), 'total_months', 12, 'schedule', jsonb_build_array(1, 3, 6, 9, 12)))
on conflict (key) do nothing;

-- Fonctions internes -------------------------------------------------------------------------------------------
create or replace function public._flat_prog_cfg()
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select public.platform_setting('billing.flat_progressive', '{}'::jsonb)
$function$;

create or replace function public._flat_total_months()
returns int language sql stable security definer set search_path to 'public' as $function$
  select greatest(1, least(12, coalesce((public._flat_prog_cfg()->>'total_months')::int, 12)))
$function$;

create or replace function public._flat_is_progressive(_sub public.school_offer_subscriptions)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
declare c jsonb := public._flat_prog_cfg();
begin
  return _sub.id is not null
     and coalesce((c->>'enabled')::boolean, false)
     and c->>'from' is not null
     and _sub.created_at >= (c->>'from')::timestamptz;
end $function$;

-- Mois cumulés exigés à l'échéance du k-ième mois (k = 1 pour le mois de souscription).
create or replace function public._flat_required_months(_k int)
returns int language plpgsql stable security definer set search_path to 'public' as $function$
declare arr jsonb := coalesce(public._flat_prog_cfg()->'schedule', '[1,3,6,9,12]'::jsonb); n int; total int := public._flat_total_months();
begin
  if _k < 1 then return 0; end if;
  n := jsonb_array_length(arr);
  if _k > n then return total; end if;
  return least(total, greatest(0, (arr->>(_k - 1))::int));
end $function$;

-- Plus petit nombre de mois à payer maintenant : atteindre la prochaine exigence non couverte.
create or replace function public._flat_min_months(_credit int)
returns int language plpgsql stable security definer set search_path to 'public' as $function$
declare n int := jsonb_array_length(coalesce(public._flat_prog_cfg()->'schedule', '[1,3,6,9,12]'::jsonb)); k int; r int;
begin
  for k in 1..greatest(n, 1) loop
    r := public._flat_required_months(k);
    if r > _credit then return r - _credit; end if;
  end loop;
  return greatest(1, public._flat_total_months() - _credit);
end $function$;

revoke execute on function public._flat_prog_cfg() from public, anon, authenticated;
revoke execute on function public._flat_total_months() from public, anon, authenticated;
revoke execute on function public._flat_is_progressive(public.school_offer_subscriptions) from public, anon, authenticated;
revoke execute on function public._flat_required_months(int) from public, anon, authenticated;
revoke execute on function public._flat_min_months(int) from public, anon, authenticated;

-- Règle « établissement à jour » : branche progressive ajoutée, le reste est INCHANGÉ ----------------------------
create or replace function public.school_flat_in_good_standing(_school_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_sub public.school_offer_subscriptions;
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_cfg jsonb := public.platform_setting('billing.flat', '{"due_day":5,"grace_days":15,"expiry_grace_days":30}'::jsonb);
  v_due_day int := greatest(1, least(28, coalesce((v_cfg->>'due_day')::int, 5)));
  v_grace int := greatest(0, coalesce((v_cfg->>'grace_days')::int, 15));
  v_exp_grace int := greatest(0, coalesce((v_cfg->>'expiry_grace_days')::int, 30));
  v_start date; m date; v_due date; v_paid int; k int;
begin
  v_sub := public._school_flat_sub(_school_id);
  if v_sub.id is null then return false; end if;
  if v_sub.valid_until is not null and v_today > v_sub.valid_until + v_exp_grace then return false; end if;
  if exists (select 1 from public.school_flat_payments p where p.school_id = _school_id and p.academic_year = v_sub.academic_year
             and p.period_type = 'annual' and p.status = 'VALIDATED') then return true; end if;
  -- Activation après le premier paiement : sans aucun paiement validé, l'établissement n'est jamais « en règle » (la période d'essai est gérée à part).
  if not exists (select 1 from public.school_flat_payments p where p.school_id = _school_id and p.academic_year = v_sub.academic_year and p.status = 'VALIDATED') then
    return false;
  end if;
  v_start := date_trunc('month', (v_sub.created_at at time zone 'Africa/Conakry'))::date;

  if public._flat_is_progressive(v_sub) then
    select coalesce(sum(p.months_covered), 0) into v_paid from public.school_flat_payments p
     where p.school_id = _school_id and p.academic_year = v_sub.academic_year and p.period_type = 'monthly' and p.status = 'VALIDATED';
    k := 0;
    for m in select generate_series(v_start, date_trunc('month', v_today)::date, interval '1 month')::date loop
      k := k + 1;
      v_due := greatest(m + (v_due_day - 1), (v_sub.created_at at time zone 'Africa/Conakry')::date);
      if v_today > v_due + v_grace and v_paid < public._flat_required_months(k) then return false; end if;
    end loop;
    return true;
  end if;

  for m in select generate_series(v_start, date_trunc('month', v_today)::date, interval '1 month')::date loop
    v_due := greatest(m + (v_due_day - 1), (v_sub.created_at at time zone 'Africa/Conakry')::date);
    if v_today > v_due + v_grace and not exists (
      select 1 from public.school_flat_payments p where p.school_id = _school_id and p.academic_year = v_sub.academic_year
        and p.period_type = 'monthly' and p.period_month = m and p.status = 'VALIDATED') then
      return false;
    end if;
  end loop;
  return true;
end $function$;

-- Déclaration d'un paiement : nombre de mois (par défaut 1) ; en mode progressif le minimum est imposé -------------
drop function if exists public.declare_flat_payment(text, date, text);
create or replace function public.declare_flat_payment(_period_type text, _period_month date, _payer_reference text, _months int default 1)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid(); v_school uuid := public.current_school_id();
  v_sub public.school_offer_subscriptions; v_amount numeric; v_month date; v_id uuid; v_ref text; v_y int; v_sms bigint;
  v_mc int := 1; v_credit int; v_total int;
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
      select coalesce(sum(months_covered), 0) into v_credit from public.school_flat_payments
       where school_id = v_school and academic_year = v_sub.academic_year and period_type = 'monthly' and status not in ('REJECTED','CANCELLED');
      if v_credit >= v_total then raise exception 'ALL_MONTHS_PAID'; end if;
      if v_credit + v_mc > v_total then raise exception 'MONTHS_TOO_MANY'; end if;
      if v_mc < public._flat_min_months(v_credit) then raise exception 'MONTHS_BELOW_MINIMUM'; end if;
      -- Le paiement couvre les mois qui suivent ceux déjà déclarés, à partir du mois de souscription.
      v_month := (date_trunc('month', (v_sub.created_at at time zone 'Africa/Conakry'))::date + make_interval(months => v_credit))::date;
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
revoke execute on function public.declare_flat_payment(text, date, text, int) from public, anon;
grant execute on function public.declare_flat_payment(text, date, text, int) to authenticated;

-- Calendrier et minimum à payer, pour l'écran « Mon forfait » ----------------------------------------------------
create or replace function public.my_flat_schedule()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid(); v_school uuid := public.current_school_id();
  v_sub public.school_offer_subscriptions;
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_cfg jsonb := public.platform_setting('billing.flat', '{"due_day":5,"grace_days":15}'::jsonb);
  v_due_day int := greatest(1, least(28, coalesce((v_cfg->>'due_day')::int, 5)));
  v_grace int := greatest(0, coalesce((v_cfg->>'grace_days')::int, 15));
  v_total int := public._flat_total_months();
  v_n int := jsonb_array_length(coalesce(public._flat_prog_cfg()->'schedule', '[1,3,6,9,12]'::jsonb));
  v_start date; v_created date; v_paid int; v_credit int; v_rows jsonb := '[]'::jsonb;
  k int; v_due date; v_req int; v_min int;
begin
  if v_uid is null or v_school is null then return null; end if;
  if not (public.has_role(v_uid,'admin') or public.has_role(v_uid,'directeur') or public.has_role(v_uid,'comptable')) then return null; end if;
  v_sub := public._school_flat_sub(v_school);
  if v_sub.id is null or not public._flat_is_progressive(v_sub) then return jsonb_build_object('progressive', false); end if;
  v_created := (v_sub.created_at at time zone 'Africa/Conakry')::date;
  v_start := date_trunc('month', v_created)::date;
  select coalesce(sum(months_covered), 0) into v_paid from public.school_flat_payments
   where school_id = v_school and academic_year = v_sub.academic_year and period_type = 'monthly' and status = 'VALIDATED';
  select coalesce(sum(months_covered), 0) into v_credit from public.school_flat_payments
   where school_id = v_school and academic_year = v_sub.academic_year and period_type = 'monthly' and status not in ('REJECTED','CANCELLED');
  for k in 1..greatest(v_n, 1) loop
    v_due := greatest((v_start + make_interval(months => k - 1))::date + (v_due_day - 1), v_created);
    v_req := public._flat_required_months(k);
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'k', k, 'due_date', v_due, 'grace_end_date', v_due + v_grace, 'required_months', v_req,
      'required_amount', v_req * v_sub.monthly_price, 'met', v_paid >= v_req));
  end loop;
  v_min := case when v_credit >= v_total then 0 else public._flat_min_months(v_credit) end;
  return jsonb_build_object(
    'progressive', true, 'total_months', v_total, 'monthly_price', v_sub.monthly_price,
    'paid_months', v_paid, 'declared_months', v_credit, 'remaining_months', greatest(v_total - v_credit, 0),
    'min_months', v_min, 'min_amount', v_min * v_sub.monthly_price, 'rows', v_rows);
end $function$;
revoke execute on function public.my_flat_schedule() from public, anon;
grant execute on function public.my_flat_schedule() to authenticated;
