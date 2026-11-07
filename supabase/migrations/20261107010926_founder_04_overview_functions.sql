-- Module « Vue Fondateur » — migration 4 : fonctions de données (agrégats uniquement, aucune ligne de détail)
-- Retour arrière : drop function public.founder_overview(uuid, date, date), public.founder_trend(uuid, int).

create or replace function public.founder_overview(_school_id uuid, _from date default null, _to date default null)
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_from date; v_to date; v_pfrom date; v_pto date; v_whole boolean; v_n int;
  v_school public.schools; v_sub public.school_offer_subscriptions; v_cur public.school_offer_subscriptions;
  v_state text; v_susp boolean; v_phase text; v_view jsonb; v_subscription jsonb;
  v_sum jsonb; v_psum jsonb; v_trend jsonb; v_students int; v_cap int;
  v_treas_total numeric; v_treas_types jsonb; v_rec jsonb; v_staff jsonb; v_ped jsonb; v_alerts jsonb;
  v_label text; v_year_start date; v_rev numeric; v_prev_rev numeric;
  v_payroll numeric; v_pending int; v_teachers int; v_staffc int;
  v_void_n int; v_void_amt numeric; v_by_level jsonb; v_att_total int; v_att_ok int;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  if not (public.is_super_admin(auth.uid()) or public.is_founder_of(_school_id)) then raise exception 'FORBIDDEN'; end if;
  select * into v_school from public.schools where id = _school_id;
  if not found then raise exception 'SCHOOL_NOT_FOUND'; end if;

  -- Période : défaut = mois en cours (heure de Conakry), bornée à 400 jours
  v_from := coalesce(_from, date_trunc('month', v_today::timestamp)::date);
  v_to := coalesce(_to, (date_trunc('month', v_from::timestamp) + interval '1 month - 1 day')::date);
  if v_to < v_from then raise exception 'PERIOD_INVALID'; end if;
  if v_to - v_from > 400 then raise exception 'PERIOD_TOO_LONG'; end if;
  v_whole := v_from = date_trunc('month', v_from::timestamp)::date
         and v_to = (date_trunc('month', v_to::timestamp) + interval '1 month - 1 day')::date;
  if v_whole then
    v_n := (extract(year from v_to)::int * 12 + extract(month from v_to)::int) - (extract(year from v_from)::int * 12 + extract(month from v_from)::int) + 1;
    v_pfrom := (v_from - make_interval(months => v_n))::date; v_pto := v_from - 1;
  else
    v_pto := v_from - 1; v_pfrom := v_pto - (v_to - v_from);
  end if;

  -- ===== Abonnement (toujours consultable, même si l'école est suspendue) =====
  select state into v_state from public.flat_billing_state where school_id = _school_id;
  v_susp := coalesce(v_state = 'suspended', false) or v_school.status <> 'active';
  v_phase := public.school_flat_phase(_school_id);
  v_sub := public._school_flat_sub(_school_id);
  if v_sub.id is not null then
    v_subscription := jsonb_build_object('available', true, 'offer_type', v_sub.offer_type, 'offer_name', v_sub.offer_name,
      'monthly_price', v_sub.monthly_price, 'max_students', v_sub.max_students, 'valid_until', v_sub.valid_until,
      'phase', v_phase, 'suspended', v_susp, 'regular', v_phase in ('trial', 'active'));
    if public._flat_uses_installments(v_sub) then
      v_view := public._flat_installments_view(v_sub);
      v_subscription := v_subscription || jsonb_build_object('annual_commitment', v_view->'annual_commitment', 'paid_amount', v_view->'paid_amount',
        'balance', v_view->'balance', 'credit', v_view->'credit', 'overdue_amount', v_view->'overdue_amount', 'next_due_date', v_view->'next_due_date',
        'next_installment_amount', v_view->'next_installment_amount', 'installments_remaining', v_view->'installments_remaining', 'last_due_date', v_view->'last_due_date');
    end if;
  else
    v_cur := public._school_current_subscription(_school_id);
    if v_cur.id is not null then
      v_subscription := jsonb_build_object('available', true, 'offer_type', v_cur.offer_type, 'offer_name', v_cur.offer_name,
        'annual_price_per_student', v_cur.annual_price_per_student, 'suspended', v_susp,
        'note', 'Plan par élève : pas d''échéancier au forfait, solde non disponible');
    else
      v_subscription := jsonb_build_object('available', false, 'suspended', v_susp, 'reason', 'Aucune souscription pour l''année scolaire en cours');
    end if;
  end if;

  -- École suspendue : seule la partie abonnement reste consultable (aligné sur SuspensionGate)
  if v_susp then
    return jsonb_build_object('school', jsonb_build_object('id', v_school.id, 'name', v_school.name, 'status', v_school.status),
      'period', jsonb_build_object('from', v_from, 'to', v_to), 'generated_at', now(), 'timezone', 'Africa/Conakry', 'suspended', true,
      'subscription', v_subscription,
      'unavailable', jsonb_build_array(jsonb_build_object('block', 'tout sauf abonnement', 'reason', 'Établissement suspendu : seule la partie abonnement est consultable')));
  end if;

  -- ===== Finances (cœur commun avec accounting_summary : écritures annulées exclues) =====
  v_sum := public._accounting_summary_core(_school_id, v_from, v_to, null);
  v_psum := public._accounting_summary_core(_school_id, v_pfrom, v_pto, null);
  v_rev := (v_sum->>'revenue_total')::numeric; v_prev_rev := (v_psum->>'revenue_total')::numeric;
  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'revenue', coalesce(b.r, 0), 'expense', coalesce(b.e, 0),
           'result', coalesce(b.r, 0) - coalesce(b.e, 0)) order by m), '[]'::jsonb)
    into v_trend
    from generate_series(date_trunc('month', v_today::timestamp) - interval '11 months', date_trunc('month', v_today::timestamp), interval '1 month') m
    left join (select x->>'month' as mm, (x->>'revenue')::numeric r, (x->>'expense')::numeric e
                 from jsonb_array_elements(public._accounting_summary_core(_school_id,
                      (date_trunc('month', v_today::timestamp) - interval '11 months')::date,
                      (date_trunc('month', v_today::timestamp) + interval '1 month - 1 day')::date, null)->'by_month') x) b
      on b.mm = to_char(m, 'YYYY-MM');

  -- Trésorerie (soldes des comptes actifs, cœur commun avec accounting_balances)
  select coalesce(sum(balance), 0) into v_treas_total from public._accounting_balances_core(_school_id) where is_active;
  select coalesce(jsonb_object_agg(type, s), '{}'::jsonb) into v_treas_types
    from (select type, sum(balance) s from public._accounting_balances_core(_school_id) where is_active group by type) x;

  -- ===== Effectifs =====
  select count(*) into v_students from public.students where school_id = _school_id and status = 'actif';
  v_cap := v_sub.max_students;

  -- ===== Recouvrement : frais annuels de la classe - paiements de scolarité validés de l'année scolaire en cours =====
  v_label := public.current_academic_year(now());
  select min(d::date) into v_year_start from generate_series(v_today - 366, v_today, interval '1 day') d
   where public.current_academic_year(d::timestamp at time zone 'Africa/Conakry') = v_label;
  with st as (
    select s.id, s.parent_user_id, s.parent_phone, c.name as cname, c.level, coalesce(c.annual_fee, 0) as due
      from public.students s left join public.classes c on c.id = s.class_id
     where s.school_id = _school_id and s.status = 'actif'),
  paid as (
    select p.student_id, sum(p.amount) as paid from public.payments p
     where p.school_id = _school_id and p.payment_type = 'scolarite' and p.status = 'payé'
       and coalesce(p.validation_status, 'validé') = 'validé' and p.paid_at >= (v_year_start::timestamp at time zone 'Africa/Conakry')
     group by p.student_id),
  r as (
    select st.*, coalesce(paid.paid, 0) as paid_amt, greatest(st.due - coalesce(paid.paid, 0), 0) as remaining,
           coalesce(st.parent_user_id::text, nullif(st.parent_phone, ''), st.id::text) as fam
      from st left join paid on paid.student_id = st.id)
  select jsonb_build_object('available', true,
           'basis', 'frais annuels de la classe moins paiements de scolarité validés depuis le début de l''année scolaire',
           'academic_year', v_label, 'since', v_year_start,
           'fees_expected', coalesce(sum(due), 0), 'fees_collected', coalesce(sum(least(paid_amt, due)), 0),
           'amount_due', coalesce(sum(remaining), 0), 'students_late', count(*) filter (where remaining > 0),
           'families_late', count(distinct fam) filter (where remaining > 0),
           'by_class', coalesce((select jsonb_agg(jsonb_build_object('class', cname, 'level', level, 'students_late', n, 'amount_due', a) order by a desc)
                                   from (select cname, level, count(*) as n, sum(remaining) as a from r where remaining > 0 group by cname, level order by sum(remaining) desc limit 5) z), '[]'::jsonb))
    into v_rec from r;

  -- ===== Personnel (totaux uniquement, jamais de salaire individuel) =====
  select coalesce(sum(net_pay), 0), count(*) filter (where not paid) into v_payroll, v_pending from public.payslips
   where school_id = _school_id and make_date(period_year, period_month, 1) >= date_trunc('month', v_from::timestamp)::date and make_date(period_year, period_month, 1) <= v_to;
  select count(*) into v_teachers from public.teachers where school_id = _school_id;
  select count(*) into v_staffc from public.employee_contracts where school_id = _school_id and status = 'actif';
  v_staff := jsonb_build_object('payroll_total', v_payroll, 'payslips_unpaid', v_pending, 'teachers', v_teachers, 'staff_contracts_active', v_staffc);

  -- ===== Pédagogie : présences par niveau (les moyennes n'ont aucune source SQL fiable) =====
  select coalesce(jsonb_agg(jsonb_build_object('level', lvl, 'records', total, 'present', pres, 'late', ret, 'absent', abs_, 'justified', jus,
           'attendance_rate', case when total = 0 then null else round((pres + ret)::numeric * 100 / total, 1) end,
           'students', coalesce((select count(*) from public.students s2 join public.classes c2 on c2.id = s2.class_id
                                  where s2.school_id = _school_id and s2.status = 'actif' and c2.level = a.lvl), 0)) order by lvl), '[]'::jsonb),
         coalesce(sum(total), 0), coalesce(sum(pres + ret), 0)
    into v_by_level, v_att_total, v_att_ok
    from (select coalesce(c.level, 'Sans classe') as lvl, count(*) as total, count(*) filter (where sa.status = 'present') as pres,
                 count(*) filter (where sa.status = 'retard') as ret, count(*) filter (where sa.status = 'absent') as abs_,
                 count(*) filter (where sa.status = 'justifie') as jus
            from public.student_attendance sa left join public.classes c on c.id = sa.class_id
           where sa.school_id = _school_id and sa.date between v_from and v_to group by coalesce(c.level, 'Sans classe')) a;
  v_ped := jsonb_build_object('attendance_rate', case when v_att_total = 0 then null else round(v_att_ok::numeric * 100 / v_att_total, 1) end,
    'attendance_rate_definition', 'présents + retards, sur l''ensemble des présences enregistrées', 'attendance_records', v_att_total, 'by_level', v_by_level,
    'averages', jsonb_build_object('available', false, 'reason', 'Les moyennes et taux de réussite sont calculés par l''application (analytics.ts) : aucune source SQL fiable à réutiliser'),
    'success_rate', jsonb_build_object('available', false, 'reason', 'Idem moyennes'));

  -- ===== Alertes =====
  select count(*), coalesce(sum(amount), 0) into v_void_n, v_void_amt from (
    select amount from public.revenues where school_id = _school_id and voided_at is not null and (voided_at at time zone 'Africa/Conakry')::date between v_from and v_to
    union all
    select amount from public.expenses where school_id = _school_id and voided_at is not null and (voided_at at time zone 'Africa/Conakry')::date between v_from and v_to) v;
  v_alerts := jsonb_build_object('voided_entries', jsonb_build_object('count', v_void_n, 'amount', v_void_amt),
    'unusual_expenses', jsonb_build_object('available', false, 'reason', 'Aucun seuil de « dépense inhabituelle » défini'),
    'unusual_logins_exports', jsonb_build_object('available', false, 'reason', 'Le journal de connexions est écrit depuis le navigateur (non fiable)'));

  return jsonb_build_object(
    'school', jsonb_build_object('id', v_school.id, 'name', v_school.name, 'status', v_school.status),
    'period', jsonb_build_object('from', v_from, 'to', v_to, 'previous_from', v_pfrom, 'previous_to', v_pto, 'whole_months', v_whole),
    'generated_at', now(), 'timezone', 'Africa/Conakry', 'suspended', false,
    'headline', jsonb_build_object('students', v_students, 'student_cap', v_cap, 'collections', v_rev, 'collections_previous', v_prev_rev,
        'collections_variation_pct', case when v_prev_rev = 0 then null else round((v_rev - v_prev_rev) * 100 / v_prev_rev, 1) end,
        'unpaid_families', v_rec->'amount_due', 'treasury_total', v_treas_total, 'treasury_by_type', v_treas_types),
    'finance', jsonb_build_object('revenue', v_rev, 'expense', (v_sum->>'expense_total')::numeric, 'result', (v_sum->>'net')::numeric,
        'previous', jsonb_build_object('revenue', v_prev_rev, 'expense', (v_psum->>'expense_total')::numeric, 'result', (v_psum->>'net')::numeric),
        'revenue_by_category', v_sum->'revenue_by_category', 'expense_by_category', v_sum->'expense_by_category', 'months', v_trend),
    'recovery', v_rec, 'staff', v_staff, 'pedagogy', v_ped, 'subscription', v_subscription, 'alerts', v_alerts,
    'unavailable', jsonb_build_array(
        jsonb_build_object('block', 'pedagogy.averages', 'reason', 'Aucune source SQL pour les moyennes (calculées dans analytics.ts)'),
        jsonb_build_object('block', 'headline.treasury_variation', 'reason', 'Pas d''historique daté des soldes'),
        jsonb_build_object('block', 'alerts.unusual_expenses', 'reason', 'Aucun seuil défini'),
        jsonb_build_object('block', 'alerts.unusual_logins_exports', 'reason', 'Source non fiable')));
end $$;

create or replace function public.founder_trend(_school_id uuid, _months int default 12) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare v_today date := (now() at time zone 'Africa/Conakry')::date; v_n int := least(greatest(coalesce(_months, 12), 1), 24); v_res jsonb;
begin
  if auth.uid() is null then raise exception 'FORBIDDEN'; end if;
  if not (public.is_super_admin(auth.uid()) or public.is_founder_of(_school_id)) then raise exception 'FORBIDDEN'; end if;
  if exists (select 1 from public.flat_billing_state where school_id = _school_id and state = 'suspended')
     or exists (select 1 from public.schools where id = _school_id and status <> 'active') then
    return jsonb_build_object('suspended', true, 'months', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'revenue', coalesce(b.r, 0), 'expense', coalesce(b.e, 0),
           'result', coalesce(b.r, 0) - coalesce(b.e, 0)) order by m), '[]'::jsonb)
    into v_res
    from generate_series(date_trunc('month', v_today::timestamp) - make_interval(months => v_n - 1), date_trunc('month', v_today::timestamp), interval '1 month') m
    left join (select x->>'month' as mm, (x->>'revenue')::numeric r, (x->>'expense')::numeric e
                 from jsonb_array_elements(public._accounting_summary_core(_school_id,
                      (date_trunc('month', v_today::timestamp) - make_interval(months => v_n - 1))::date,
                      (date_trunc('month', v_today::timestamp) + interval '1 month - 1 day')::date, null)->'by_month') x) b
      on b.mm = to_char(m, 'YYYY-MM');
  return jsonb_build_object('suspended', false, 'months', v_res);
end $$;

revoke all on function public.founder_overview(uuid, date, date), public.founder_trend(uuid, int) from public, anon;
grant execute on function public.founder_overview(uuid, date, date), public.founder_trend(uuid, int) to authenticated, service_role;
