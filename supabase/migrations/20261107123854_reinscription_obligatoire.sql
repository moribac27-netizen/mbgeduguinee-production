-- Réinscription obligatoire chaque année (décision du 7 nov. 2026) — SQL 41
-- Rappels à J-30 (31 mai), J-7 et jour J avant la fin de l'année de facturation (30 juin) ; réinscription = nouvelle souscription pour l'année suivante,
-- possible seulement si le solde de l'année précédente est à zéro (PREVIOUS_YEAR_UNPAID sinon).
-- Une école qui avait déjà payé l'année précédente n'est plus plafonnée par la limite de l'essai (10 élèves).
-- Retour arrière : drop function public.my_flat_renewal_status(), public.renew_flat_offer(text), public.run_flat_renewal_reminders(date);
--   select cron.unschedule('flat-renewal-reminders'); puis recréer enforce_student_limit sans la condition « previously_paid ».

-- 1) Pas de plafond d'essai pour une école qui se réinscrit (elle a déjà payé une année précédente)
do $$
declare d text; n text;
begin
  select pg_get_functiondef('public.enforce_student_limit()'::regprocedure) into d;
  if d like '%previously_paid%' then return; end if;
  n := replace(d, 'if v_phase = ''trial'' then v_cap :=',
    'if v_phase = ''trial'' and not exists (select 1 from public.school_flat_payments p where p.school_id = NEW.school_id and p.status = ''VALIDATED'' and p.academic_year <> v_sub.academic_year /* previously_paid */) then v_cap :=');
  if n = d then raise exception 'PATCH_NOT_APPLIED'; end if;
  execute n;
end $$;

-- 2) État de la réinscription pour mon établissement (lecture)
create or replace function public.my_flat_renewal_status() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_school uuid := public.current_school_id();
  v_year text := public.school_academic_year(public.current_school_id());
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_cur public.school_offer_subscriptions; v_prev public.school_offer_subscriptions;
  v_view jsonb; v_bal numeric := 0; v_over numeric := 0; v_end date; v_days int; v_state text; v_offers jsonb;
begin
  if v_uid is null or v_school is null then raise exception 'FORBIDDEN'; end if;
  if not (public.has_role(v_uid,'admin') or public.has_role(v_uid,'directeur') or public.has_role(v_uid,'comptable')) then raise exception 'FORBIDDEN'; end if;
  select * into v_cur from public.school_offer_subscriptions where school_id = v_school and offer_type = 'per_school' and status = 'active' and academic_year = v_year order by created_at desc limit 1;
  select year_end into v_end from public.flat_billing_calendar(v_today);
  v_days := v_end - v_today;
  if v_cur.id is not null then
    -- Année en cours déjà souscrite : on annonce seulement la fenêtre de réinscription (30 derniers jours)
    return jsonb_build_object('state', case when v_days <= 30 then 'upcoming' else 'not_due' end, 'academic_year', v_year,
      'year_end', v_end, 'days_left', v_days, 'offer_code', v_cur.offer_code, 'offer_name', v_cur.offer_name);
  end if;
  select * into v_prev from public.school_offer_subscriptions where school_id = v_school and offer_type = 'per_school' order by academic_year desc, created_at desc limit 1;
  if v_prev.id is null then return jsonb_build_object('state', 'none', 'academic_year', v_year); end if;
  if public._flat_uses_installments(v_prev) then
    v_view := public._flat_installments_view(v_prev);
    v_bal := coalesce((v_view->>'balance')::numeric, 0); v_over := coalesce((v_view->>'overdue_amount')::numeric, 0);
  end if;
  v_state := case when v_bal > 0 or v_over > 0 then 'blocked' else 'due' end;
  select coalesce(jsonb_agg(jsonb_build_object('code', o.code, 'name', o.name, 'monthly_price', o.monthly_price, 'max_students', o.max_students) order by o.monthly_price), '[]'::jsonb)
    into v_offers from public.subscription_offers o where o.offer_type = 'per_school' and public.flat_offer_available(o);
  return jsonb_build_object('state', v_state, 'academic_year', v_year, 'previous_year', v_prev.academic_year,
    'previous_offer_code', v_prev.offer_code, 'previous_offer_name', v_prev.offer_name,
    'previous_balance', v_bal, 'previous_overdue', v_over, 'offers', v_offers);
end $$;

