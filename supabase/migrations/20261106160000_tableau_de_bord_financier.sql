-- Étape 4 de la mission : tableau de bord financier du Super Admin (lecture seule). Aucune donnée modifiée.
create or replace function public._flat_current_subs()
returns table(school_id uuid, school_name text, offer_name text, sub_id uuid)
language sql stable security definer set search_path to 'public' as $$
  select s.school_id, sc.name, s.offer_name, s.id
    from public.school_offer_subscriptions s join public.schools sc on sc.id = s.school_id
   where s.offer_type = 'per_school' and s.status in ('active','superseded')
     and s.id = (select s2.id from public.school_offer_subscriptions s2 where s2.school_id = s.school_id and s2.offer_type = 'per_school' order by s2.created_at desc limit 1)
$$;
revoke execute on function public._flat_current_subs() from public, anon, authenticated;

create or replace function public.flat_financial_dashboard()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  tz constant text := 'Africa/Conakry';
  today date := (now() at time zone 'Africa/Conakry')::date;
  v_schools jsonb; v_series jsonb; v_offers jsonb; v_kpi jsonb;
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'school_id', f.school_id, 'school_name', f.school_name, 'offer_name', f.offer_name,
      'phase', public.school_flat_phase(f.school_id)::text,
      'mode', coalesce((select p.period_type from public.school_flat_payments p where p.school_id = f.school_id and p.status in ('PENDING','VALIDATED') order by p.declared_at desc limit 1), 'aucun'),
      'paid', coalesce((select sum(p.amount) from public.school_flat_payments p where p.school_id = f.school_id and p.status = 'VALIDATED'), 0),
      'balance', coalesce((select sum(greatest(i.amount_due - i.amount_paid, 0)) from public.school_flat_installments i where i.subscription_id = f.sub_id and i.status in ('pending','partial','overdue')), 0),
      'overdue', coalesce((select sum(greatest(i.amount_due - i.amount_paid, 0)) from public.school_flat_installments i where i.subscription_id = f.sub_id and i.status = 'overdue'), 0),
      'next_due', (select min(i.due_date) from public.school_flat_installments i where i.subscription_id = f.sub_id and i.status in ('pending','partial','overdue'))
    ) order by f.school_name), '[]'::jsonb)
    into v_schools from public._flat_current_subs() f;

  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
      'amount', coalesce((select sum(p.amount) from public.school_flat_payments p
                           where p.status = 'VALIDATED' and date_trunc('month', p.reviewed_at at time zone tz) = m), 0)) order by m), '[]'::jsonb)
    into v_series from generate_series(date_trunc('month', today::timestamp) - interval '11 months', date_trunc('month', today::timestamp), interval '1 month') m;

  select coalesce(jsonb_agg(jsonb_build_object('offer_name', x.offer_name, 'schools', x.n, 'collected', x.c) order by x.offer_name), '[]'::jsonb)
    into v_offers from (
      select f.offer_name, count(*) n,
             coalesce(sum((select sum(p.amount) from public.school_flat_payments p where p.school_id = f.school_id and p.status = 'VALIDATED')), 0) c
        from public._flat_current_subs() f group by f.offer_name) x;

  select jsonb_build_object(
    'today',  coalesce(sum(amount) filter (where (reviewed_at at time zone tz)::date = today), 0),
    'week',   coalesce(sum(amount) filter (where (reviewed_at at time zone tz)::date >= date_trunc('week', today::timestamp)::date), 0),
    'month',  coalesce(sum(amount) filter (where (reviewed_at at time zone tz)::date >= date_trunc('month', today::timestamp)::date), 0),
    'year',   coalesce(sum(amount) filter (where (reviewed_at at time zone tz)::date >= date_trunc('year', today::timestamp)::date), 0),
    'total',  coalesce(sum(amount), 0),
    'pending_count', (select count(*) from public.school_flat_payments where status = 'PENDING')
  ) into v_kpi from public.school_flat_payments where status = 'VALIDATED';

  return jsonb_build_object('generated_at', now(), 'kpi', v_kpi, 'schools', v_schools, 'series', v_series, 'offers', v_offers);
end $function$;
revoke execute on function public.flat_financial_dashboard() from public, anon;
grant execute on function public.flat_financial_dashboard() to authenticated;
