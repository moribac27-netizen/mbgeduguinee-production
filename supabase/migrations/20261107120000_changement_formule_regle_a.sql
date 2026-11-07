-- Changement de formule en cours d'année (règle A, montée seulement) pour les écoles au forfait mensuel avec échéancier.
-- Règle A : ce qui est déjà échu reste au tarif actuel ; le reste de l'engagement annuel passe au nouveau tarif.
--   nouvel engagement = échu + (engagement actuel - échu) x nouveau tarif mensuel / ancien tarif mensuel.
-- Les paiements validés ne sont jamais modifiés. Aucune donnée existante n'est modifiée par cette migration.

-- 1) Engagement annuel propre à l'abonnement (nul = 12 x tarif mensuel, comportement actuel inchangé)
alter table public.school_offer_subscriptions add column if not exists annual_commitment numeric;
do $$ begin
  alter table public.school_offer_subscriptions add constraint sos_annual_commitment_chk check (annual_commitment is null or annual_commitment >= 0);
exception when duplicate_object then null; end $$;

-- 2) Les trois fonctions qui calculent l'engagement annuel lisent désormais annual_commitment s'il existe.
--    Patch appliqué sur la définition en place (idempotent, refuse si le texte attendu a changé).
do $$
declare d text;
begin
  d := pg_get_functiondef('public.flat_rebuild_installments(uuid,date)'::regprocedure);
  if position('annual_commitment' in d) = 0 then
    if position('annual := monthly * public._flat_total_months();' in d) = 0 then raise exception 'PATCH_TARGET_NOT_FOUND rebuild'; end if;
    execute replace(d, 'annual := monthly * public._flat_total_months();', 'annual := coalesce(sub.annual_commitment, monthly * public._flat_total_months());');
  end if;

  d := pg_get_functiondef('public._flat_installments_view(public.school_offer_subscriptions)'::regprocedure);
  if position('annual_commitment' in d) = 0 then
    if position('v_annual numeric := _sub.monthly_price * public._flat_total_months();' in d) = 0 then raise exception 'PATCH_TARGET_NOT_FOUND view'; end if;
    execute replace(d, 'v_annual numeric := _sub.monthly_price * public._flat_total_months();', 'v_annual numeric := coalesce(_sub.annual_commitment, _sub.monthly_price * public._flat_total_months());');
  end if;

  d := pg_get_functiondef('public.declare_flat_payment(text,date,text,integer,numeric)'::regprocedure);
  if position('annual_commitment' in d) = 0 then
    if position('v_annual := v_sub.monthly_price * public._flat_total_months();' in d) = 0 then raise exception 'PATCH_TARGET_NOT_FOUND declare'; end if;
    execute replace(d, 'v_annual := v_sub.monthly_price * public._flat_total_months();', 'v_annual := coalesce(v_sub.annual_commitment, v_sub.monthly_price * public._flat_total_months());');
  end if;
end $$;

-- 3) Calcul commun (aperçu et application) : renvoie un jsonb ou lève une erreur métier.
create or replace function public._flat_change_calc(_sub public.school_offer_subscriptions, _new public.subscription_offers)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_today date := (now() at time zone 'Africa/Conakry')::date;
  v_cal record; v_old_m numeric := _sub.monthly_price; v_new_m numeric := _new.monthly_price;
  v_total int := public._flat_total_months();
  v_annual_old numeric; v_dnf numeric; v_pv numeric; v_s numeric; v_new_annual numeric; v_df numeric; v_nf int; v_next date;
begin
  if _sub.id is null or _sub.offer_type <> 'per_school' then raise exception 'NO_FLAT_OFFER'; end if;
  if not public._flat_uses_installments(_sub) then raise exception 'NOT_INSTALLMENTS'; end if;
  if exists (select 1 from public.school_flat_payments x where x.school_id = _sub.school_id and x.academic_year = _sub.academic_year
             and x.period_type = 'annual' and x.status not in ('REJECTED','CANCELLED')) then raise exception 'ANNUAL_CHANGE_UNSUPPORTED'; end if;
  if _new.id is null or _new.offer_type <> 'per_school' or not _new.is_active or _new.monthly_price is null
     or (_new.valid_until is not null and _new.valid_until < v_today) then raise exception 'OFFER_INVALID'; end if;
  if _new.monthly_price <= v_old_m then raise exception 'NOT_AN_UPGRADE'; end if;
  select * into v_cal from public.flat_billing_calendar((_sub.created_at at time zone 'Africa/Conakry')::date);
  if v_today > v_cal.year_end then raise exception 'YEAR_ENDED'; end if;
  if exists (select 1 from public.school_flat_installments i where i.subscription_id = _sub.id and i.status = 'overdue') then raise exception 'PAY_OVERDUE_FIRST'; end if;

  v_annual_old := coalesce(_sub.annual_commitment, v_old_m * v_total);
  select coalesce(sum(i.amount_due), 0) into v_dnf from public.school_flat_installments i
   where i.subscription_id = _sub.id and i.status <> 'cancelled' and (i.seq = 0 or i.due_date <= v_today);
  select count(*), min(i.due_date) into v_nf, v_next from public.school_flat_installments i
   where i.subscription_id = _sub.id and i.status <> 'cancelled' and i.seq > 0 and i.due_date > v_today;
  if v_nf < 1 then raise exception 'NO_REMAINING_INSTALLMENTS'; end if;
  select coalesce(sum(p.amount), 0) into v_pv from public.school_flat_payments p
   where p.school_id = _sub.school_id and p.academic_year = _sub.academic_year and p.period_type = 'monthly' and p.status = 'VALIDATED';

  v_new_annual := round(v_dnf + (v_annual_old - v_dnf) * v_new_m / v_old_m);
  v_s := greatest(least(v_pv, v_new_annual) - v_dnf, 0);
  v_df := greatest(v_new_annual - v_dnf - v_s, 0);
  return jsonb_build_object(
    'current_offer', _sub.offer_name, 'new_offer', _new.name, 'new_offer_code', _new.code,
    'old_monthly', v_old_m, 'new_monthly', v_new_m,
    'old_annual', v_annual_old, 'due_so_far', v_dnf, 'new_annual', v_new_annual, 'extra_cost', v_new_annual - v_annual_old,
    'paid', v_pv, 'balance_after', greatest(v_new_annual - least(v_pv, v_new_annual), 0),
    'remaining_installments', v_nf, 'next_due_date', v_next, 'approx_installment', round(v_df / v_nf),
    'new_max_students', _new.max_students);
