-- Forfaits établissement : activation après le premier paiement, période d'essai limitée, tolérance réduite, inscriptions bloquées en cas d'impayé.
-- Idempotent. Aucune donnée supprimée.

-- Paramètres : essai 7 jours / 10 élèves ; tolérance après échéance ramenée à 5 jours (modifiable dans Super Admin → Offres & paiements)
update public.platform_settings
   set value = jsonb_build_object('trial_days', 7, 'trial_max_students', 10) || value || jsonb_build_object('grace_days', 5)
 where key = 'billing.flat' and not (value ? 'trial_days');

create or replace function public.school_flat_in_good_standing(_school_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_sub public.school_offer_subscriptions;
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_cfg jsonb := public.platform_setting('billing.flat', '{"due_day":5,"grace_days":15,"expiry_grace_days":30}'::jsonb);
  v_due_day int := greatest(1, least(28, coalesce((v_cfg->>'due_day')::int, 5)));
  v_grace int := greatest(0, coalesce((v_cfg->>'grace_days')::int, 15));
  v_exp_grace int := greatest(0, coalesce((v_cfg->>'expiry_grace_days')::int, 30));
  v_start date; m date; v_due date;
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

-- Phase d'un établissement sous forfait : active | trial (essai, avant le 1er paiement validé) | unpaid (essai terminé sans paiement) | overdue (en retard) | none
create or replace function public.school_flat_phase(_school_id uuid)
returns text language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_sub public.school_offer_subscriptions;
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_cfg jsonb := public.platform_setting('billing.flat', '{}'::jsonb);
  v_trial int := greatest(0, coalesce((v_cfg->>'trial_days')::int, 7));
begin
  v_sub := public._school_flat_sub(_school_id);
  if v_sub.id is null then return 'none'; end if;
  if public.school_flat_in_good_standing(_school_id) then return 'active'; end if;
  if not exists (select 1 from public.school_flat_payments p where p.school_id = _school_id and p.academic_year = v_sub.academic_year and p.status = 'VALIDATED') then
    if v_today <= (v_sub.created_at at time zone 'Africa/Conakry')::date + v_trial then return 'trial'; end if;
    return 'unpaid';
  end if;
  return 'overdue';
end $function$;

create or replace function public.enforce_student_limit()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_sub public.school_offer_subscriptions; v_count integer; v_phase text; v_cap integer; v_cfg jsonb := public.platform_setting('billing.flat', '{}'::jsonb);
begin
  if NEW.school_id is null then return NEW; end if;
  if coalesce(NEW.status, 'actif') <> 'actif' then return NEW; end if;
  if TG_OP = 'UPDATE' and coalesce(OLD.status, 'actif') = 'actif' and OLD.school_id is not distinct from NEW.school_id then return NEW; end if;
  v_sub := public._school_flat_sub(NEW.school_id);
  if v_sub.id is null then return NEW; end if;
  if not public.is_super_admin(auth.uid()) then
    v_phase := public.school_flat_phase(NEW.school_id);
    if v_phase in ('unpaid','overdue') then
      raise exception 'Inscription impossible : le paiement de votre forfait est en attente ou en retard. Régularisez-le dans « Mon forfait » pour inscrire de nouveaux élèves.'
        using errcode = 'P0001', hint = 'FLAT_PAYMENT_REQUIRED';
    end if;
  end if;
  v_cap := v_sub.max_students;
  if v_phase = 'trial' then v_cap := least(coalesce(v_cap, 2147483647), coalesce((v_cfg->>'trial_max_students')::int, 10)); end if;
  if v_cap is null then return NEW; end if;
  perform pg_advisory_xact_lock(hashtext('student_limit:' || NEW.school_id::text));
  select count(*) into v_count from public.students where school_id = NEW.school_id and status = 'actif' and id is distinct from NEW.id;
  if v_count >= v_cap then
    if v_phase = 'trial' and v_cap < coalesce(v_sub.max_students, 2147483647) then
      raise exception 'Période d''essai : % élèves maximum tant que votre premier paiement n''est pas validé. Payez votre forfait dans « Mon forfait » pour inscrire davantage d''élèves.', v_cap
        using errcode = 'P0001', hint = 'FLAT_TRIAL_LIMIT';
    end if;
    raise exception 'STUDENT_LIMIT_REACHED : la capacité de votre offre % (% élèves) est atteinte. Passez à une formule supérieure pour inscrire de nouveaux élèves.', v_sub.offer_name, v_sub.max_students
      using errcode = 'P0001', hint = 'STUDENT_LIMIT_REACHED';
  end if;
  return NEW;
end $function$;

create or replace function public.my_flat_offer_status()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_school uuid := public.current_school_id(); v_sub public.school_offer_subscriptions; v_old public.school_offer_subscriptions;
  v_count integer; v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_cfg jsonb := public.platform_setting('billing.flat', '{"due_day":5,"grace_days":15,"expiry_grace_days":30}'::jsonb);
  v_due_day int := greatest(1, least(28, coalesce((v_cfg->>'due_day')::int, 5)));
  v_grace int := greatest(0, coalesce((v_cfg->>'grace_days')::int, 15));
  v_created date; m date; v_due date; v_next_month date; v_next_due date; v_standing boolean;
  v_annual boolean; v_validated int; v_pending int; v_pstatus text;
  v_methods jsonb; v_phase text; v_trial int := greatest(0, coalesce((v_cfg->>'trial_days')::int, 7)); v_trial_end date;
begin
  if auth.uid() is null or v_school is null then return null; end if;
  select count(*) into v_count from public.students where school_id = v_school and status = 'actif';
  v_sub := public._school_flat_sub(v_school);
  if v_sub.id is null then
    select s.* into v_old from public.school_offer_subscriptions s
      where s.school_id = v_school and s.offer_type = 'per_school' and s.academic_year <> public.school_academic_year(v_school)
      order by s.created_at desc limit 1;
    if v_old.id is null or (public._school_current_subscription(v_school)).id is not null then return null; end if;
    return jsonb_build_object('expired', true, 'payment_status', 'expired', 'offer_code', v_old.offer_code, 'offer_name', v_old.offer_name, 'academic_year', v_old.academic_year,
      'valid_until', v_old.valid_until, 'days_left', (v_old.valid_until - v_today), 'students_count', v_count,
      'monthly_price', v_old.monthly_price, 'free_months', v_old.free_months_annual, 'annual_price', public.flat_offer_annual_price(v_old.monthly_price, v_old.free_months_annual),
      'min_students', v_old.min_students, 'max_students', v_old.max_students, 'over_tranche', false,
      'in_good_standing', false, 'paid_months', '[]'::jsonb, 'annual_paid', false, 'pending_count', 0);
  end if;
  v_standing := public.school_flat_in_good_standing(v_school);
  v_phase := public.school_flat_phase(v_school);
  v_created := (v_sub.created_at at time zone 'Africa/Conakry')::date;
  select exists (select 1 from public.school_flat_payments p where p.school_id = v_school and p.academic_year = v_sub.academic_year and p.period_type = 'annual' and p.status = 'VALIDATED') into v_annual;
  select count(*) into v_validated from public.school_flat_payments p where p.school_id = v_school and p.academic_year = v_sub.academic_year and p.status = 'VALIDATED';
  select count(*) into v_pending from public.school_flat_payments p where p.school_id = v_school and p.status = 'PENDING';
  -- prochaine échéance : premier mois (depuis la souscription) sans paiement validé
  if not v_annual then
    for m in select generate_series(date_trunc('month', v_created)::date, make_date(split_part(v_sub.academic_year,'-',2)::int, 8, 1), interval '1 month')::date loop
      if not exists (select 1 from public.school_flat_payments p where p.school_id = v_school and p.academic_year = v_sub.academic_year
                     and p.period_type = 'monthly' and p.period_month = m and p.status = 'VALIDATED') then
        v_next_month := m; v_next_due := greatest(m + (v_due_day - 1), v_created); exit;
      end if;
    end loop;
  end if;
  v_pstatus := case
    when v_annual then 'active'
    when v_validated = 0 and v_pending > 0 then 'under_review'
    when v_validated = 0 and v_phase = 'unpaid' then 'unpaid'
    when v_validated = 0 then 'pending_payment'
    when not v_standing then 'overdue'
    else 'active' end;
  v_trial_end := (v_sub.created_at at time zone 'Africa/Conakry')::date + v_trial;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_methods
    from jsonb_array_elements(public.platform_setting('payment.methods', '[]'::jsonb)) e where coalesce((e->>'enabled')::boolean, false);
  return jsonb_build_object(
    'expired', false, 'payment_status', v_pstatus, 'phase', v_phase,
    'trial_end_date', v_trial_end, 'trial_days_left', (v_trial_end - v_today), 'trial_max_students', coalesce((v_cfg->>'trial_max_students')::int, 10),
    'offer_code', v_sub.offer_code, 'offer_name', v_sub.offer_name, 'academic_year', v_sub.academic_year,
    'subscribed_at', v_sub.created_at,
    'monthly_price', v_sub.monthly_price, 'free_months', v_sub.free_months_annual,
    'annual_price', public.flat_offer_annual_price(v_sub.monthly_price, v_sub.free_months_annual),
    'min_students', v_sub.min_students, 'max_students', v_sub.max_students,
    'remaining_capacity', case when v_sub.max_students is null then null else greatest(v_sub.max_students - v_count, 0) end,
    'students_count', v_count, 'over_tranche', (v_sub.max_students is not null and v_count > v_sub.max_students),
    'valid_until', v_sub.valid_until, 'days_left', (v_sub.valid_until - v_today),
    'in_good_standing', v_standing,
    'next_due_month', v_next_month, 'next_due_date', v_next_due,
    'grace_end_date', case when v_next_due is null then null else v_next_due + v_grace end,
    'grace_days_left', case when v_next_due is null then null else (v_next_due + v_grace - v_today) end,
    'paid_months', (select coalesce(jsonb_agg(to_char(p.period_month,'YYYY-MM') order by p.period_month), '[]'::jsonb)
                    from public.school_flat_payments p where p.school_id = v_school and p.academic_year = v_sub.academic_year
                      and p.period_type = 'monthly' and p.status = 'VALIDATED'),
    'annual_paid', v_annual, 'pending_count', v_pending,
    'payment_methods', v_methods);
end $function$;
grant execute on function public.my_flat_offer_status() to authenticated;
grant execute on function public.school_flat_phase(uuid) to authenticated;
