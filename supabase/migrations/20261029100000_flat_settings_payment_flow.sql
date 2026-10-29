-- Plans par établissement — paramètres administrables, flux d'abonnement/paiement, annulation, choix d'un plan par élève après expiration.
-- Idempotent. Ne touche à aucune donnée existante (aucune suppression).

-- 1. Paramètres de la plateforme (source unique modifiable par le Super Admin) ------------------------------------------
create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create table if not exists public.platform_settings_history (
  id bigint generated always as identity primary key,
  key text not null,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
alter table public.platform_settings_history enable row level security;

drop policy if exists ps_public_read on public.platform_settings;
create policy ps_public_read on public.platform_settings for select to anon, authenticated using (key like 'public.%');
drop policy if exists ps_auth_read on public.platform_settings;
create policy ps_auth_read on public.platform_settings for select to authenticated using (key like 'payment.%' or key like 'billing.%');
drop policy if exists ps_super_all on public.platform_settings;
create policy ps_super_all on public.platform_settings for all to authenticated
  using (public.is_super_admin(auth.uid())) with check (public.is_super_admin(auth.uid()));
drop policy if exists psh_super_read on public.platform_settings_history;
create policy psh_super_read on public.platform_settings_history for select to authenticated using (public.is_super_admin(auth.uid()));
revoke insert, update, delete on public.platform_settings_history from anon, authenticated;

create or replace function public.platform_settings_log()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if TG_OP = 'INSERT' then
    insert into public.platform_settings_history(key, old_value, new_value, changed_by) values (NEW.key, null, NEW.value, auth.uid());
  elsif TG_OP = 'UPDATE' and NEW.value is distinct from OLD.value then
    insert into public.platform_settings_history(key, old_value, new_value, changed_by) values (NEW.key, OLD.value, NEW.value, auth.uid());
    NEW.updated_by := auth.uid(); NEW.updated_at := now();
  end if;
  return NEW;
end $function$;
drop trigger if exists trg_platform_settings_log on public.platform_settings;
create trigger trg_platform_settings_log before insert or update on public.platform_settings
  for each row execute function public.platform_settings_log();

create or replace function public.platform_setting(_key text, _default jsonb default null)
returns jsonb language sql stable security definer set search_path to 'public' as
$$ select coalesce((select value from public.platform_settings where key = _key), _default) $$;

insert into public.platform_settings(key, value) values
  ('public.flat_offers_texts', jsonb_build_object(
     'title', 'PLANS PAR ÉTABLISSEMENT — OFFRE EXCEPTIONNELLE POUR L''ANNÉE SCOLAIRE 2026-2027',
     'subtitle', 'Un tarif mensuel fixe pour tout votre établissement, selon sa capacité.',
     'message', 'Offre exceptionnelle valable uniquement pour l''année scolaire 2026-2027. Les tarifs et capacités peuvent être modifiés par l''administration de la plateforme ; le tarif choisi à la souscription est conservé pour l''année en cours.')),
  ('payment.methods', jsonb_build_array(jsonb_build_object(
     'code', 'orange_money', 'label', 'Orange Money Guinée', 'enabled', true,
     'number', '00224628499812', 'local', '628 49 98 12', 'holder', 'MBGEduGuinée', 'ussd', '#144#',
     'instructions', jsonb_build_array(
       'Composez #144# puis choisissez le transfert d''argent.',
       'Envoyez le montant exact au numéro indiqué.',
       'Notez la référence de la transaction reçue par SMS.',
       'Revenez sur cette page et saisissez cette référence : le paiement sera vérifié puis validé par l''administration MBGEduGuinée.'))))
  ,('billing.flat', jsonb_build_object('due_day', 5, 'grace_days', 15, 'expiry_grace_days', 30))
on conflict (key) do nothing;

-- 2. Description d'un plan (affichée sur les cartes) --------------------------------------------------------------------
alter table public.subscription_offers add column if not exists description text;

-- 3. Statut ANNULÉ pour un paiement déclaré (avant validation) ----------------------------------------------------------
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.school_flat_payments'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%PENDING%' loop
    execute format('alter table public.school_flat_payments drop constraint %I', c.conname);
  end loop;
  alter table public.school_flat_payments add constraint school_flat_payments_status_check
    check (status in ('PENDING','VALIDATED','REJECTED','CANCELLED'));
end $$;
drop index if exists public.school_flat_payments_month_uq;
drop index if exists public.school_flat_payments_year_uq;
drop index if exists public.school_flat_payments_payer_ref_uq;
create unique index school_flat_payments_month_uq on public.school_flat_payments (school_id, academic_year, period_month)
  where period_type = 'monthly' and status not in ('REJECTED','CANCELLED');
create unique index school_flat_payments_year_uq on public.school_flat_payments (school_id, academic_year)
  where period_type = 'annual' and status not in ('REJECTED','CANCELLED');
create unique index school_flat_payments_payer_ref_uq on public.school_flat_payments (lower(trim(payer_reference)))
  where status not in ('REJECTED','CANCELLED');

create or replace function public.cancel_flat_payment(_payment_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_p public.school_flat_payments; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'FORBIDDEN'; end if;
  select * into v_p from public.school_flat_payments where id = _payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if not (v_p.school_id = public.current_school_id()
          and (public.has_role(v_uid,'admin') or public.has_role(v_uid,'directeur') or public.has_role(v_uid,'comptable'))) then
    raise exception 'FORBIDDEN';
  end if;
  if v_p.status <> 'PENDING' then raise exception 'ALREADY_REVIEWED'; end if;
  update public.school_flat_payments set status = 'CANCELLED', reviewed_by = v_uid, reviewed_at = now() where id = _payment_id;
  insert into public.school_flat_payment_events(payment_id, event, actor, details) values (_payment_id, 'CANCELLED', v_uid, null);
end $function$;
revoke all on function public.cancel_flat_payment(uuid) from public, anon;
grant execute on function public.cancel_flat_payment(uuid) to authenticated;

-- declare_flat_payment : ignore les paiements annulés dans les contrôles de doublon (mêmes règles pour le reste)
create or replace function public.declare_flat_payment(_period_type text, _period_month date, _payer_reference text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid(); v_school uuid := public.current_school_id();
  v_sub public.school_offer_subscriptions; v_amount numeric; v_month date; v_id uuid; v_ref text; v_y int;
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
    if _period_month is null then raise exception 'MONTH_REQUIRED'; end if;
    v_month := date_trunc('month', _period_month)::date;
    v_y := split_part(v_sub.academic_year, '-', 1)::int;
    if v_month < make_date(v_y, 9, 1) or v_month > make_date(v_y + 1, 8, 1) then raise exception 'MONTH_OUTSIDE_YEAR'; end if;
    v_amount := v_sub.monthly_price;
    if exists (select 1 from public.school_flat_payments where school_id = v_school and academic_year = v_sub.academic_year
               and period_type = 'annual' and status not in ('REJECTED','CANCELLED')) then raise exception 'ANNUAL_ALREADY_DECLARED'; end if;
  else
    raise exception 'PERIOD_INVALID';
  end if;
  v_ref := 'FP-' || to_char(now() at time zone 'Africa/Conakry','YYYY') || '-' || lpad(nextval('public.school_flat_payment_seq')::text, 6, '0');
  begin
    insert into public.school_flat_payments(reference, school_id, subscription_id, academic_year, period_type, period_month, amount, payer_reference, declared_by)
    values (v_ref, v_school, v_sub.id, v_sub.academic_year, _period_type, v_month, v_amount, trim(_payer_reference), v_uid)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'DUPLICATE_PAYMENT';
  end;
  insert into public.school_flat_payment_events(payment_id, event, actor, details)
  values (v_id, 'DECLARED', v_uid, jsonb_build_object('amount', v_amount, 'period_type', _period_type, 'period_month', v_month));
  -- Notification (non bloquante) aux Super Admins pour validation
  begin
    insert into public.notifications(user_id, type, title, body, link)
    select sa.user_id, 'flat_payment', 'Paiement de forfait à valider', 'Référence ' || v_ref || ' — ' || v_amount::bigint || ' GNF', '/offres'
    from public.super_admins sa;
  exception when others then null;
  end;
  return v_id;
end $function$;
revoke all on function public.declare_flat_payment(text, date, text) from public, anon;
grant execute on function public.declare_flat_payment(text, date, text) to authenticated;

-- 4. Règle « en règle » : échéance et tolérance lues dans les paramètres (défauts : le 5 et 15 jours) -------------------
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

-- 5. Capacité : message propre (le code technique passe dans HINT) -------------------------------------------------------
create or replace function public.enforce_student_limit()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_sub public.school_offer_subscriptions; v_count integer;
begin
  if NEW.school_id is null then return NEW; end if;
  if coalesce(NEW.status, 'actif') <> 'actif' then return NEW; end if;
  if TG_OP = 'UPDATE' and coalesce(OLD.status, 'actif') = 'actif' and OLD.school_id is not distinct from NEW.school_id then return NEW; end if;
  v_sub := public._school_flat_sub(NEW.school_id);
  if v_sub.id is null or v_sub.max_students is null then return NEW; end if;
  perform pg_advisory_xact_lock(hashtext('student_limit:' || NEW.school_id::text));
  select count(*) into v_count from public.students where school_id = NEW.school_id and status = 'actif' and id is distinct from NEW.id;
  if v_count >= v_sub.max_students then
    raise exception 'STUDENT_LIMIT_REACHED : la capacité de votre offre % (% élèves) est atteinte. Passez à une formule supérieure pour inscrire de nouveaux élèves.', v_sub.offer_name, v_sub.max_students
      using errcode = 'P0001', hint = 'STUDENT_LIMIT_REACHED';
  end if;
  return NEW;
end $function$;

-- 6. État du forfait : statut de paiement, prochaine échéance, jours restants, moyens de paiement, textes ----------------
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
  v_methods jsonb;
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
    when v_validated = 0 then 'pending_payment'
    when not v_standing then 'overdue'
    else 'active' end;
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_methods
    from jsonb_array_elements(public.platform_setting('payment.methods', '[]'::jsonb)) e where coalesce((e->>'enabled')::boolean, false);
  return jsonb_build_object(
    'expired', false, 'payment_status', v_pstatus,
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

-- 7. Après l'expiration du forfait : l'établissement choisit lui-même un plan par élève (aucune donnée supprimée) -----------
create or replace function public.choose_school_offer(_offer_code text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid(); v_school uuid := public.current_school_id();
  v_offer public.subscription_offers; v_year text; v_id uuid;
begin
  if v_uid is null or v_school is null then raise exception 'FORBIDDEN'; end if;
  if not (public.has_role(v_uid,'admin') or public.has_role(v_uid,'directeur')) then raise exception 'FORBIDDEN'; end if;
  -- Seulement si un forfait existait et qu'aucune formule n'est en cours pour l'année scolaire
  if (public._school_flat_sub(v_school)).id is not null or (public._school_current_subscription(v_school)).id is not null then
    raise exception 'OFFER_ALREADY_SET';
  end if;
  if not exists (select 1 from public.school_offer_subscriptions where school_id = v_school and offer_type = 'per_school') then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_offer from public.subscription_offers where code = lower(trim(_offer_code)) and is_active and offer_type = 'per_student' for share;
  if not found then raise exception 'OFFER_INVALID'; end if;
  v_year := public.school_academic_year(v_school);
  insert into public.school_offer_subscriptions(
    school_id, offer_id, academic_year, offer_code, offer_name, annual_price_per_student,
    school_commission_per_student, parent_login_allowed, student_login_allowed, features, payer_roles, source,
    offer_type, min_students, max_students, monthly_price, free_months_annual, valid_until)
  values (
    v_school, v_offer.id, v_year, v_offer.code, v_offer.name, v_offer.annual_price_per_student,
    v_offer.school_commission_per_student, v_offer.parent_login_allowed, v_offer.student_login_allowed,
    v_offer.features, v_offer.payer_roles, 'registration',
    v_offer.offer_type, v_offer.min_students, v_offer.max_students, v_offer.monthly_price, v_offer.free_months_annual, v_offer.valid_until)
  returning id into v_id;
  return v_id;
end $function$;
revoke all on function public.choose_school_offer(text) from public, anon;
grant execute on function public.choose_school_offer(text) to authenticated;
