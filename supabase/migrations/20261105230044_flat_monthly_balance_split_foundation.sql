-- Socle de la facturation mensuelle « solde réparti » (aucun changement du comportement actuel)
-- Enregistrement dans le dépôt d'une migration déjà appliquée en base (version 20261105230044).

-- 1) Calendrier scolaire configurable par le Super Admin (par défaut : 1er octobre -> 30 juin)
insert into public.platform_settings(key, value)
values ('billing.school_calendar', '{"start_month": 10, "start_day": 1, "end_month": 6, "end_day": 30}'::jsonb)
on conflict (key) do nothing;

-- 2) Année scolaire de facturation pour une date donnée (inscription pendant les vacances -> année suivante)
create or replace function public.flat_billing_calendar(_at date default null)
returns table(academic_year text, year_start date, year_end date, phase text)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  cfg jsonb := coalesce(public.platform_setting('billing.school_calendar', '{}'::jsonb), '{}'::jsonb);
  sm int := coalesce((cfg->>'start_month')::int, 10);
  sd int := coalesce((cfg->>'start_day')::int, 1);
  em int := coalesce((cfg->>'end_month')::int, 6);
  ed int := coalesce((cfg->>'end_day')::int, 30);
  d  date := coalesce(_at, (now() at time zone 'Africa/Conakry')::date);
  y  int := extract(year from coalesce(_at, (now() at time zone 'Africa/Conakry')::date))::int;
  s date; e date; ph text;
begin
  if d >= make_date(y, sm, sd) then
    s := make_date(y, sm, sd); e := make_date(y + 1, em, ed); ph := 'in_year';
  elsif d <= make_date(y, em, ed) then
    s := make_date(y - 1, sm, sd); e := make_date(y, em, ed); ph := 'in_year';
  else
    s := make_date(y, sm, sd); e := make_date(y + 1, em, ed); ph := 'vacation';
  end if;
  return query select extract(year from s)::int || '-' || extract(year from e)::int, s, e, ph;
end $$;

-- 3) Fonction CENTRALE de répartition d'un solde sur les échéances restantes (commune aux 3 formules)
--    Échéances : le jour d'échéance de chaque mois, du mois suivant _from jusqu'au mois de fin d'année.
--    Arrondi en GNF entier ; l'écart d'arrondi est porté par la DERNIÈRE échéance.
--    Plus aucune échéance possible (inscription en juin) : une seule échéance = solde complet, due en fin d'année.
create or replace function public.flat_split_balance(_balance numeric, _from date, _year_end date, _due_day int default null)
returns table(seq int, due_date date, amount numeric)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  dd int := greatest(1, least(28, coalesce(_due_day, (public.platform_setting('billing.flat', '{}'::jsonb)->>'due_day')::int, 5)));
  n int; base numeric; i int;
begin
  if _balance is null or _balance <= 0 then return; end if;
  n := (extract(year from _year_end)::int * 12 + extract(month from _year_end)::int)
     - (extract(year from _from)::int * 12 + extract(month from _from)::int);
  if n <= 0 then
    return query select 1, _year_end, _balance;
    return;
  end if;
  base := round(_balance / n);
  for i in 1..n loop
    return query select i,
      ((date_trunc('month', _from::timestamp) + make_interval(months => i))::date + (dd - 1)),
      case when i = n then greatest(_balance - base * (n - 1), 0) else base end;
  end loop;
end $$;

-- 4) Simulation avant souscription : engagement annuel = 12 x tarif mensuel normal (lu dans subscription_offers)
create or replace function public.flat_simulate_monthly(_offer_code text, _enrol date default null)
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  o public.subscription_offers;
  cal record;
  enrol date := coalesce(_enrol, (now() at time zone 'Africa/Conakry')::date);
  eff date; monthly numeric; annual numeric; sched jsonb; n int; amt numeric; amt_last numeric; last_due date;
begin
  select * into o from public.subscription_offers where code = _offer_code and offer_type = 'per_school' and is_active;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  select * into cal from public.flat_billing_calendar(enrol);
  eff := greatest(enrol, cal.year_start);
  monthly := o.monthly_price;
  annual := monthly * public._flat_total_months();

  select coalesce(jsonb_agg(jsonb_build_object('seq', t.seq, 'kind', t.kind, 'due_date', t.due_date, 'amount', t.amount) order by t.seq), '[]'::jsonb),
         count(*) filter (where t.seq > 0), 
         max(t.amount) filter (where t.seq = 1),
         (array_agg(t.amount order by t.seq desc) filter (where t.seq > 0))[1],
         max(t.due_date)
    into sched, n, amt, amt_last, last_due
    from (
      select 0 as seq, 'initial'::text as kind, enrol as due_date, monthly as amount
      union all
      select s.seq, case when s.due_date = cal.year_end and not exists (select 1) then 'balance' else 'installment' end, s.due_date, s.amount
        from public.flat_split_balance(annual - monthly, eff, cal.year_end) s
    ) t;

  return jsonb_build_object(
    'offer_code', o.code, 'offer_name', o.name,
    'monthly_price', monthly, 'annual_commitment', annual,
    'enrol_date', enrol, 'service_start', eff,
    'academic_year', cal.academic_year, 'year_start', cal.year_start, 'year_end', cal.year_end, 'calendar_phase', cal.phase,
    'first_payment', monthly,
    'remaining_installments', n, 'installment_amount', amt, 'last_installment_amount', amt_last,
    'total_to_pay', annual, 'last_due_date', last_due,
    'schedule', sched);
end $$;

revoke all on function public.flat_billing_calendar(date) from public;
revoke all on function public.flat_split_balance(numeric, date, date, int) from public, anon;
revoke all on function public.flat_simulate_monthly(text, date) from public;
grant execute on function public.flat_billing_calendar(date) to anon, authenticated, service_role;
grant execute on function public.flat_split_balance(numeric, date, date, int) to authenticated, service_role;
grant execute on function public.flat_simulate_monthly(text, date) to anon, authenticated, service_role;
