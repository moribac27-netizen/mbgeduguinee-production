-- Remboursement d'un paiement élève (total ou partiel).
-- Un paiement comptabilisé est verrouillé : le remboursement est donc une écriture À PART, l'historique est conservé :
--   1) un paiement négatif « validé » (le total payé de l'élève baisse, donc son reste à payer remonte) ;
--   2) si le paiement d'origine était en comptabilité : une dépense sur le même compte (le solde du compte baisse,
--      le rapprochement bancaire reste juste) ;
--   3) une ligne dans payment_refunds (qui, quand, pourquoi, combien).
-- Réservé à admin / directeur / comptable de l'école. Refusé si : paiement non validé, montant > reste remboursable,
-- motif absent, période comptable clôturée (garde existante), école suspendue. Aucune donnée existante modifiée.
-- Idempotent.

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  refund_payment_id uuid references public.payments(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  student_id uuid references public.students(id) on delete set null,
  amount numeric not null check (amount > 0),
  reason text not null check (length(trim(reason)) >= 3),
  account_id uuid references public.financial_accounts(id) on delete set null,
  refunded_by uuid references auth.users(id) on delete set null,
  refunded_at timestamptz not null default now()
);
create index if not exists payment_refunds_payment_idx on public.payment_refunds (payment_id);
create index if not exists payment_refunds_school_idx on public.payment_refunds (school_id, refunded_at desc);

alter table public.payment_refunds enable row level security;
revoke insert, update, delete on public.payment_refunds from anon, authenticated;

drop policy if exists payment_refunds_read on public.payment_refunds;
create policy payment_refunds_read on public.payment_refunds for select to authenticated
  using (public.is_super_admin(auth.uid())
         or (public.is_finance(auth.uid()) and school_id = public.current_school_id()));

drop policy if exists prod_tenant_boundary on public.payment_refunds;
create policy prod_tenant_boundary on public.payment_refunds as restrictive for all to authenticated
  using (public.is_super_admin(auth.uid()) or public.same_school(school_id))
  with check (public.is_super_admin(auth.uid()) or public.same_school(school_id));

drop policy if exists offer_login_gate on public.payment_refunds;
create policy offer_login_gate on public.payment_refunds as restrictive for all to authenticated
  using ((select public.school_login_allowed()))
  with check ((select public.school_login_allowed()));

-- Le parent ne doit pas recevoir « Paiement validé » avec un montant négatif : la notification de remboursement
-- est envoyée par la fonction ci-dessous.
create or replace function public.notify_payment_validated()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
DECLARE _label text; _student_name text;
BEGIN
  IF NEW.validation_status <> 'validé' THEN RETURN NEW; END IF;
  IF NEW.amount <= 0 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.validation_status = 'validé' THEN RETURN NEW; END IF;
  IF NEW.student_id IS NULL THEN RETURN NEW; END IF;

  SELECT full_name INTO _student_name FROM public.students WHERE id = NEW.student_id;
  _label := 'Paiement validé' || COALESCE(' — ' || _student_name, '');

  INSERT INTO public.notifications (user_id, school_id, type, title, body, entity_type, entity_id, link)
  SELECT r.user_id, NEW.school_id, 'payment_validated', _label,
         COALESCE(NEW.receipt_number, '') || ' · ' || NEW.amount::text || ' GNF',
         'payment', NEW.id, '/paiements'
  FROM public.student_recipient_users(NEW.student_id) r;
  RETURN NEW;
END $function$;

