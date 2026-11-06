-- Enregistrement dans le dépôt d'une migration déjà appliquée en base (version 20261105231322).
-- Rappels : branche « échéancier » (J-7, jour J, retard, avant suspension, fin d'année) ; les anciennes branches restent identiques
create or replace function public.run_flat_billing_reminders(_today date default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_today date := coalesce(_today, (now() at time zone 'Africa/Conakry')::date);
  v_cfg jsonb := public.platform_setting('billing.flat', '{}'::jsonb);
  v_due_day int := greatest(1, least(28, coalesce((v_cfg->>'due_day')::int, 5)));
  v_grace int := greatest(0, coalesce((v_cfg->>'grace_days')::int, 15));
  v_trial int := greatest(0, coalesce((v_cfg->>'trial_days')::int, 7));
  v_exp_grace int := greatest(0, coalesce((v_cfg->>'expiry_grace_days')::int, 30));
  v_total int := public._flat_total_months();
  v_full_by date := public._flat_full_by();
  r record; v_sub public.school_offer_subscriptions; v_name text;
  v_count int; v_days int; v_paid int; v_credit int; v_first timestamptz; v_first_d date; v_start date;
  m date; k int; v_due date; v_req int; v_amt numeric; v_left int; v_trial_end date;
  ir record; v_view jsonb; v_pendtot numeric; v_pay_now numeric; v_bal numeric; v_cal record; v_txt text;
  n_cap int := 0; n_exp int := 0; n_pay int := 0; n_adm int := 0; n_schools int := 0;
begin
  for r in select distinct school_id from public.school_offer_subscriptions where offer_type = 'per_school' and status = 'active' loop
    v_sub := public._school_flat_sub(r.school_id);
    continue when v_sub.id is null;
    n_schools := n_schools + 1;
    select name into v_name from public.schools where id = r.school_id;

    -- 1) Plafond d'élèves
    if v_sub.max_students is not null then
      select count(*) into v_count from public.students where school_id = r.school_id and status = 'actif';
      if v_count >= v_sub.max_students then
        n_cap := n_cap + public._flat_notify_school(r.school_id, 'cap_full:' || v_sub.id, 'flat_cap', 'Plafond d''élèves atteint',
          format('Votre plan %s autorise %s élèves et %s sont inscrits. Les nouvelles inscriptions sont bloquées : passez à une formule supérieure pour en inscrire davantage.', v_sub.offer_name, v_sub.max_students, v_count));
      elsif v_count >= ceil(v_sub.max_students * 0.9) then
        n_cap := n_cap + public._flat_notify_school(r.school_id, 'cap_warn:' || v_sub.id, 'flat_cap', 'Plafond d''élèves bientôt atteint',
          format('Votre plan %s autorise %s élèves et %s sont déjà inscrits (90 %% ou plus). Pensez à passer à une formule supérieure.', v_sub.offer_name, v_sub.max_students, v_count));
      end if;
    end if;

    -- 2) Fin de l'offre exceptionnelle
    if v_sub.valid_until is not null then
      v_days := v_sub.valid_until - v_today;
      if v_days between 0 and 7 then
        n_exp := n_exp + public._flat_notify_school(r.school_id, 'exp_7:' || v_sub.id, 'flat_expiry', 'Votre offre se termine dans ' || v_days || ' jour(s)',
          format('L''offre par établissement 2026-2027 prend fin le %s. Choisissez un plan par élève pour continuer à utiliser MBGEduGuinée.', to_char(v_sub.valid_until, 'DD/MM/YYYY')));
      elsif v_days between 8 and 30 then
        n_exp := n_exp + public._flat_notify_school(r.school_id, 'exp_30:' || v_sub.id, 'flat_expiry', 'Votre offre se termine dans moins de 30 jours',
          format('L''offre par établissement 2026-2027 prend fin le %s. Préparez le passage à un plan par élève.', to_char(v_sub.valid_until, 'DD/MM/YYYY')));
      elsif v_days between 31 and 60 then
        n_exp := n_exp + public._flat_notify_school(r.school_id, 'exp_60:' || v_sub.id, 'flat_expiry', 'Fin de l''offre exceptionnelle dans 2 mois',
          format('L''offre par établissement est valable jusqu''au %s et ne sera pas reconduite. Anticipez le choix d''un plan par élève.', to_char(v_sub.valid_until, 'DD/MM/YYYY')));
      elsif v_days < 0 and -v_days <= v_exp_grace then
        n_exp := n_exp + public._flat_notify_school(r.school_id, 'exp_grace:' || v_sub.id, 'flat_expiry', 'Offre terminée : choisissez un plan par élève',
          format('Votre offre s''est terminée le %s. Il vous reste %s jour(s) pour choisir un plan par élève avant la restriction de l''accès. Vos données sont conservées.', to_char(v_sub.valid_until, 'DD/MM/YYYY'), v_exp_grace + v_days));
      end if;
    end if;

    -- 3a) Paiements : ÉCHÉANCIER (solde réparti)
    if public._flat_uses_installments(v_sub)
       and not exists (select 1 from public.school_flat_payments p where p.school_id = r.school_id and p.academic_year = v_sub.academic_year
                        and p.period_type = 'annual' and p.status not in ('REJECTED','CANCELLED')) then
      perform public.flat_rebuild_installments(v_sub.id, v_today);   -- statuts à jour (retards) sans modifier les paiements
      perform public.flat_sync_state(r.school_id);                    -- suspension / réactivation détectées une seule fois
      v_view := public._flat_installments_view(v_sub);
      v_bal := (v_view->>'balance')::numeric;
      v_pay_now := (v_view->>'pay_now')::numeric;
      select min(declared_at) into v_first from public.school_flat_payments
       where school_id = r.school_id and academic_year = v_sub.academic_year and period_type = 'monthly' and status not in ('REJECTED','CANCELLED');
      select coalesce(sum(amount), 0) into v_pendtot from public.school_flat_payments
       where school_id = r.school_id and academic_year = v_sub.academic_year and period_type = 'monthly' and status = 'PENDING';

      if v_first is null then
        v_trial_end := (v_sub.created_at at time zone 'Africa/Conakry')::date + v_trial;
        if v_today <= v_trial_end then
          if v_trial_end - v_today <= 3 then
            n_pay := n_pay + public._flat_notify_school(r.school_id, 'trial_end:' || v_sub.id, 'flat_payment', 'Fin de la période d''essai le ' || to_char(v_trial_end, 'DD/MM/YYYY'),
              format('%s — formule %s : déclarez votre premier paiement avant cette date : 1 mois = %s. Engagement annuel : %s.', v_name, v_sub.offer_name,
                     public._fmt_gnf(v_sub.monthly_price), public._fmt_gnf((v_view->>'annual_commitment')::numeric)));
          end if;
        else
          n_pay := n_pay + public._flat_notify_school(r.school_id, 'unpaid:' || v_sub.id, 'flat_payment', 'Période d''essai terminée',
            format('%s — formule %s : aucun paiement n''a été déclaré. L''accès reste restreint jusqu''au premier paiement : 1 mois = %s.', v_name, v_sub.offer_name, public._fmt_gnf(v_sub.monthly_price)));
          n_adm := n_adm + public._flat_notify_admins(r.school_id, 'unpaid_admin:' || v_sub.id, 'flat_payment_admin', 'École sans paiement après l''essai',
            format('%s : essai terminé le %s, aucun paiement déclaré.', v_name, to_char(v_trial_end, 'DD/MM/YYYY')));
        end if;
      else
        select * into ir from public.school_flat_installments
         where subscription_id = v_sub.id and status in ('pending','partial','overdue') and amount_due - amount_paid > 0 order by seq limit 1;
        if found and v_pendtot < (ir.amount_due - ir.amount_paid) then
          v_amt := case when ir.due_date <= v_today then v_pay_now else ir.amount_due - ir.amount_paid end;
          v_txt := format('%s — formule %s. Montant concerné : %s. Déjà payé : %s. Solde annuel restant : %s. Date limite : %s. Réglez par Orange Money puis déclarez la référence dans « Mon forfait ».',
                          v_name, v_sub.offer_name, public._fmt_gnf(v_amt), public._fmt_gnf((v_view->>'paid_amount')::numeric), public._fmt_gnf(v_bal),
                          to_char(ir.due_date + (case when ir.due_date <= v_today then v_grace else 0 end), 'DD/MM/YYYY'));
          if v_today > ir.due_date + v_grace then
            n_adm := n_adm + public._flat_notify_admins(r.school_id, 'late_admin:' || v_sub.id || ':' || ir.seq, 'flat_payment_admin', 'École en retard de paiement',
              format('%s : échéance du %s non réglée (%s à compléter).', v_name, to_char(ir.due_date, 'DD/MM/YYYY'), public._fmt_gnf(v_amt)));
          elsif v_today > ir.due_date then
            n_pay := n_pay + public._flat_notify_school(r.school_id, 'inst_late:' || v_sub.id || ':' || ir.seq, 'flat_payment', 'Paiement en retard',
              v_txt || format(' Il vous reste %s jour(s) avant la suspension de l''accès.', (ir.due_date + v_grace) - v_today));
            if (ir.due_date + v_grace) - v_today <= 2 then
              n_pay := n_pay + public._flat_notify_school(r.school_id, 'inst_presusp:' || v_sub.id || ':' || ir.seq, 'flat_payment', 'Suspension imminente de l''accès',
                v_txt || ' Sans règlement, l''accès de tout l''établissement sera suspendu.');
            end if;
          elsif v_today = ir.due_date then
            n_pay := n_pay + public._flat_notify_school(r.school_id, 'inst_due0:' || v_sub.id || ':' || ir.seq, 'flat_payment', 'Échéance de paiement aujourd''hui', v_txt);
          elsif ir.due_date - v_today <= 7 then
            n_pay := n_pay + public._flat_notify_school(r.school_id, 'inst_due7:' || v_sub.id || ':' || ir.seq, 'flat_payment', 'Échéance dans ' || (ir.due_date - v_today) || ' jour(s)', v_txt);
          end if;
        end if;

        -- Fin d'année scolaire : engagement annuel à solder
        select * into v_cal from public.flat_billing_calendar(v_sub.created_at::date);
        if v_bal > 0 and v_cal.year_end - v_today between 0 and 14 then
          n_pay := n_pay + public._flat_notify_school(r.school_id, 'year_end:' || v_sub.id, 'flat_payment', 'Fin de l''année scolaire le ' || to_char(v_cal.year_end, 'DD/MM/YYYY'),
            format('%s — formule %s : il reste %s à régler pour solder l''engagement annuel de %s.', v_name, v_sub.offer_name, public._fmt_gnf(v_bal), public._fmt_gnf((v_view->>'annual_commitment')::numeric)));
        end if;
      end if;

    -- 3b) Paiements : calendrier progressif (ancien mode, inchangé)
    elsif public._flat_is_progressive(v_sub)
       and not exists (select 1 from public.school_flat_payments p where p.school_id = r.school_id and p.academic_year = v_sub.academic_year
                        and p.period_type = 'annual' and p.status not in ('REJECTED','CANCELLED')) then
      select coalesce(sum(months_covered) filter (where status = 'VALIDATED'), 0), coalesce(sum(months_covered), 0), min(declared_at)
        into v_paid, v_credit, v_first
        from public.school_flat_payments
       where school_id = r.school_id and academic_year = v_sub.academic_year and period_type = 'monthly' and status not in ('REJECTED','CANCELLED');

      if v_first is null then
        v_trial_end := (v_sub.created_at at time zone 'Africa/Conakry')::date + v_trial;
        if v_today <= v_trial_end then
          if v_trial_end - v_today <= 3 then
            n_pay := n_pay + public._flat_notify_school(r.school_id, 'trial_end:' || v_sub.id, 'flat_payment', 'Fin de la période d''essai le ' || to_char(v_trial_end, 'DD/MM/YYYY'),
              format('Déclarez votre premier paiement avant cette date : 1 mois = %s.', public._fmt_gnf(v_sub.monthly_price)));
          end if;
        else
          n_pay := n_pay + public._flat_notify_school(r.school_id, 'unpaid:' || v_sub.id, 'flat_payment', 'Période d''essai terminée',
            format('Aucun paiement n''a été déclaré. L''accès reste restreint jusqu''au premier paiement : 1 mois = %s.', public._fmt_gnf(v_sub.monthly_price)));
          n_adm := n_adm + public._flat_notify_admins(r.school_id, 'unpaid_admin:' || v_sub.id, 'flat_payment_admin', 'École sans paiement après l''essai',
            format('%s : essai terminé le %s, aucun paiement déclaré.', v_name, to_char(v_trial_end, 'DD/MM/YYYY')));
        end if;
      else
        v_first_d := (v_first at time zone 'Africa/Conakry')::date;
        v_start := date_trunc('month', v_first_d)::date;
        k := 0;
        for m in select generate_series(v_start, date_trunc('month', v_today + 3)::date, interval '1 month')::date loop
          k := k + 1;
          v_due := greatest(m + (v_due_day - 1), (v_first_d + make_interval(months => k - 1))::date);
          v_req := public._flat_required_months(k);
          if v_credit >= v_req then continue; end if;
          v_amt := (v_req - v_credit) * v_sub.monthly_price;
          if v_today > v_due + v_grace then
            n_pay := n_pay + public._flat_notify_school(r.school_id, 'late_block:' || v_sub.id || ':' || k, 'flat_payment', 'Paiement en retard : accès restreint',
              format('L''échéance du %s n''a pas été réglée (%s mois cumulés requis, soit %s à compléter). Déclarez votre paiement pour rétablir l''accès.', to_char(v_due, 'DD/MM/YYYY'), v_req, public._fmt_gnf(v_amt)));
            n_adm := n_adm + public._flat_notify_admins(r.school_id, 'late_admin:' || v_sub.id || ':' || k, 'flat_payment_admin', 'École en retard de paiement',
              format('%s : échéance du %s non réglée (%s à compléter).', v_name, to_char(v_due, 'DD/MM/YYYY'), public._fmt_gnf(v_amt)));
          elsif v_today > v_due then
            n_pay := n_pay + public._flat_notify_school(r.school_id, 'late:' || v_sub.id || ':' || k, 'flat_payment', 'Paiement en retard',
              format('L''échéance du %s n''est pas réglée (%s à compléter). Il vous reste %s jour(s) avant la restriction de l''accès.', to_char(v_due, 'DD/MM/YYYY'), public._fmt_gnf(v_amt), (v_due + v_grace) - v_today));
          elsif v_today >= v_due - 3 then
            n_pay := n_pay + public._flat_notify_school(r.school_id, 'due:' || v_sub.id || ':' || k, 'flat_payment', 'Échéance de paiement le ' || to_char(v_due, 'DD/MM/YYYY'),
              format('Pour rester à jour, il faut atteindre %s mois cumulés payés : %s à régler.', v_req, public._fmt_gnf(v_amt)));
          end if;
          exit;
        end loop;

        if v_full_by is not null and v_credit < v_total then
          v_left := v_full_by - v_today;
          v_amt := (v_total - v_credit) * v_sub.monthly_price;
          if v_left between 0 and 7 then
            n_pay := n_pay + public._flat_notify_school(r.school_id, 'fullby_7:' || v_sub.id, 'flat_payment', 'Solde annuel à régler avant le ' || to_char(v_full_by, 'DD/MM/YYYY'),
              format('Il reste %s mois à payer (%s) avant la date limite.', v_total - v_credit, public._fmt_gnf(v_amt)));
          elsif v_left between 8 and 30 then
            n_pay := n_pay + public._flat_notify_school(r.school_id, 'fullby_30:' || v_sub.id, 'flat_payment', 'Solde annuel à régler d''ici le ' || to_char(v_full_by, 'DD/MM/YYYY'),
              format('Il reste %s mois à payer (%s) avant la date limite.', v_total - v_credit, public._fmt_gnf(v_amt)));
          end if;
        end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('date', v_today, 'schools', n_schools, 'cap', n_cap, 'expiry', n_exp, 'payment', n_pay, 'admin', n_adm);
end $$;
revoke all on function public.run_flat_billing_reminders(date) from public, anon, authenticated;
