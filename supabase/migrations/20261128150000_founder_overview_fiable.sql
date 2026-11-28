-- Vue Fondateur : trois corrections dans founder_overview (patch de la définition en place, aucune donnée modifiée).
-- 1) Abonnement payé en une fois (annuel) : « Engagement 12 mensualités / Déjà payé 0 » était faux -> montant réellement versé.
-- 2) Recouvrement : même règle de scolarité que partout (type scolarité avec ou sans accent, paiement validé, remboursements déduits).
-- 3) Alerte « paiements validés non comptabilisés » (les recettes comptables peuvent être inférieures aux encaissements réels).
do $patch$
declare
  v_old text;
  v_new text;
begin
  v_old := pg_get_functiondef('public.founder_overview(uuid,date,date)'::regprocedure);
  v_new := v_old;

  if position($a$'last_due_date', v_view->'last_due_date');$a$ in v_new) = 0 then raise exception 'patch 1: ancre introuvable'; end if;
  v_new := replace(v_new, $a$'last_due_date', v_view->'last_due_date');$a$, $b$'last_due_date', v_view->'last_due_date');
      -- Forfait payé en une fois (annuel) : le montant réellement versé remplace le calcul « 12 mensualités ».
      if coalesce((v_view->>'annual_mode')::boolean, false) then
        declare v_paid_all numeric; v_annual_amt numeric; v_commit numeric;
        begin
          select coalesce(sum(amount) filter (where status = 'VALIDATED'), 0),
                 coalesce(sum(amount) filter (where period_type = 'annual' and status not in ('REJECTED', 'CANCELLED')), 0)
            into v_paid_all, v_annual_amt
            from public.school_flat_payments where school_id = _school_id and academic_year = v_sub.academic_year;
          v_commit := case when v_annual_amt > 0 then v_annual_amt else (v_view->>'annual_commitment')::numeric end;
          v_subscription := v_subscription || jsonb_build_object('annual_commitment', v_commit, 'paid_amount', v_paid_all,
            'balance', greatest(v_commit - v_paid_all, 0), 'credit', greatest(v_paid_all - v_commit, 0), 'overdue_amount', 0,
            'next_due_date', null, 'next_installment_amount', null, 'annual_mode', true);
        end;
      end if;$b$);

  if position($a$p.payment_type = 'scolarite' and p.status = 'payé'$a$ in v_new) = 0 then raise exception 'patch 2: ancre introuvable'; end if;
  v_new := replace(v_new, $a$p.payment_type = 'scolarite' and p.status = 'payé'$a$, $b$lower(coalesce(p.payment_type, '')) in ('scolarite', 'scolarité')$b$);

  if position($a$v_alerts := jsonb_build_object('voided_entries',$a$ in v_new) = 0 then raise exception 'patch 3: ancre introuvable'; end if;
  v_new := replace(v_new, $a$v_alerts := jsonb_build_object('voided_entries',$a$, $b$v_alerts := jsonb_build_object(
    'unposted_payments', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(u.a), 0))
        from (select p.amount - coalesce((select sum(r.amount) from public.payment_refunds r where r.payment_id = p.id and r.cancelled_at is null), 0) as a
                from public.payments p
               where p.school_id = _school_id and p.validation_status = 'validé' and p.amount > 0
                 and not exists (select 1 from public.revenues rv where rv.payment_id = p.id and rv.voided_at is null)) u
       where u.a > 0),
    'voided_entries',$b$);

  if v_new = v_old then raise exception 'patch : aucune modification appliquée'; end if;
  execute v_new;
end
$patch$;
revoke execute on function public.founder_overview(uuid, date, date) from public, anon;
grant execute on function public.founder_overview(uuid, date, date) to authenticated;