-- 3) Réinscription : nouvelle souscription pour l'année scolaire en cours
create or replace function public.renew_flat_offer(_offer_code text default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_school uuid := public.current_school_id();
  v_year text := public.school_academic_year(public.current_school_id());
  v_prev public.school_offer_subscriptions; v_offer public.subscription_offers; v_view jsonb; v_id uuid; v_code text;
begin
  if v_uid is null or v_school is null then raise exception 'FORBIDDEN'; end if;
  if not (public.has_role(v_uid,'admin') or public.has_role(v_uid,'directeur')) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtext('flat_renew:' || v_school::text));
  if (public._school_flat_sub(v_school)).id is not null then raise exception 'ALREADY_RENEWED'; end if;
  select * into v_prev from public.school_offer_subscriptions where school_id = v_school and offer_type = 'per_school' order by academic_year desc, created_at desc limit 1;
  if v_prev.id is null then raise exception 'NO_PREVIOUS_SUBSCRIPTION'; end if;
  if v_prev.academic_year >= v_year then raise exception 'NOT_DUE'; end if;
  if public._flat_uses_installments(v_prev) then
    v_view := public._flat_installments_view(v_prev);
    if coalesce((v_view->>'balance')::numeric, 0) > 0 or coalesce((v_view->>'overdue_amount')::numeric, 0) > 0 then raise exception 'PREVIOUS_YEAR_UNPAID'; end if;
  end if;
  v_code := lower(trim(coalesce(nullif(trim(_offer_code), ''), v_prev.offer_code)));
  select * into v_offer from public.subscription_offers where code = v_code and offer_type = 'per_school' for share;
  if not found or not v_offer.is_active then raise exception 'OFFER_INVALID'; end if;
  if not public.flat_offer_available(v_offer) then raise exception 'OFFER_EXPIRED'; end if;
  insert into public.school_offer_subscriptions(
    school_id, offer_id, academic_year, offer_code, offer_name, annual_price_per_student, school_commission_per_student,
    parent_login_allowed, student_login_allowed, features, payer_roles, source, offer_type, min_students, max_students, monthly_price, free_months_annual, valid_until)
  values (v_school, v_offer.id, v_year, v_offer.code, v_offer.name, v_offer.annual_price_per_student, v_offer.school_commission_per_student,
    v_offer.parent_login_allowed, v_offer.student_login_allowed, v_offer.features, v_offer.payer_roles, 'registration',
    v_offer.offer_type, v_offer.min_students, v_offer.max_students, v_offer.monthly_price, v_offer.free_months_annual, v_offer.valid_until)
  returning id into v_id;
  perform public._flat_notify_school(v_school, 'renewal-done-' || v_year, 'billing', 'Réinscription enregistrée',
    'Votre établissement est réinscrit pour ' || v_year || ' (formule ' || v_offer.name || '). Les échéances sont visibles dans « Mon forfait ».');
  return v_id;
end $$;

-- 4) Rappels (appelés chaque jour par pg_cron ; clés uniques => jamais deux fois le même rappel)
create or replace function public.run_flat_renewal_reminders(_today date default null) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare
  v_today date := coalesce(_today, (now() at time zone 'Africa/Conakry')::date);
  v_year text := public.current_academic_year(v_today::timestamp);
  v_end date; v_days int; r record; v_n int := 0; v_view jsonb; v_bal numeric; v_extra text; v_key text;
begin
  select year_end into v_end from public.flat_billing_calendar(v_today);
  v_days := v_end - v_today;
  -- a) Écoles réinscrites pour l'année en cours : rappel à J-30, J-7 et jour J
  if v_days in (30, 7, 0) then
    for r in select s.* from public.school_offer_subscriptions s
              where s.offer_type = 'per_school' and s.status = 'active' and s.academic_year = v_year loop
      v_bal := 0;
      if public._flat_uses_installments(r) then v_view := public._flat_installments_view(r); v_bal := coalesce((v_view->>'balance')::numeric, 0); end if;
      v_extra := case when v_bal > 0 then ' Le solde de l''année en cours (' || public._fmt_gnf(v_bal) || ') doit être réglé avant de démarrer la nouvelle année.' else ' Votre solde de l''année est à jour.' end;
      v_key := 'renewal-' || v_year || '-' || v_days;
      v_n := v_n + public._flat_notify_school(r.school_id, v_key, 'billing',
        case v_days when 0 then 'Dernier jour de l''année : réinscription obligatoire' when 7 then 'Réinscription obligatoire dans 7 jours' else 'Réinscription obligatoire : 30 jours avant la fin de l''année' end,
        'L''année de facturation se termine le ' || to_char(v_end, 'DD/MM/YYYY') || '. La réinscription est obligatoire chaque année pour continuer à utiliser MBGEduGuinée.' || v_extra);
    end loop;
  end if;
  -- b) Écoles pas encore réinscrites pour l'année en cours : relance chaque lundi
  if extract(isodow from v_today) = 1 then
    for r in select distinct on (s.school_id) s.* from public.school_offer_subscriptions s
              where s.offer_type = 'per_school' and s.status = 'active' and s.academic_year < v_year
                and not exists (select 1 from public.school_offer_subscriptions c where c.school_id = s.school_id and c.offer_type = 'per_school' and c.status = 'active' and c.academic_year = v_year)
              order by s.school_id, s.academic_year desc loop
      v_n := v_n + public._flat_notify_school(r.school_id, 'renewal-pending-' || v_year || '-' || to_char(v_today, 'IYYY-IW'), 'billing',
        'Réinscription requise pour ' || v_year,
        'Votre établissement n''est pas encore réinscrit pour ' || v_year || '. Ouvrez « Mon forfait » pour vous réinscrire (le solde de l''année précédente doit être à zéro).');
    end loop;
  end if;
  return v_n;
end $$;

revoke all on function public.my_flat_renewal_status(), public.renew_flat_offer(text), public.run_flat_renewal_reminders(date) from public, anon;
grant execute on function public.my_flat_renewal_status(), public.renew_flat_offer(text) to authenticated, service_role;
revoke execute on function public.run_flat_renewal_reminders(date) from authenticated;
grant execute on function public.run_flat_renewal_reminders(date) to service_role;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'flat-renewal-reminders') then
    perform cron.schedule('flat-renewal-reminders', '30 7 * * *', 'select public.run_flat_renewal_reminders()');
  end if;
end $$;
