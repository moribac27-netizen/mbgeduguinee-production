-- L'ancienne fonction est conservée telle quelle sous un nouveau nom (annulable : renommer à nouveau).
alter function public.my_flat_offer_status() rename to _my_flat_offer_status_base;
revoke all on function public._my_flat_offer_status_base() from public, anon, authenticated;
grant execute on function public._my_flat_offer_status_base() to service_role;

-- Nouvelle fonction publique : même contrat qu'avant + champs du calendrier progressif.
create or replace function public.my_flat_offer_status()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v jsonb := public._my_flat_offer_status_base();
  s jsonb;
  r jsonb;
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_school uuid := public.current_school_id();
  v_paid_list jsonb;
  v_due date; v_grace_end date;
begin
  if v is null or coalesce((v->>'expired')::boolean, false) then
    return v;
  end if;
  s := public.my_flat_schedule();
  if s is null or not coalesce((s->>'progressive')::boolean, false) then
    return v;
  end if;

  -- Première échéance dont le cumul de mois payés (validés) n'est pas atteint
  select e into r from jsonb_array_elements(s->'rows') e
   where not coalesce((e->>'met')::boolean, false)
   order by (e->>'k')::int limit 1;
  v_due := nullif(r->>'due_date', '')::date;
  v_grace_end := nullif(r->>'grace_end_date', '')::date;

  -- Mois réellement couverts par les paiements validés (un paiement de 2 mois couvre 2 mois)
  select coalesce(jsonb_agg(to_char(m, 'YYYY-MM') order by m), '[]'::jsonb) into v_paid_list
    from (
      select (p.period_month + make_interval(months => g))::date as m
        from public.school_flat_payments p, generate_series(0, p.months_covered - 1) g
       where p.school_id = v_school and p.academic_year = v->>'academic_year'
         and p.period_type = 'monthly' and p.status = 'VALIDATED'
    ) x;

  return v || jsonb_build_object(
    'progressive', true,
    'next_due_date', v_due,
    'next_due_month', case when v_due is null then null else date_trunc('month', v_due)::date end,
    'grace_end_date', v_grace_end,
    'grace_days_left', case when v_grace_end is null then null else v_grace_end - v_today end,
    'next_required_months', case when r is null then null else (r->>'required_months')::int end,
    'paid_months', v_paid_list,
    'paid_months_count', s->'paid_months',
    'declared_months', s->'declared_months',
    'remaining_months', s->'remaining_months',
    'min_months', s->'min_months',
    'min_amount', s->'min_amount',
    'total_months', s->'total_months',
    'full_by', s->'full_by',
    'schedule', s->'rows'
  );
end $$;

revoke all on function public.my_flat_offer_status() from public, anon;
grant execute on function public.my_flat_offer_status() to authenticated, service_role;
