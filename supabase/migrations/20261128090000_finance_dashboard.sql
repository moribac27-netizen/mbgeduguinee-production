-- Tableau de bord financier (direction / comptabilité) : totaux calculés côté base.
-- Avant : le navigateur téléchargeait toutes les lignes de paiements, dépenses et élèves puis additionnait. Or l'API renvoie au maximum
-- 1000 lignes par requête : au-delà, les totaux (recettes, solde, impayés) étaient silencieusement faux.
-- Les règles sont celles de l'écran Paiements (src/lib/fees.ts) : scolarité validée de l'année en cours, remboursements déduits,
-- dû net = frais de la classe − réductions ; une dépense de remboursement n'est pas comptée deux fois.
-- SECURITY DEFINER avec contrôle explicite : réservé à admin / directeur / comptable, et uniquement les données de SON école. Lecture seule. Idempotent.
create or replace function public.finance_dashboard()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_school uuid := public.current_school_id();
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_month date := date_trunc('month', now() at time zone 'Africa/Conakry')::date;
  v_year text := public.school_academic_year(v_school);
  v_year_start_date date := (left(public.school_academic_year(v_school), 4) || '-09-01')::date;
  v_year_start timestamptz := v_year_start_date::timestamp at time zone 'Africa/Conakry';
  v_res jsonb;
begin
  if auth.uid() is null or not public.is_finance(auth.uid()) then
    raise exception 'Accès réservé à la direction et à la comptabilité.' using errcode = '42501';
  end if;

  with pay as (
    select amount, (paid_at at time zone 'Africa/Conakry')::date d, payment_type, student_id
      from public.payments where school_id = v_school and validation_status = 'validé'
  ), exp as (
    select e.amount, e.occurred_at d
      from public.expenses e
     where e.school_id = v_school and e.voided_at is null
       and not exists (select 1 from public.payment_refunds r where r.expense_id = e.id)
  ), months as (
    select (v_month - make_interval(months => n))::date m from generate_series(0, 5) n
  ), fees as (
    select s.id,
           greatest(coalesce(c.annual_fee, 0) - public._fee_adjustment_total(s.id, v_year), 0) due,
           coalesce((select sum(p.amount) from public.payments p
                      where p.student_id = s.id and p.validation_status = 'validé'
                        and lower(coalesce(p.payment_type, '')) in ('scolarite', 'scolarité') and p.paid_at >= v_year_start), 0) paid
      from public.students s join public.classes c on c.id = s.class_id
     where s.school_id = v_school and coalesce(c.annual_fee, 0) > 0
  )
  select jsonb_build_object(
    'revenue_total',   (select coalesce(sum(amount), 0) from pay),
    'revenue_month',   (select coalesce(sum(amount), 0) from pay where d >= v_month),
    'revenue_day',     (select coalesce(sum(amount), 0) from pay where d = v_today),
    'revenue_day_count', (select count(*) from pay where d = v_today),
    'revenue_year',    (select coalesce(sum(amount), 0) from pay where d >= v_year_start_date),
    'expenses_total',  (select coalesce(sum(amount), 0) from exp),
    'expenses_month',  (select coalesce(sum(amount), 0) from exp where d >= v_month),
    'tuition_due',     (select coalesce(sum(due), 0) from fees),
    'tuition_paid',    (select coalesce(sum(least(paid, due)), 0) from fees),
    'tuition_remaining', (select coalesce(sum(greatest(due - paid, 0)), 0) from fees),
    'late_count',      (select count(*) from fees where due > 0 and paid * 100 < due * 50),
    'months', (select coalesce(jsonb_agg(jsonb_build_object(
                 'month', m,
                 'revenus',  (select coalesce(sum(amount), 0) from pay where date_trunc('month', d::timestamp)::date = m),
                 'depenses', (select coalesce(sum(amount), 0) from exp where date_trunc('month', d::timestamp)::date = m)
               ) order by m), '[]'::jsonb) from months)
  ) into v_res;
  return v_res;
end $function$;
revoke execute on function public.finance_dashboard() from public, anon;
grant execute on function public.finance_dashboard() to authenticated;
