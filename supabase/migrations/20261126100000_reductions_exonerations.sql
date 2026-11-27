-- Réductions, bourses et exonérations de frais de scolarité.
-- Jusqu'ici l'application ne pouvait que comparer les paiements aux frais annuels de la classe : impossible d'enregistrer
-- qu'un élève bénéficie d'une réduction ou d'une exonération (il apparaissait « en retard » à tort et recevait des relances).
-- Une réduction est une ligne à part (qui, quand, pourquoi, combien), jamais une modification des frais de la classe ni d'un paiement.
-- « Dû net » = frais annuels de la classe − réductions non annulées de l'année scolaire.
-- Réservé à la direction et à la comptabilité de l'école. Annulation motivée (jamais de suppression). Historique via accounting_audit.
-- Aucune donnée existante modifiée. Idempotent.

create table if not exists public.fee_adjustments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null default public.current_school_id() references public.schools(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete cascade,
  academic_year text not null check (academic_year ~ '^[0-9]{4}-[0-9]{4}$'),
  kind text not null check (kind in ('reduction', 'bourse', 'exoneration')),
  amount numeric not null check (amount > 0),
  reason text not null check (length(trim(reason)) >= 3),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text
);
create index if not exists fee_adjustments_student_idx on public.fee_adjustments (student_id, academic_year) where voided_at is null;
create index if not exists fee_adjustments_school_idx on public.fee_adjustments (school_id, academic_year);

alter table public.fee_adjustments enable row level security;
revoke insert, update, delete on public.fee_adjustments from anon, authenticated;
grant select on public.fee_adjustments to authenticated;

drop policy if exists fee_adjustments_read on public.fee_adjustments;
create policy fee_adjustments_read on public.fee_adjustments for select to authenticated
  using (public.is_super_admin(auth.uid())
         or ((public.is_finance(auth.uid()) or public.is_direction(auth.uid())) and school_id = public.current_school_id()));
drop policy if exists prod_tenant_boundary on public.fee_adjustments;
create policy prod_tenant_boundary on public.fee_adjustments as restrictive for all to authenticated
  using (public.is_super_admin(auth.uid()) or public.same_school(school_id))
  with check (public.is_super_admin(auth.uid()) or public.same_school(school_id));
drop policy if exists offer_login_gate on public.fee_adjustments;
create policy offer_login_gate on public.fee_adjustments as restrictive for all to authenticated
  using ((select public.school_login_allowed(auth.uid()))) with check ((select public.school_login_allowed(auth.uid())));

drop trigger if exists trg_zz_accounting_audit on public.fee_adjustments;
create trigger trg_zz_accounting_audit after insert or update or delete on public.fee_adjustments
  for each row execute function public.accounting_audit_log();

-- Total des réductions non annulées d'un élève pour une année scolaire (usage interne : fonctions SQL).
create or replace function public._fee_adjustment_total(_student_id uuid, _year text)
returns numeric language sql stable security definer set search_path to 'public' as $$
  select coalesce(sum(amount), 0) from public.fee_adjustments
   where student_id = _student_id and academic_year = _year and voided_at is null
$$;
revoke all on function public._fee_adjustment_total(uuid, text) from public, anon, authenticated;

