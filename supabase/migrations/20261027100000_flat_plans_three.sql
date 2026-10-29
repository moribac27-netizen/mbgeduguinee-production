-- Trois plans « par établissement » (offre exceptionnelle 2026-2027) : Basique 200 élèves, Standard 600, Premium illimité.
-- Remplace les deux offres A/B de la migration 20261018200000 (aucune école n'y était abonnée : elles sont supprimées).
-- Ajoute le plafond d'élèves en base, l'expiration par année scolaire et le suivi après expiration.
-- Les trois plans par élève, leurs commissions et leurs paiements ne sont pas modifiés.
-- À exécuter manuellement dans le SQL Editor de Supabase. Idempotent.

-- 1. Capacité : max_students vide = nombre d'élèves illimité ---------------------------------------------------------
alter table public.subscription_offers drop constraint if exists subscription_offers_school_flat_check;
alter table public.subscription_offers add constraint subscription_offers_school_flat_check check (
  offer_type = 'per_student'
  or (monthly_price is not null and monthly_price > 0
      and min_students is not null and min_students >= 0
      and (max_students is null or max_students >= min_students)
      and free_months_annual between 0 and 11
      and valid_from is not null and valid_until is not null and valid_until >= valid_from)
);
alter table public.school_offer_subscriptions add column if not exists offer_type text not null default 'per_student';

-- 2. Les trois plans (valeurs initiales, ensuite modifiables par le Super Admin) -------------------------------------------
-- Droits alignés sur les plans par élève de même nom (aucune restriction inventée) ; pas de cotisation par élève (payer_roles vide).
-- Les offres A/B sont supprimées (aucune école n'y est abonnée) ; garde-fou : arrêt si une souscription existe.
do $$
begin
  if exists (select 1 from public.school_offer_subscriptions s join public.subscription_offers o on o.id = s.offer_id where o.code in ('etablissement_a','etablissement_b')) then
    raise exception 'Des établissements sont abonnés aux offres A/B : suppression annulée.';
  end if;
  delete from public.subscription_offer_history where offer_id in (select id from public.subscription_offers where code in ('etablissement_a','etablissement_b'));
  delete from public.subscription_offers where code in ('etablissement_a','etablissement_b');
end $$;

insert into public.subscription_offers
  (code, name, sort_order, annual_price_per_student, school_commission_per_student, currency, is_active,
   parent_login_allowed, student_login_allowed, features, payer_roles,
   offer_type, min_students, max_students, monthly_price, free_months_annual, valid_from, valid_until)
values
  ('etablissement_basique',  'Basique',  10, 0, 0, 'GNF', true, false, false,
   '{"cantine":false,"infirmerie":false,"bibliotheque":false}'::jsonb, '{}', 'per_school', 0, 200,  100000, 2, date '2026-09-01', date '2027-08-31'),
  ('etablissement_standard', 'Standard', 11, 0, 0, 'GNF', true, true,  false,
   '{"cantine":true,"infirmerie":true,"bibliotheque":true}'::jsonb,  '{}', 'per_school', 0, 600,  150000, 2, date '2026-09-01', date '2027-08-31'),
  ('etablissement_premium',  'Premium',  12, 0, 0, 'GNF', true, true,  true,
   '{"cantine":true,"infirmerie":true,"bibliotheque":true}'::jsonb,  '{}', 'per_school', 0, null, 200000, 2, date '2026-09-01', date '2027-08-31')
on conflict (code) do nothing;

-- 3. Un forfait ne s'applique que pendant son année scolaire (pas de reconduction) ----------------------------------------
create or replace function public._school_flat_sub(_school_id uuid)
returns public.school_offer_subscriptions language sql stable security definer set search_path to 'public' as
$$ select s.* from public.school_offer_subscriptions s
   where s.school_id = _school_id and s.status = 'active' and s.offer_type = 'per_school'
     and s.academic_year = public.school_academic_year(_school_id)
   order by s.created_at desc limit 1 $$;

-- 4. Attribution par le Super Admin : un forfait expiré ou désactivé ne peut plus être attribué ------------------------------
create or replace function public.assign_school_offer(_school_id uuid, _offer_id uuid, _academic_year text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_offer public.subscription_offers; v_year text; v_id uuid;
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select * into v_offer from public.subscription_offers where id = _offer_id for share;
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
  if not v_offer.is_active or not public.flat_offer_available(v_offer) then raise exception 'OFFER_INACTIVE'; end if;
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

-- 5. Plafond d'élèves : refuse l'inscription qui dépasserait la capacité (les élèves déjà inscrits ne sont jamais touchés) -------
-- Élèves comptés : ceux de l'école dont le statut est « actif ».
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
      using errcode = 'P0001';
  end if;
  return NEW;
end $function$;
drop trigger if exists trg_enforce_student_limit on public.students;
create trigger trg_enforce_student_limit before insert or update of status, school_id on public.students
  for each row execute function public.enforce_student_limit();

-- 6. État du forfait (bannières, page « Mon forfait ») : illimité géré ; suivi après expiration ------------------------------
create or replace function public.my_flat_offer_status()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_school uuid := public.current_school_id(); v_sub public.school_offer_subscriptions; v_old public.school_offer_subscriptions;
  v_count integer; v_today date := (now() at time zone 'Africa/Conakry')::date;
begin
  if auth.uid() is null or v_school is null then return null; end if;
  select count(*) into v_count from public.students where school_id = v_school and status = 'actif';
  v_sub := public._school_flat_sub(v_school);
  if v_sub.id is null then
    -- Forfait d'une année passée, sans plan par élève en cours : l'établissement doit choisir un plan par élève.
    select s.* into v_old from public.school_offer_subscriptions s
      where s.school_id = v_school and s.offer_type = 'per_school' and s.academic_year <> public.school_academic_year(v_school)
      order by s.created_at desc limit 1;
    if v_old.id is null or (public._school_current_subscription(v_school)).id is not null then return null; end if;
    return jsonb_build_object('expired', true, 'offer_code', v_old.offer_code, 'offer_name', v_old.offer_name, 'academic_year', v_old.academic_year,
      'valid_until', v_old.valid_until, 'days_left', (v_old.valid_until - v_today), 'students_count', v_count,
      'monthly_price', v_old.monthly_price, 'free_months', v_old.free_months_annual, 'annual_price', public.flat_offer_annual_price(v_old.monthly_price, v_old.free_months_annual),
      'min_students', v_old.min_students, 'max_students', v_old.max_students, 'over_tranche', false,
      'in_good_standing', false, 'paid_months', '[]'::jsonb, 'annual_paid', false, 'pending_count', 0);
  end if;
  return jsonb_build_object(
    'expired', false,
    'offer_code', v_sub.offer_code, 'offer_name', v_sub.offer_name, 'academic_year', v_sub.academic_year,
    'monthly_price', v_sub.monthly_price, 'free_months', v_sub.free_months_annual,
    'annual_price', public.flat_offer_annual_price(v_sub.monthly_price, v_sub.free_months_annual),
    'min_students', v_sub.min_students, 'max_students', v_sub.max_students,
    'students_count', v_count, 'over_tranche', (v_sub.max_students is not null and v_count > v_sub.max_students),
    'valid_until', v_sub.valid_until, 'days_left', (v_sub.valid_until - v_today),
    'in_good_standing', public.school_flat_in_good_standing(v_school),
    'paid_months', (select coalesce(jsonb_agg(to_char(p.period_month,'YYYY-MM') order by p.period_month), '[]'::jsonb)
                    from public.school_flat_payments p where p.school_id = v_school and p.academic_year = v_sub.academic_year
                      and p.period_type = 'monthly' and p.status = 'VALIDATED'),
    'annual_paid', exists (select 1 from public.school_flat_payments p where p.school_id = v_school and p.academic_year = v_sub.academic_year
                           and p.period_type = 'annual' and p.status = 'VALIDATED'),
    'pending_count', (select count(*) from public.school_flat_payments p where p.school_id = v_school and p.status = 'PENDING'));
end $function$;

-- Vue d'ensemble Super Admin : inclut les forfaits dont l'année est terminée (à migrer vers un plan par élève).
drop function if exists public.flat_offers_overview();
create or replace function public.flat_offers_overview()
returns table(school_id uuid, school_name text, offer_name text, academic_year text, students_count integer, max_students integer,
              over_tranche boolean, in_good_standing boolean, validated_total numeric, pending_count integer, valid_until date,
              monthly_price numeric, to_migrate boolean)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return query
  select s.school_id, sc.name, s.offer_name, s.academic_year,
         (select count(*)::int from public.students st where st.school_id = s.school_id and st.status = 'actif'),
         s.max_students,
         (s.max_students is not null and (select count(*) from public.students st where st.school_id = s.school_id and st.status = 'actif') > s.max_students),
         public.school_flat_in_good_standing(s.school_id),
         coalesce((select sum(p.amount) from public.school_flat_payments p where p.school_id = s.school_id and p.academic_year = s.academic_year and p.status = 'VALIDATED'), 0),
         (select count(*)::int from public.school_flat_payments p where p.school_id = s.school_id and p.status = 'PENDING'),
         s.valid_until, s.monthly_price,
         -- à migrer : l'année du forfait est terminée (ou se termine dans 60 jours) et aucun plan par élève n'est en place
         (s.academic_year <> public.school_academic_year(s.school_id) or s.valid_until - (now() at time zone 'Africa/Conakry')::date <= 60)
           and (public._school_current_subscription(s.school_id)).offer_type is distinct from 'per_student'
  from public.school_offer_subscriptions s join public.schools sc on sc.id = s.school_id
  where s.offer_type = 'per_school' and s.status in ('active','superseded')
    and s.id = (select s2.id from public.school_offer_subscriptions s2 where s2.school_id = s.school_id and s2.offer_type = 'per_school' order by s2.created_at desc limit 1)
  order by sc.name;
end $function$;
grant execute on function public.flat_offers_overview() to authenticated;