create or replace function public.refund_payment(_payment_id uuid, _amount numeric, _reason text, _account_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  p public.payments;
  v_rev public.revenues;
  v_already numeric;
  v_left numeric;
  v_neg uuid;
  v_exp uuid;
  v_id uuid;
  v_name text;
  v_method text;
  v_acc uuid;
begin
  if v_uid is null or not public.is_finance(v_uid) then
    raise exception 'Action réservée à la direction et à la comptabilité.' using errcode = 'P0001', hint = 'FORBIDDEN';
  end if;
  if _reason is null or length(trim(_reason)) < 3 then
    raise exception 'Le motif du remboursement est obligatoire (3 caractères minimum).' using errcode = 'P0001', hint = 'REASON_REQUIRED';
  end if;
  if _amount is null or _amount <= 0 then
    raise exception 'Le montant à rembourser doit être supérieur à zéro.' using errcode = 'P0001', hint = 'AMOUNT_INVALID';
  end if;

  select * into p from public.payments where id = _payment_id and school_id = public.current_school_id() for update;
  if not found then
    raise exception 'Paiement introuvable.' using errcode = 'P0001', hint = 'PAYMENT_NOT_FOUND';
  end if;
  if public.school_write_blocked(p.school_id) then
    raise exception 'Établissement suspendu : aucune écriture possible.' using errcode = 'P0001', hint = 'SCHOOL_BLOCKED';
  end if;
  if p.validation_status <> 'validé' or p.amount <= 0 then
    raise exception 'Seul un paiement validé peut être remboursé.' using errcode = 'P0001', hint = 'PAYMENT_NOT_REFUNDABLE';
  end if;

  select coalesce(sum(amount), 0) into v_already from public.payment_refunds where payment_id = p.id;
  v_left := p.amount - v_already;
  if _amount > v_left then
    raise exception 'Montant trop élevé : il reste % GNF remboursables sur ce paiement.', round(v_left)::bigint using errcode = 'P0001', hint = 'AMOUNT_TOO_HIGH';
  end if;

  select full_name into v_name from public.students where id = p.student_id;

  insert into public.payments(student_id, amount, payment_type, period, payment_method, notes, status, recorded_by, paid_at,
                              school_id, validation_status, validated_by, validated_at)
  values (p.student_id, -_amount, p.payment_type, p.period, p.payment_method,
          'Remboursement' || coalesce(' du reçu ' || p.receipt_number, '') || ' — ' || trim(_reason),
          'payé', v_uid, now(), p.school_id, 'validé', v_uid, now())
  returning id into v_neg;

  -- Comptabilité : seulement si le paiement d'origine y figure (sinon il n'y a pas d'argent enregistré à sortir).
  select * into v_rev from public.revenues where payment_id = p.id and voided_at is null order by created_at limit 1;
  if found then
    v_acc := coalesce(_account_id, v_rev.account_id);
    v_method := case lower(coalesce(p.payment_method,'')) when 'espèces' then 'especes' when 'especes' then 'especes' when 'orange money' then 'orange_money'
                  when 'mtn momo' then 'mobile_money' when 'virement' then 'virement' when 'chèque' then 'cheque' when 'cheque' then 'cheque' else 'autre' end;
    insert into public.expenses(school_id, account_id, type, amount, method, reference, description, beneficiary, occurred_at)
    values (p.school_id, v_acc, 'autres'::public.expense_type, _amount, v_method::public.payment_method,
            coalesce(p.receipt_number, p.transaction_reference),
            'Remboursement élève' || coalesce(' — ' || v_name, '') || coalesce(' — reçu ' || p.receipt_number, '') || ' — ' || trim(_reason),
            v_name, (now() at time zone 'Africa/Conakry')::date)
    returning id into v_exp;
  else
    v_acc := null;
  end if;

  insert into public.payment_refunds(school_id, payment_id, refund_payment_id, expense_id, student_id, amount, reason, account_id, refunded_by)
  values (p.school_id, p.id, v_neg, v_exp, p.student_id, _amount, trim(_reason), v_acc, v_uid)
  returning id into v_id;

  insert into public.notifications (user_id, school_id, type, title, body, entity_type, entity_id, link)
  select r.user_id, p.school_id, 'payment_refund', 'Remboursement' || coalesce(' — ' || v_name, ''),
         _amount::text || ' GNF remboursés' || coalesce(' (reçu ' || p.receipt_number || ')', ''), 'payment', v_neg, '/parent'
  from public.student_recipient_users(p.student_id) r;

  return jsonb_build_object('refund_id', v_id, 'refund_payment_id', v_neg, 'expense_id', v_exp,
                            'amount', _amount, 'remaining_refundable', v_left - _amount, 'posted_to_accounting', v_exp is not null);
end $function$;

revoke execute on function public.refund_payment(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.refund_payment(uuid, numeric, text, uuid) to authenticated;
