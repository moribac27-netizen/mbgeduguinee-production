-- Offres « par établissement » (forfait) : 2 offres temporaires, valables pour l'année académique en cours.
-- Principe : on RÉUTILISE subscription_offers et school_offer_subscriptions (nouvelles colonnes, valeurs par défaut = comportement actuel).
-- Les trois offres par élève (Basique / Standard / Premium), leurs commissions et leurs reversements ne sont pas modifiés.
-- À exécuter manuellement dans le SQL Editor de Supabase, après relecture. Idempotent (peut être rejoué).

-- 1. Colonnes de l'offre ---------------------------------------------------------------------------------------------
alter table public.subscription_offers
  add column if not exists offer_type text not null default 'per_student',
  add column if not exists min_students integer,
  add column if not exists max_students integer,
  add column if not exists monthly_price numeric,
  add column if not exists free_months_annual integer not null default 0,
  add column if not exists valid_from date,
  add column if not exists valid_until date;

alter table public.subscription_offers drop constraint if exists subscription_offers_offer_type_check;
alter table public.subscription_offers add constraint subscription_offers_offer_type_check check (offer_type in ('per_student','per_school'));
alter table public.subscription_offers drop constraint if exists subscription_offers_school_flat_check;
alter table public.subscription_offers add constraint subscription_offers_school_flat_check check (
  offer_type = 'per_student'
  or (monthly_price is not null and monthly_price > 0
      and min_students is not null and max_students is not null and min_students >= 0 and max_students >= min_students
      and free_months_annual between 0 and 11
      and valid_from is not null and valid_until is not null and valid_until >= valid_from)
);

-- Prix annuel calculé : mois facturés = 12 - mois offerts.
create or replace function public.flat_offer_annual_price(_monthly numeric, _free integer)
returns numeric language sql immutable set search_path to 'public' as
$$ select coalesce(_monthly,0) * (12 - coalesce(_free,0)) $$;

-- Instantané des conditions dans la souscription (aucune modification rétroactive).
alter table public.school_offer_subscriptions
  add column if not exists offer_type text not null default 'per_student',
  add column if not exists min_students integer,
  add column if not exists max_students integer,
  add column if not exists monthly_price numeric,
  add column if not exists free_months_annual integer not null default 0,
  add column if not exists valid_until date;

-- 2. Les deux offres (valeurs initiales, ensuite modifiables par le Super Admin) ---------------------------------------
insert into public.subscription_offers
  (code, name, sort_order, annual_price_per_student, school_commission_per_student, currency, is_active,
   parent_login_allowed, student_login_allowed, features, payer_roles,
   offer_type, min_students, max_students, monthly_price, free_months_annual, valid_from, valid_until)
values
  ('etablissement_a', 'Établissement A', 10, 0, 0, 'GNF', true, true, true,
   '{"cantine":true,"infirmerie":true,"bibliotheque":true}'::jsonb, '{}', 'per_school', 0, 600, 150000, 2, date '2026-09-01', date '2027-08-31'),
  ('etablissement_b', 'Établissement B', 11, 0, 0, 'GNF', true, true, true,
   '{"cantine":true,"infirmerie":true,"bibliotheque":true}'::jsonb, '{}', 'per_school', 601, 1000, 200000, 2, date '2026-09-01', date '2027-08-31')
on conflict (code) do nothing;

-- 3. Le trigger de propagation ne concerne que les offres par élève (les forfaits gardent leur instantané) -----------
create or replace function public.propagate_offer_change_to_subscriptions()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
DECLARE r public.school_offer_subscriptions;
BEGIN
  IF NEW.offer_type = 'per_school' THEN RETURN NEW; END IF;
  FOR r IN
    SELECT * FROM public.school_offer_subscriptions WHERE offer_id = NEW.id AND status = 'active' FOR UPDATE
  LOOP
    UPDATE public.school_offer_subscriptions SET status = 'superseded', ends_at = now() WHERE id = r.id;
    INSERT INTO public.school_offer_subscriptions(
      school_id, offer_id, academic_year, offer_code, offer_name, annual_price_per_student,
      school_commission_per_student, parent_login_allowed, student_login_allowed, features, payer_roles, source)
    VALUES (
      r.school_id, NEW.id, r.academic_year, NEW.code, NEW.name, NEW.annual_price_per_student,
      NEW.school_commission_per_student, NEW.parent_login_allowed, NEW.student_login_allowed, NEW.features, NEW.payer_roles, r.source);
  END LOOP;
  RETURN NEW;
