-- Validation automatique des paiements de forfait établissement à partir du SMS de confirmation Orange Money.
-- Principe : un téléphone qui reçoit le SMS « Réception de : … GNF de la part du … reference : … » le transmet à la
-- fonction ingest_payment_sms (jeton secret). Le SMS est stocké ; s'il correspond EXACTEMENT à un paiement déclaré
-- en attente (même référence de transaction ET même montant), le paiement passe en VALIDATED, une note l'indique,
-- le directeur et le Super Admin sont notifiés. Dans tous les autres cas rien n'est validé : le paiement reste en
-- attente de validation manuelle, comme aujourd'hui. L'ordre est indifférent : SMS reçu avant ou après la déclaration.
-- Une référence de transaction ne peut servir qu'une fois. Aucune donnée existante n'est modifiée. Idempotent.

-- 1) Jeton secret (haché) : lecture/écriture réservées à la base, jamais exposées par l'API.
create table if not exists public.payment_sms_config (
  id int primary key check (id = 1),
  secret_hash text not null,
  rotated_at timestamptz not null default now()
);
alter table public.payment_sms_config enable row level security;
revoke all on public.payment_sms_config from anon, authenticated;

-- 2) SMS reçus (visibles du Super Admin uniquement).
create table if not exists public.payment_sms_inbox (
  id bigserial primary key,
  received_at timestamptz not null default now(),
  raw_text text not null,
  amount numeric not null,
  sender_phone text,
  ref_norm text not null,
  status text not null default 'RECEIVED' check (status in ('RECEIVED','VALIDATED','AMOUNT_MISMATCH')),
  matched_payment_id uuid references public.school_flat_payments(id) on delete set null,
  note text
);
create unique index if not exists payment_sms_inbox_ref_uq on public.payment_sms_inbox (ref_norm);
alter table public.payment_sms_inbox enable row level security;
revoke all on public.payment_sms_inbox from anon, authenticated;
grant select on public.payment_sms_inbox to authenticated;
drop policy if exists payment_sms_inbox_read on public.payment_sms_inbox;
create policy payment_sms_inbox_read on public.payment_sms_inbox for select to authenticated
  using (public.is_super_admin(auth.uid()));

-- 3) Génération / changement du jeton : à lancer dans l'éditeur SQL ; le jeton n'est affiché qu'une fois.
create or replace function public.rotate_payment_sms_secret()
returns text language plpgsql security definer set search_path to 'public' as $function$
declare v_secret text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  insert into public.payment_sms_config(id, secret_hash, rotated_at)
  values (1, encode(sha256(convert_to(v_secret, 'UTF8')), 'hex'), now())
  on conflict (id) do update set secret_hash = excluded.secret_hash, rotated_at = now();
  return v_secret;
end $function$;
revoke execute on function public.rotate_payment_sms_secret() from public, anon, authenticated;

-- 4) Rapprochement d'un SMS stocké avec un paiement de forfait déclaré (interne).
create or replace function public._auto_validate_flat_by_sms(_inbox_id bigint)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare
  s public.payment_sms_inbox;
  p public.school_flat_payments;
  v_label text;
begin
  select * into s from public.payment_sms_inbox where id = _inbox_id for update;
  if not found or s.status not in ('RECEIVED','AMOUNT_MISMATCH') then return 'skipped'; end if;

  select * into p from public.school_flat_payments
   where status = 'PENDING'
     and upper(regexp_replace(payer_reference, '[^A-Za-z0-9]', '', 'g')) = s.ref_norm
   order by declared_at limit 1 for update;
  if not found then return 'no_pending'; end if;

  if p.amount <> s.amount then
    update public.payment_sms_inbox
       set status = 'AMOUNT_MISMATCH', matched_payment_id = p.id,
           note = 'SMS : ' || s.amount::bigint || ' GNF ; paiement déclaré : ' || p.amount::bigint || ' GNF'
     where id = s.id;
    begin
      insert into public.notifications(user_id, type, title, body, link)
      select sa.user_id, 'flat_payment', 'Paiement de forfait à vérifier (montant différent)',
             'Référence ' || p.reference || ' — SMS reçu : ' || s.amount::bigint || ' GNF, attendu : ' || p.amount::bigint || ' GNF', '/offres'
      from public.super_admins sa;
    exception when others then null; end;
    return 'amount_mismatch';
  end if;

  update public.school_flat_payments
     set status = 'VALIDATED', reviewed_by = null, reviewed_at = now(),
         review_note = 'Validé automatiquement : SMS Orange Money reçu (référence ' || s.ref_norm || ')'
   where id = p.id;
  update public.payment_sms_inbox set status = 'VALIDATED', matched_payment_id = p.id, note = null where id = s.id;
  insert into public.school_flat_payment_events(payment_id, event, actor, details)
  values (p.id, 'VALIDATED', null, jsonb_build_object('auto', true, 'sms_id', s.id, 'sms_amount', s.amount));

  v_label := case when p.period_type = 'annual' then 'année ' || p.academic_year
                  else to_char(p.period_month, 'MM/YYYY') end;
  begin
    insert into public.notifications(user_id, school_id, type, title, body, entity_type, entity_id, link)
    select distinct ur.user_id, p.school_id, 'flat_payment_validated', 'Paiement du forfait confirmé',
           p.amount::bigint || ' GNF reçus (' || v_label || ') — votre abonnement est à jour.', 'flat_payment', p.id, '/mon-forfait'
    from public.user_roles ur join public.profiles pr on pr.id = ur.user_id
    where pr.school_id = p.school_id and ur.role::text in ('admin','directeur','comptable');
    insert into public.notifications(user_id, type, title, body, link)
    select sa.user_id, 'flat_payment', 'Paiement de forfait validé automatiquement',
           'Référence ' || p.reference || ' — ' || p.amount::bigint || ' GNF', '/offres'
    from public.super_admins sa;
  exception when others then null; end;
  return 'validated';