-- Enregistre une réduction / bourse / exonération. Exonération = tout le reste dû (le montant envoyé est ignoré).
create or replace function public.add_fee_adjustment(_student_id uuid, _kind text, _amount numeric, _reason text, _year text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_school uuid := public.current_school_id();
  v_year text;
  v_fee numeric; v_existing numeric; v_due numeric; v_amount numeric; v_id uuid;
begin
  if v_uid is null or not (public.is_finance(v_uid) or public.is_direction(v_uid)) then
    raise exception 'Action réservée à la direction et à la comptabilité.' using errcode = 'P0001', hint = 'FORBIDDEN';
  end if;
  if public.school_write_blocked(v_school) then
    raise exception 'Établissement suspendu : aucune écriture possible.' using errcode = 'P0001', hint = 'SCHOOL_BLOCKED';
  end if;
  if _kind is null or _kind not in ('reduction', 'bourse', 'exoneration') then
    raise exception 'Type invalide (réduction, bourse ou exonération).' using errcode = 'P0001', hint = 'KIND_INVALID';
  end if;
  if _reason is null or length(trim(_reason)) < 3 then
    raise exception 'Le motif est obligatoire (3 caractères minimum).' using errcode = 'P0001', hint = 'REASON_REQUIRED';
  end if;
  v_year := coalesce(nullif(trim(_year), ''), public.school_academic_year(v_school));
  if v_year is null or v_year !~ '^[0-9]{4}-[0-9]{4}$' then
    raise exception 'Année scolaire invalide.' using errcode = 'P0001', hint = 'YEAR_INVALID';
  end if;
  select coalesce(c.annual_fee, 0) into v_fee
    from public.students s left join public.classes c on c.id = s.class_id
   where s.id = _student_id and s.school_id = v_school;
  if not found then
    raise exception 'Élève introuvable.' using errcode = 'P0001', hint = 'STUDENT_NOT_FOUND';
  end if;
  if v_fee <= 0 then
    raise exception 'Aucun frais n''est défini pour la classe de cet élève.' using errcode = 'P0001', hint = 'NO_FEE';
  end if;
  v_existing := public._fee_adjustment_total(_student_id, v_year);
  v_due := v_fee - v_existing;
  if v_due <= 0 then
    raise exception 'Les frais de cet élève sont déjà entièrement couverts par des réductions.' using errcode = 'P0001', hint = 'ALREADY_COVERED';
  end if;
  if _kind = 'exoneration' then
    v_amount := v_due;
  else
    if _amount is null or _amount <= 0 then
      raise exception 'Le montant doit être supérieur à zéro.' using errcode = 'P0001', hint = 'AMOUNT_INVALID';
    end if;
    if _amount > v_due then
      raise exception 'Montant trop élevé : il reste % GNF de frais à couvrir.', round(v_due)::bigint using errcode = 'P0001', hint = 'AMOUNT_TOO_HIGH';
    end if;
    v_amount := _amount;
  end if;
  insert into public.fee_adjustments(school_id, student_id, academic_year, kind, amount, reason, created_by)
  values (v_school, _student_id, v_year, _kind, v_amount, trim(_reason), v_uid)
  returning id into v_id;
  return v_id;
end $function$;
revoke execute on function public.add_fee_adjustment(uuid, text, numeric, text, text) from public, anon;
grant execute on function public.add_fee_adjustment(uuid, text, numeric, text, text) to authenticated;

-- Annule une réduction (motif obligatoire) : elle reste visible dans l'historique mais n'est plus déduite.
create or replace function public.void_fee_adjustment(_id uuid, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_school uuid := public.current_school_id(); a public.fee_adjustments;
begin
  if v_uid is null or not (public.is_finance(v_uid) or public.is_direction(v_uid)) then
    raise exception 'Action réservée à la direction et à la comptabilité.' using errcode = 'P0001', hint = 'FORBIDDEN';
  end if;
  if public.school_write_blocked(v_school) then
    raise exception 'Établissement suspendu : aucune écriture possible.' using errcode = 'P0001', hint = 'SCHOOL_BLOCKED';
  end if;
  if _reason is null or length(trim(_reason)) < 3 then
    raise exception 'Le motif de l''annulation est obligatoire (3 caractères minimum).' using errcode = 'P0001', hint = 'REASON_REQUIRED';
  end if;
  select * into a from public.fee_adjustments where id = _id and school_id = v_school for update;
  if not found then raise exception 'Réduction introuvable.' using errcode = 'P0001', hint = 'NOT_FOUND'; end if;
  if a.voided_at is not null then raise exception 'Déjà annulée.' using errcode = 'P0001', hint = 'ALREADY_VOIDED'; end if;
  update public.fee_adjustments set voided_at = now(), voided_by = v_uid, void_reason = trim(_reason) where id = _id;
end $function$;
revoke execute on function public.void_fee_adjustment(uuid, text) from public, anon;
grant execute on function public.void_fee_adjustment(uuid, text) to authenticated;

-- Relances : le reste à payer tient compte des réductions.
do $$
declare d text; c text;
begin
  select pg_get_functiondef('public.send_payment_reminders(uuid[],text)'::regprocedure) into d;
  c := replace(d, 'v_due := s.fee;', 'v_due := greatest(s.fee - public._fee_adjustment_total(s.id, public.school_academic_year(s.school_id)), 0);');
  if c = d or c not like '%_fee_adjustment_total%' then raise exception 'PATCH_REMINDERS_NOT_APPLIED'; end if;
  execute c;
end $$;

-- Vue Fondateur : le recouvrement tient compte des réductions.
do $$
declare d text; c text;
begin
  select pg_get_functiondef('public.founder_overview(uuid,date,date)'::regprocedure) into d;
  c := replace(d, 'coalesce(c.annual_fee, 0) as due', 'greatest(coalesce(c.annual_fee, 0) - public._fee_adjustment_total(s.id, v_label), 0) as due');
  if c = d or c not like '%_fee_adjustment_total%' then raise exception 'PATCH_FOUNDER_NOT_APPLIED'; end if;
  execute c;
end $$;