END $function$;

-- 4. Offre disponible ? (active ET dans sa période de validité pour un forfait) ------------------------------------
create or replace function public.flat_offer_available(_o public.subscription_offers)
returns boolean language sql stable set search_path to 'public' as
$$ select _o.is_active and (_o.offer_type = 'per_student'
        or (_o.valid_from <= (now() at time zone 'Africa/Conakry')::date and _o.valid_until >= (now() at time zone 'Africa/Conakry')::date)) $$;

-- 5. Choix à la création : register_school_offer accepte aussi un forfait (même contrôles qu'avant) -----------------
create or replace function public.register_school_offer(_school_id uuid, _offer_code text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_offer public.subscription_offers;
  v_code text := lower(nullif(trim(_offer_code), ''));
  v_year text; v_id uuid; v_created timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not (auth.uid() is not null and public.is_super_admin(auth.uid())) then
    raise exception 'FORBIDDEN';
  end if;
  if v_code is null then raise exception 'OFFER_REQUIRED'; end if;
  select * into v_offer from public.subscription_offers where code = v_code and is_active for share;
  if not found or not public.flat_offer_available(v_offer) then raise exception 'OFFER_INVALID'; end if;
  select created_at into v_created from public.schools where id = _school_id for update;
  if not found then raise exception 'SCHOOL_NOT_FOUND'; end if;
  if v_created < now() - interval '1 hour' then raise exception 'SCHOOL_NOT_NEW'; end if;
  if exists (select 1 from public.school_offer_subscriptions where school_id = _school_id) then
    raise exception 'OFFER_ALREADY_SET';
  end if;
  v_year := public.school_academic_year(_school_id);
  insert into public.school_offer_subscriptions(
    school_id, offer_id, academic_year, offer_code, offer_name, annual_price_per_student,
    school_commission_per_student, parent_login_allowed, student_login_allowed, features, payer_roles, source,
    offer_type, min_students, max_students, monthly_price, free_months_annual, valid_until)
  values (
    _school_id, v_offer.id, v_year, v_offer.code, v_offer.name, v_offer.annual_price_per_student,
    v_offer.school_commission_per_student, v_offer.parent_login_allowed, v_offer.student_login_allowed,
    v_offer.features, v_offer.payer_roles, 'registration',
    v_offer.offer_type, v_offer.min_students, v_offer.max_students, v_offer.monthly_price, v_offer.free_months_annual, v_offer.valid_until)
  returning id into v_id;
  return v_id;
end $function$;

-- assign_school_offer (Super Admin) : même chose, pour qu'un forfait puisse aussi être attribué depuis son espace.
create or replace function public.assign_school_offer(_school_id uuid, _offer_id uuid, _academic_year text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_offer public.subscription_offers; v_year text; v_id uuid;
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select * into v_offer from public.subscription_offers where id = _offer_id for share;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  if not v_offer.is_active then raise exception 'OFFER_INACTIVE'; end if;
  if not exists (select 1 from public.schools where id = _school_id) then raise exception 'SCHOOL_NOT_FOUND'; end if;
  v_year := coalesce(nullif(trim(_academic_year), ''), public.school_academic_year(_school_id));
  update public.school_offer_subscriptions
     set status = 'superseded', ends_at = now()
   where school_id = _school_id and academic_year = v_year and status = 'active';
  insert into public.school_offer_subscriptions(
    school_id, offer_id, academic_year, offer_code, offer_name, annual_price_per_student,
    school_commission_per_student, parent_login_allowed, student_login_allowed, features, payer_roles,
    offer_type, min_students, max_students, monthly_price, free_months_annual, valid_until)
  values (
    _school_id, v_offer.id, v_year, v_offer.code, v_offer.name, v_offer.annual_price_per_student,
    v_offer.school_commission_per_student, v_offer.parent_login_allowed, v_offer.student_login_allowed,
    v_offer.features, v_offer.payer_roles,
    v_offer.offer_type, v_offer.min_students, v_offer.max_students, v_offer.monthly_price, v_offer.free_months_annual, v_offer.valid_until)
  returning id into v_id;
  return v_id;
end $function$;

-- 6. Paiements du forfait : déclarés par l'établissement, validés uniquement par le Super Admin ------------------------
create sequence if not exists public.school_flat_payment_seq;

create table if not exists public.school_flat_payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,                        -- référence unique générée par le système (FP-2026-000001)
  school_id uuid not null references public.schools(id) on delete cascade,
  subscription_id uuid not null references public.school_offer_subscriptions(id),
  academic_year text not null,
  period_type text not null check (period_type in ('monthly','annual')),
  period_month date,                                     -- 1er jour du mois payé (null pour l'annuel)
  amount numeric not null check (amount > 0),            -- calculé par le serveur depuis l'instantané, jamais saisi
  payer_reference text not null check (length(trim(payer_reference)) >= 4), -- référence du paiement (Orange Money, reçu…)
  status text not null default 'PENDING' check (status in ('PENDING','VALIDATED','REJECTED')),
  declared_by uuid not null,
  declared_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  check ((period_type = 'monthly' and period_month is not null) or (period_type = 'annual' and period_month is null))
);
-- Protection contre les doublons : un mois (ou l'année) ne peut être déclaré qu'une fois tant qu'il n'est pas rejeté.
create unique index if not exists school_flat_payments_month_uq on public.school_flat_payments (school_id, academic_year, period_month)
  where period_type = 'monthly' and status <> 'REJECTED';
create unique index if not exists school_flat_payments_year_uq on public.school_flat_payments (school_id, academic_year)
  where period_type = 'annual' and status <> 'REJECTED';
create unique index if not exists school_flat_payments_payer_ref_uq on public.school_flat_payments (lower(trim(payer_reference)))
  where status <> 'REJECTED';

create table if not exists public.school_flat_payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.school_flat_payments(id) on delete cascade,
  event text not null,
  actor uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

alter table public.school_flat_payments enable row level security;
alter table public.school_flat_payment_events enable row level security;

drop policy if exists sfp_read on public.school_flat_payments;
create policy sfp_read on public.school_flat_payments for select to authenticated
  using (public.is_super_admin(auth.uid())
         or (school_id = public.current_school_id()
             and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'directeur') or public.has_role(auth.uid(),'comptable'))));
drop policy if exists sfpe_read on public.school_flat_payment_events;
create policy sfpe_read on public.school_flat_payment_events for select to authenticated
  using (public.is_super_admin(auth.uid()));
-- Aucune politique d'écriture : toute écriture passe par les fonctions ci-dessous.
revoke insert, update, delete on public.school_flat_payments from anon, authenticated;
revoke insert, update, delete on public.school_flat_payment_events from anon, authenticated;

-- 7. Forfait en règle ? ------------------------------------------------------------------------------------------------
-- Règles (modifiables ici) : échéance mensuelle le 5 ; 15 jours de tolérance ; 30 jours de grâce après la fin de validité.
create or replace function public._school_flat_sub(_school_id uuid)
returns public.school_offer_subscriptions language sql stable security definer set search_path to 'public' as
$$ select s.* from public.school_offer_subscriptions s
   where s.school_id = _school_id and s.status = 'active' and s.offer_type = 'per_school'
   order by s.created_at desc limit 1 $$;

create or replace function public.school_flat_in_good_standing(_school_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_sub public.school_offer_subscriptions;
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_start date; m date; v_due date;
begin
  v_sub := public._school_flat_sub(_school_id);
  if v_sub.id is null then return false; end if;
  if v_sub.valid_until is not null and v_today > v_sub.valid_until + 30 then return false; end if;
  if exists (select 1 from public.school_flat_payments p where p.school_id = _school_id and p.academic_year = v_sub.academic_year
             and p.period_type = 'annual' and p.status = 'VALIDATED') then return true; end if;
  v_start := date_trunc('month', (v_sub.created_at at time zone 'Africa/Conakry'))::date;
  for m in select generate_series(v_start, date_trunc('month', v_today)::date, interval '1 month')::date loop
    v_due := greatest(m + 4, (v_sub.created_at at time zone 'Africa/Conakry')::date);
    if v_today > v_due + 15 and not exists (
      select 1 from public.school_flat_payments p where p.school_id = _school_id and p.academic_year = v_sub.academic_year
        and p.period_type = 'monthly' and p.period_month = m and p.status = 'VALIDATED') then
      return false;
    end if;
  end loop;
  return true;
end $function$;

-- Accès « complet » : un établissement sous forfait est complet tant que son forfait est en règle.
-- Les écoles sans forfait gardent EXACTEMENT la règle actuelle (20 cotisations validées).
create or replace function public.school_access_mode(_school_id uuid)
returns text language sql stable security definer set search_path to 'public' as $function$
  SELECT CASE
    WHEN public.is_super_admin(auth.uid()) THEN 'FULL'
    WHEN (public._school_flat_sub(_school_id)).id IS NOT NULL THEN
      CASE WHEN public.same_school(_school_id) AND public.school_flat_in_good_standing(_school_id) THEN 'FULL' ELSE 'RESTRICTED' END
    WHEN public.school_paid_students_count(_school_id) >= 20 THEN 'FULL'
    ELSE 'RESTRICTED'
  END;
$function$;


-- Résumé d'accès : le mode d'accès vient désormais de school_access_mode (forfait en règle OU 20 cotisations validées).
-- Pour un établissement sans forfait, le résultat est identique à avant (FULL si Super Admin ou >= 20 cotisations validées).
create or replace function public.school_access_summary(_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
DECLARE
  v_count integer;
  v_super boolean := public.is_super_admin(auth.uid());
BEGIN
  IF NOT (v_super OR public.same_school(_school_id)) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_count := public.school_paid_students_count(_school_id);
  RETURN jsonb_build_object(
    'school_id', _school_id,
    'academic_year', public.school_academic_year(_school_id),
    'paid_count', v_count,
    'threshold', 20,
    'access_mode', public.school_access_mode(_school_id),
    'super_admin_bypass', v_super,
    'unit_price', 50000,
    'school_share', 15000,
    'remaining', GREATEST(20 - v_count, 0)
  );
END;
$function$;

-- Élève « en règle » : sous forfait en règle, tous les élèves de l'école le sont (pas de cotisation individuelle).
create or replace function public.student_contribution_validated(_student_id uuid, _academic_year text default null)
returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
DECLARE v_school uuid;
BEGIN
  SELECT school_id INTO v_school FROM public.students WHERE id = _student_id;
  IF v_school IS NULL THEN RETURN false; END IF;
  IF NOT (public.is_super_admin(auth.uid()) OR public.same_school(v_school)
          OR public.is_parent_of_student(auth.uid(), _student_id)
          OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = _student_id AND s.student_user_id = auth.uid())) THEN
    RETURN false;
  END IF;
  IF (public._school_flat_sub(v_school)).id IS NOT NULL THEN
    RETURN public.school_flat_in_good_standing(v_school);
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.student_plan_payments p
                 WHERE p.student_id = _student_id AND p.school_id = v_school
                   AND p.academic_year = COALESCE(_academic_year, public.school_academic_year(v_school))
                   AND p.status = 'VALIDATED');
END;
$function$;

-- Pas de cotisation par élève dans un établissement sous forfait (le forfait la remplace).
create or replace function public.spp_block_when_flat()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if (public._school_flat_sub(NEW.school_id)).id is not null then
    raise exception 'FLAT_OFFER_NO_STUDENT_PAYMENT';
  end if;
  return NEW;
end $function$;
drop trigger if exists trg_spp_block_when_flat on public.student_plan_payments;
create trigger trg_spp_block_when_flat before insert on public.student_plan_payments
  for each row execute function public.spp_block_when_flat();

-- 8. Déclaration et validation ----------------------------------------------------------------------------------------
create or replace function public.declare_flat_payment(_period_type text, _period_month date, _payer_reference text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid(); v_school uuid := public.current_school_id();
  v_sub public.school_offer_subscriptions; v_amount numeric; v_month date; v_id uuid; v_ref text;
  v_y int;
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
               and period_type = 'monthly' and status <> 'REJECTED') then raise exception 'MONTHLY_ALREADY_DECLARED'; end if;
  elsif _period_type = 'monthly' then
    if _period_month is null then raise exception 'MONTH_REQUIRED'; end if;
    v_month := date_trunc('month', _period_month)::date;
    v_y := split_part(v_sub.academic_year, '-', 1)::int;
    if v_month < make_date(v_y, 9, 1) or v_month > make_date(v_y + 1, 8, 1) then raise exception 'MONTH_OUTSIDE_YEAR'; end if;
    v_amount := v_sub.monthly_price;
    if exists (select 1 from public.school_flat_payments where school_id = v_school and academic_year = v_sub.academic_year
               and period_type = 'annual' and status <> 'REJECTED') then raise exception 'ANNUAL_ALREADY_DECLARED'; end if;
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
  return v_id;
end $function$;

create or replace function public.review_flat_payment(_payment_id uuid, _approve boolean, _note text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_p public.school_flat_payments;
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select * into v_p from public.school_flat_payments where id = _payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_p.status <> 'PENDING' then raise exception 'ALREADY_REVIEWED'; end if;
  update public.school_flat_payments
     set status = case when _approve then 'VALIDATED' else 'REJECTED' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(_note),'')
   where id = _payment_id;
  insert into public.school_flat_payment_events(payment_id, event, actor, details)
  values (_payment_id, case when _approve then 'VALIDATED' else 'REJECTED' end, auth.uid(), jsonb_build_object('note', _note));
end $function$;

revoke all on function public.declare_flat_payment(text, date, text) from public, anon;
revoke all on function public.review_flat_payment(uuid, boolean, text) from public, anon;
grant execute on function public.declare_flat_payment(text, date, text) to authenticated;
grant execute on function public.review_flat_payment(uuid, boolean, text) to authenticated;

-- 9. État du forfait pour l'établissement connecté (bannières, page « Mon forfait ») --------------------------------------
create or replace function public.my_flat_offer_status()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_school uuid := public.current_school_id(); v_sub public.school_offer_subscriptions;
  v_count integer; v_today date := (now() at time zone 'Africa/Conakry')::date;
begin
  if auth.uid() is null or v_school is null then return null; end if;
  v_sub := public._school_flat_sub(v_school);
  if v_sub.id is null then return null; end if;
  select count(*) into v_count from public.students where school_id = v_school and status = 'actif';
  return jsonb_build_object(
    'offer_code', v_sub.offer_code, 'offer_name', v_sub.offer_name, 'academic_year', v_sub.academic_year,
    'monthly_price', v_sub.monthly_price, 'free_months', v_sub.free_months_annual,
    'annual_price', public.flat_offer_annual_price(v_sub.monthly_price, v_sub.free_months_annual),
    'min_students', v_sub.min_students, 'max_students', v_sub.max_students,
    'students_count', v_count, 'over_tranche', v_count > v_sub.max_students,
    'valid_until', v_sub.valid_until, 'days_left', (v_sub.valid_until - v_today),
    'in_good_standing', public.school_flat_in_good_standing(v_school),
    'paid_months', (select coalesce(jsonb_agg(to_char(p.period_month,'YYYY-MM') order by p.period_month), '[]'::jsonb)
                    from public.school_flat_payments p where p.school_id = v_school and p.academic_year = v_sub.academic_year
                      and p.period_type = 'monthly' and p.status = 'VALIDATED'),
    'annual_paid', exists (select 1 from public.school_flat_payments p where p.school_id = v_school and p.academic_year = v_sub.academic_year
                           and p.period_type = 'annual' and p.status = 'VALIDATED'),
    'pending_count', (select count(*) from public.school_flat_payments p where p.school_id = v_school and p.status = 'PENDING'));
end $function$;
grant execute on function public.my_flat_offer_status() to authenticated;

-- Vue d'ensemble pour le Super Admin : écoles sous forfait, effectif, paiements, état.
create or replace function public.flat_offers_overview()
returns table(school_id uuid, school_name text, offer_name text, academic_year text, students_count integer, max_students integer,
              over_tranche boolean, in_good_standing boolean, validated_total numeric, pending_count integer, valid_until date)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return query
  select s.school_id, sc.name, s.offer_name, s.academic_year,
         (select count(*)::int from public.students st where st.school_id = s.school_id and st.status = 'actif'),
         s.max_students,
         (select count(*) from public.students st where st.school_id = s.school_id and st.status = 'actif') > s.max_students,
         public.school_flat_in_good_standing(s.school_id),
         coalesce((select sum(p.amount) from public.school_flat_payments p where p.school_id = s.school_id and p.academic_year = s.academic_year and p.status = 'VALIDATED'), 0),
         (select count(*)::int from public.school_flat_payments p where p.school_id = s.school_id and p.status = 'PENDING'),
         s.valid_until
  from public.school_offer_subscriptions s join public.schools sc on sc.id = s.school_id
  where s.status = 'active' and s.offer_type = 'per_school'
  order by sc.name;
end $function$;
grant execute on function public.flat_offers_overview() to authenticated;
