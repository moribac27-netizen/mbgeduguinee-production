-- Enregistrement dans le dépôt d'une migration déjà appliquée en base (version 20261105231041).
-- ===== A. Échéancier mensuel (solde réparti) : structures — interrupteur DÉSACTIVÉ par défaut =====

insert into public.platform_settings(key, value)
values ('billing.flat_installments', '{"enabled": false, "from": "2020-01-01T00:00:00+00:00", "min_payment": 10000}'::jsonb)
on conflict (key) do nothing;

create or replace function public._flat_inst_cfg() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(public.platform_setting('billing.flat_installments', '{}'::jsonb), '{}'::jsonb)
$$;

create or replace function public._flat_uses_installments(_sub public.school_offer_subscriptions) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select _sub.id is not null and _sub.offer_type = 'per_school'
     and coalesce((public._flat_inst_cfg()->>'enabled')::boolean, false)
     and _sub.created_at >= coalesce(nullif(public._flat_inst_cfg()->>'from', '')::timestamptz, '-infinity'::timestamptz)
$$;

-- Échéances : une ligne par échéance (identifiant, montant, date d'exigibilité, statut)
create table if not exists public.school_flat_installments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  subscription_id uuid not null references public.school_offer_subscriptions(id) on delete cascade,
  academic_year text not null,
  seq integer not null check (seq >= 0),
  kind text not null check (kind in ('initial','installment','balance')),
  due_date date not null,
  amount_due numeric not null check (amount_due >= 0),
  amount_paid numeric not null default 0 check (amount_paid >= 0),
  status text not null default 'pending' check (status in ('pending','partial','paid','overdue','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, seq)
);
create index if not exists school_flat_installments_school_idx on public.school_flat_installments (school_id, academic_year);
alter table public.school_flat_installments enable row level security;
drop policy if exists sfi_read on public.school_flat_installments;
create policy sfi_read on public.school_flat_installments for select to authenticated using (
  public.is_super_admin(auth.uid())
  or (school_id = public.current_school_id()
      and (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'directeur'::public.app_role)
           or public.has_role(auth.uid(), 'comptable'::public.app_role))));
revoke all on public.school_flat_installments from anon, authenticated;
grant select on public.school_flat_installments to authenticated;

-- État financier de l'école (actif / suspendu) pour détecter suspension et réactivation une seule fois
create table if not exists public.flat_billing_state (
  school_id uuid primary key references public.schools(id) on delete cascade,
  state text not null check (state in ('active','suspended')),
  since timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.flat_billing_state enable row level security;
drop policy if exists fbs_read on public.flat_billing_state;
create policy fbs_read on public.flat_billing_state for select to authenticated using (
  public.is_super_admin(auth.uid()) or school_id = public.current_school_id());
revoke all on public.flat_billing_state from anon, authenticated;
grant select on public.flat_billing_state to authenticated;

-- Journal d'audit financier : lecture réservée, JAMAIS modifiable ni supprimable
create table if not exists public.flat_billing_audit (
  id bigint generated always as identity primary key,
  school_id uuid references public.schools(id) on delete set null,
  subscription_id uuid,
  event text not null,
  details jsonb not null default '{}'::jsonb,
  actor uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists flat_billing_audit_school_idx on public.flat_billing_audit (school_id, created_at desc);
alter table public.flat_billing_audit enable row level security;
drop policy if exists fba_read on public.flat_billing_audit;
create policy fba_read on public.flat_billing_audit for select to authenticated using (public.is_super_admin(auth.uid()));
revoke all on public.flat_billing_audit from anon, authenticated;
grant select on public.flat_billing_audit to authenticated;
create or replace function public._flat_audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'AUDIT_IMMUTABLE'; end $$;
drop trigger if exists trg_flat_audit_immutable on public.flat_billing_audit;
create trigger trg_flat_audit_immutable before update or delete on public.flat_billing_audit
  for each row execute function public._flat_audit_immutable();

-- Paiements : plusieurs paiements par mois autorisés en mode échéancier (partiels / anticipés)
alter table public.school_flat_payments add column if not exists is_installment boolean not null default false;
drop index if exists public.school_flat_payments_month_uq;
create unique index school_flat_payments_month_uq on public.school_flat_payments (school_id, academic_year, period_month)
  where period_type = 'monthly' and not is_installment and status <> all (array['REJECTED','CANCELLED']);

-- ===== Génération / recalcul contrôlé de l'échéancier (verrou sur l'abonnement = pas de double calcul) =====
create or replace function public.flat_rebuild_installments(_sub_id uuid, _today date default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  sub public.school_offer_subscriptions;
  today date := coalesce(_today, (now() at time zone 'Africa/Conakry')::date);
  cal record; annual numeric; monthly numeric; enrol date; eff date;
  pv numeric; p numeric; rem numeric; alloc numeric; u numeric := 0; dnf numeric := 0; s numeric; df numeric;
  r record; nf int; i int; base numeric; amt numeric; st text;
begin
  select * into sub from public.school_offer_subscriptions where id = _sub_id for update;
  if not found or not public._flat_uses_installments(sub) then return; end if;

  -- Abonnement inactif ou paiement ANNUEL déclaré : l'échéancier mensuel n'est plus dû
  if sub.status <> 'active' or exists (select 1 from public.school_flat_payments x where x.school_id = sub.school_id
        and x.academic_year = sub.academic_year and x.period_type = 'annual' and x.status not in ('REJECTED','CANCELLED')) then
    update public.school_flat_installments set status = 'cancelled', updated_at = now()
     where subscription_id = sub.id and status <> 'cancelled';
    return;
  end if;

  monthly := sub.monthly_price; annual := monthly * public._flat_total_months();
  enrol := (sub.created_at at time zone 'Africa/Conakry')::date;
  select * into cal from public.flat_billing_calendar(enrol);
  eff := greatest(enrol, cal.year_start);

  if not exists (select 1 from public.school_flat_installments where subscription_id = sub.id) then
    insert into public.school_flat_installments(school_id, subscription_id, academic_year, seq, kind, due_date, amount_due)
    values (sub.school_id, sub.id, sub.academic_year, 0, 'initial', enrol, monthly);
    insert into public.school_flat_installments(school_id, subscription_id, academic_year, seq, kind, due_date, amount_due)
    select sub.school_id, sub.id, sub.academic_year, t.seq,
           case when count(*) over () = 1 and t.due_date = cal.year_end then 'balance' else 'installment' end, t.due_date, t.amount
      from public.flat_split_balance(annual - monthly, eff, cal.year_end) t;
    insert into public.flat_billing_audit(school_id, subscription_id, event, details, actor)
    values (sub.school_id, sub.id, 'PLAN_GENERATED',
            jsonb_build_object('annual', annual, 'monthly', monthly, 'academic_year', sub.academic_year, 'enrol', enrol), null);
  end if;

  -- Seuls les paiements VALIDÉS comptent (jamais en attente / échoué / annulé), plafonnés à l'engagement annuel
  select coalesce(sum(amount), 0) into pv from public.school_flat_payments
   where school_id = sub.school_id and academic_year = sub.academic_year and period_type = 'monthly' and status = 'VALIDATED';
  p := least(pv, annual); rem := p;

  -- 1) Échéances exigibles (ou initiale) : affectation dans l'ordre, jamais de nouvelle échéance pour un montant réglé
  for r in select * from public.school_flat_installments where subscription_id = sub.id and (seq = 0 or due_date <= today) order by seq loop
    alloc := least(r.amount_due, rem); rem := rem - alloc;
    u := u + (r.amount_due - alloc); dnf := dnf + r.amount_due;
    st := case when alloc >= r.amount_due then 'paid' when r.due_date < today then 'overdue' when alloc > 0 then 'partial' else 'pending' end;
    update public.school_flat_installments set amount_paid = alloc, status = st, updated_at = now()
     where id = r.id and (amount_paid is distinct from alloc or status is distinct from st);
  end loop;
  s := rem;  -- paiement anticipé éventuel

  -- 2) Échéances à venir : le solde restant est réparti à parts égales (arrondi sur la dernière)
  select count(*) into nf from public.school_flat_installments where subscription_id = sub.id and seq > 0 and due_date > today;
  if nf > 0 then
    df := greatest(annual - dnf - s, 0);
    base := round(df / nf); i := 0;
    for r in select * from public.school_flat_installments where subscription_id = sub.id and seq > 0 and due_date > today order by seq loop
      i := i + 1;
      amt := case when i = nf then greatest(df - base * (nf - 1), 0) else base end;
      st := case when amt = 0 then 'paid' else 'pending' end;
      update public.school_flat_installments set amount_due = amt, amount_paid = 0, status = st, updated_at = now()
       where id = r.id and (amount_due is distinct from amt or amount_paid <> 0 or status is distinct from st);
    end loop;
  end if;
end $$;

-- ===== Suspension / réactivation : détection des transitions, journal et notifications (une seule fois) =====
create or replace function public.flat_sync_state(_school uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare
  v_phase text; v_state text; v_old text; v_sub public.school_offer_subscriptions; v_name text; v_bal text := '';
  v_today date := (now() at time zone 'Africa/Conakry')::date;
begin
  v_phase := public.school_flat_phase(_school);
  if v_phase = 'none' then return; end if;
  v_sub := public._school_flat_sub(_school);
  v_state := case when v_phase in ('unpaid','overdue') then 'suspended' else 'active' end;
  select state into v_old from public.flat_billing_state where school_id = _school;
  if not found then
    insert into public.flat_billing_state(school_id, state) values (_school, v_state);
    return;
  end if;
  if v_old = v_state then return; end if;
  update public.flat_billing_state set state = v_state, since = now(), updated_at = now() where school_id = _school;
  insert into public.flat_billing_audit(school_id, subscription_id, event, details, actor)
  values (_school, v_sub.id, case when v_state = 'suspended' then 'SUSPENDED' else 'REACTIVATED' end,
          jsonb_build_object('phase', v_phase, 'date', v_today), null);
  select name into v_name from public.schools where id = _school;
  if public._flat_uses_installments(v_sub) then
    v_bal := ' Solde annuel restant : ' || public._fmt_gnf((public._flat_installments_view(v_sub)->>'balance')::numeric) || '.';
  end if;
  if v_state = 'suspended' then
    perform public._flat_notify_school(_school, 'susp:' || v_sub.id || ':' || v_today, 'flat_suspension', 'Accès suspendu : paiement en retard',
      format('%s (formule %s) : un paiement exigible n''a pas été réglé dans le délai autorisé.%s Réglez-le dans la rubrique « Mon forfait » : l''accès est rétabli automatiquement dès confirmation du paiement. Vos données sont conservées.', v_name, v_sub.offer_name, v_bal));
    perform public._flat_notify_admins(_school, 'susp_admin:' || v_sub.id || ':' || v_today, 'flat_payment_admin', 'École suspendue',
      format('%s (%s) a été suspendue le %s pour paiement en retard.', v_name, v_sub.offer_name, to_char(v_today, 'DD/MM/YYYY')));
  else
    perform public._flat_notify_school(_school, 'react:' || v_sub.id || ':' || v_today, 'flat_reactivation', 'Accès rétabli',
      format('%s : votre paiement a été confirmé, l''accès à la plateforme est rétabli.%s', v_name, v_bal));
    perform public._flat_notify_admins(_school, 'react_admin:' || v_sub.id || ':' || v_today, 'flat_payment_admin', 'École réactivée',
      format('%s a été réactivée le %s après confirmation du paiement.', v_name, to_char(v_today, 'DD/MM/YYYY')));
  end if;
end $$;

-- ===== Déclencheurs =====
create or replace function public._flat_trg_payment() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_sub public.school_offer_subscriptions; v_bal text := '';
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status or new.amount is distinct from old.amount then
    perform public.flat_rebuild_installments(new.subscription_id);
    perform public.flat_sync_state(new.school_id);
    if new.status = 'VALIDATED' and (tg_op = 'INSERT' or old.status is distinct from 'VALIDATED') then
      insert into public.flat_billing_audit(school_id, subscription_id, event, details, actor)
      values (new.school_id, new.subscription_id, 'PAYMENT_CONFIRMED',
              jsonb_build_object('payment_id', new.id, 'reference', new.reference, 'amount', new.amount, 'auto', new.reviewed_by is null), new.reviewed_by);
      if new.reviewed_by is not null then  -- la validation automatique par SMS envoie déjà sa propre notification
        v_sub := public._school_flat_sub(new.school_id);
        if public._flat_uses_installments(v_sub) then
          v_bal := ' Solde annuel restant : ' || public._fmt_gnf((public._flat_installments_view(v_sub)->>'balance')::numeric) || '.';
        end if;
        perform public._flat_notify_school(new.school_id, 'pay_ok:' || new.id, 'flat_payment_validated', 'Paiement du forfait confirmé',
          format('%s reçus (référence %s).%s', public._fmt_gnf(new.amount), new.reference, v_bal));
      end if;
    elsif tg_op = 'UPDATE' and new.status in ('REJECTED','CANCELLED') and old.status is distinct from new.status then
      insert into public.flat_billing_audit(school_id, subscription_id, event, details, actor)
      values (new.school_id, new.subscription_id, 'PAYMENT_' || new.status,
              jsonb_build_object('payment_id', new.id, 'reference', new.reference, 'amount', new.amount), coalesce(new.reviewed_by, auth.uid()));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_sfp_rebuild on public.school_flat_payments;
create trigger trg_sfp_rebuild after insert or update of status, amount on public.school_flat_payments
  for each row execute function public._flat_trg_payment();

create or replace function public._flat_trg_sub_insert() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.offer_type = 'per_school' then
    perform public.flat_rebuild_installments(new.id);
    perform public.flat_sync_state(new.school_id);
    if public._flat_uses_installments(new) then
      perform public._flat_notify_school(new.school_id, 'sub_created:' || new.id, 'flat_subscription', 'Souscription confirmée : formule ' || new.offer_name,
        format('Engagement annuel : %s (12 × %s). Premier paiement : %s, puis le solde réparti sur les échéances restantes jusqu''à la fin de l''année scolaire. Consultez « Mon forfait ».',
               public._fmt_gnf(new.monthly_price * public._flat_total_months()), public._fmt_gnf(new.monthly_price), public._fmt_gnf(new.monthly_price)));
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_sos_installments on public.school_offer_subscriptions;
create trigger trg_sos_installments after insert on public.school_offer_subscriptions
  for each row execute function public._flat_trg_sub_insert();

revoke all on function public._flat_inst_cfg(), public._flat_uses_installments(public.school_offer_subscriptions),
  public.flat_rebuild_installments(uuid, date), public.flat_sync_state(uuid), public._flat_trg_payment(), public._flat_trg_sub_insert()
  from public, anon, authenticated;
