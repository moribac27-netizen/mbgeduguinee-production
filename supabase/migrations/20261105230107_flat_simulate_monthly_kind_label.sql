-- Enregistrement dans le dépôt d'une migration déjà appliquée en base (version 20261105230107).
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
      select s.seq,
             case when count(*) over () = 1 and s.due_date = cal.year_end then 'balance' else 'installment' end,
             s.due_date, s.amount
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
revoke all on function public.flat_simulate_monthly(text, date) from public;
grant execute on function public.flat_simulate_monthly(text, date) to anon, authenticated, service_role;