end $function$;
revoke all on function public._flat_change_calc(public.school_offer_subscriptions, public.subscription_offers) from public, anon, authenticated;

-- 4) Aperçu avant de changer (lecture seule)
create or replace function public.preview_flat_offer_change(_offer_code text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_school uuid := public.current_school_id(); v_sub public.school_offer_subscriptions; v_new public.subscription_offers;
begin
  if v_uid is null or v_school is null then raise exception 'FORBIDDEN'; end if;
  if not (public.has_role(v_uid,'admin') or public.has_role(v_uid,'directeur') or public.has_role(v_uid,'comptable')) then raise exception 'FORBIDDEN'; end if;
  v_sub := public._school_flat_sub(v_school);
  select * into v_new from public.subscription_offers where code = lower(trim(_offer_code)) and offer_type = 'per_school';
  return public._flat_change_calc(v_sub, v_new);
end $function$;
revoke all on function public.preview_flat_offer_change(text) from public, anon;
grant execute on function public.preview_flat_offer_change(text) to authenticated, service_role;

-- 5) Application du changement (direction uniquement), journalisé et notifié
create or replace function public.change_flat_offer(_offer_code text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid(); v_school uuid := public.current_school_id(); v_sub public.school_offer_subscriptions;
  v_new public.subscription_offers; v_calc jsonb; v_name text; v_today date := (now() at time zone 'Africa/Conakry')::date;
begin
  if v_uid is null or v_school is null then raise exception 'FORBIDDEN'; end if;
  if not (public.has_role(v_uid,'admin') or public.has_role(v_uid,'directeur')) then raise exception 'FORBIDDEN'; end if;
  v_sub := public._school_flat_sub(v_school);
  if v_sub.id is null then raise exception 'NO_FLAT_OFFER'; end if;
  perform 1 from public.school_offer_subscriptions where id = v_sub.id for update;   -- sérialise avec les paiements et les autres changements
  v_sub := public._school_flat_sub(v_school);
  select * into v_new from public.subscription_offers where code = lower(trim(_offer_code)) and offer_type = 'per_school' for share;
  v_calc := public._flat_change_calc(v_sub, v_new);

  update public.school_offer_subscriptions
     set offer_id = v_new.id, offer_code = v_new.code, offer_name = v_new.name, features = v_new.features,
         min_students = v_new.min_students, max_students = v_new.max_students, monthly_price = v_new.monthly_price,
         free_months_annual = v_new.free_months_annual, annual_commitment = (v_calc->>'new_annual')::numeric, updated_at = now()
   where id = v_sub.id;

  perform public.flat_rebuild_installments(v_sub.id);
  insert into public.flat_billing_audit(school_id, subscription_id, event, details, actor)
  values (v_school, v_sub.id, 'PLAN_CHANGED', v_calc || jsonb_build_object('date', v_today), v_uid);
  perform public.flat_sync_state(v_school);

  select name into v_name from public.schools where id = v_school;
  perform public._flat_notify_school(v_school, 'plan_change:' || v_sub.id || ':' || v_new.code || ':' || v_today, 'flat_subscription',
    'Formule modifiée : ' || v_new.name,
    format('Votre formule passe de %s à %s. Nouvel engagement annuel : %s. Déjà payé : %s. Solde restant : %s, réparti sur %s échéance(s).',
           v_calc->>'current_offer', v_new.name, public._fmt_gnf((v_calc->>'new_annual')::numeric), public._fmt_gnf((v_calc->>'paid')::numeric),
           public._fmt_gnf((v_calc->>'balance_after')::numeric), v_calc->>'remaining_installments'));
  perform public._flat_notify_admins(v_school, 'plan_change_admin:' || v_sub.id || ':' || v_new.code || ':' || v_today, 'flat_payment_admin',
    'Changement de formule',
    format('%s passe de %s à %s (engagement annuel %s).', v_name, v_calc->>'current_offer', v_new.name, public._fmt_gnf((v_calc->>'new_annual')::numeric)));
  return v_calc;
end $function$;
revoke all on function public.change_flat_offer(text) from public, anon;
grant execute on function public.change_flat_offer(text) to authenticated, service_role;