end $function$;
revoke execute on function public._auto_validate_flat_by_sms(bigint) from public, anon, authenticated;

-- 5) Point d'entrée appelé par le téléphone (jeton obligatoire). Ne renvoie jamais de donnée sensible.
create or replace function public.ingest_payment_sms(_secret text, _text text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_hash text;
  v_ok boolean;
  v_amt text[]; v_ref text[];
  v_amount numeric; v_norm text; v_id bigint; v_res text;
begin
  select secret_hash into v_hash from public.payment_sms_config where id = 1;
  v_ok := v_hash is not null and _secret is not null
          and v_hash = encode(sha256(convert_to(_secret, 'UTF8')), 'hex');
  if not v_ok then
    perform pg_sleep(0.5);
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if _text is null or length(_text) > 1000 then return jsonb_build_object('status', 'invalid'); end if;

  -- Seul un SMS de RÉCEPTION d'argent est pris en compte (« … de : 101000.00GNF de la part du 6xxxxxxxx, … reference:PP….… »).
  v_amt := regexp_match(_text, 'de\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*GNF\s*de la part du\s*([0-9]+)', 'i');
  v_ref := regexp_match(_text, 'reference\s*:\s*([A-Za-z0-9]+(?:\.[A-Za-z0-9]+){2})', 'i');
  if v_amt is null or v_ref is null then return jsonb_build_object('status', 'ignored'); end if;

  v_amount := replace(v_amt[1], ',', '.')::numeric;
  v_norm := upper(regexp_replace(v_ref[1], '[^A-Za-z0-9]', '', 'g'));
  if v_amount <= 0 or length(v_norm) < 8 then return jsonb_build_object('status', 'ignored'); end if;

  insert into public.payment_sms_inbox(raw_text, amount, sender_phone, ref_norm)
  values (left(_text, 1000), v_amount, v_amt[2], v_norm)
  on conflict (ref_norm) do nothing
  returning id into v_id;
  if v_id is null then return jsonb_build_object('status', 'duplicate'); end if;

  v_res := public._auto_validate_flat_by_sms(v_id);
  return jsonb_build_object('status', v_res);
end $function$;
revoke execute on function public.ingest_payment_sms(text, text) from public;
grant execute on function public.ingest_payment_sms(text, text) to anon, authenticated;

-- 6) Si le SMS est arrivé AVANT la déclaration du directeur : la déclaration déclenche la validation.
create or replace function public.declare_flat_payment(_period_type text, _period_month date, _payer_reference text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid(); v_school uuid := public.current_school_id();
  v_sub public.school_offer_subscriptions; v_amount numeric; v_month date; v_id uuid; v_ref text; v_y int; v_sms bigint;
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
  -- SMS de confirmation déjà reçu pour cette référence ? (non bloquant : en cas d'échec, validation manuelle)
  begin
    select id into v_sms from public.payment_sms_inbox
     where ref_norm = upper(regexp_replace(trim(_payer_reference), '[^A-Za-z0-9]', '', 'g')) and status in ('RECEIVED','AMOUNT_MISMATCH') limit 1;
    if v_sms is not null then perform public._auto_validate_flat_by_sms(v_sms); end if;
  exception when others then null;
  end;
  return v_id;
end $function$;
