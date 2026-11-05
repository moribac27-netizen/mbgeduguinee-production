-- Rappels et alertes pour les plans par établissement (plafond, fin d'offre, échéances, retards)
-- Idempotent : chaque notification porte une clé (metadata.key) pour ne jamais être envoyée deux fois au même utilisateur.

create or replace function public._fmt_gnf(_n numeric) returns text
language sql immutable set search_path to 'public' as $$
  select replace(to_char(coalesce(_n,0), 'FM999,999,999,999'), ',', ' ') || ' GNF'
$$;

create or replace function public._flat_notify_school(_school uuid, _key text, _type text, _title text, _body text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_n integer;
begin
  insert into public.notifications(user_id, school_id, type, title, body, entity_type, entity_id, metadata)
  select p.id, _school, _type, _title, _body, 'school', _school, jsonb_build_object('key', _key)
    from public.profiles p
   where p.school_id = _school
     and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role in ('admin','directeur','comptable'))
     and not exists (select 1 from public.notifications n where n.user_id = p.id and n.metadata->>'key' = _key);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public._flat_notify_admins(_school uuid, _key text, _type text, _title text, _body text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_n integer;
begin
  insert into public.notifications(user_id, school_id, type, title, body, link, entity_type, entity_id, metadata)
  select sa.user_id, _school, _type, _title, _body, '/offres', 'school', _school, jsonb_build_object('key', _key)
    from public.super_admins sa
   where not exists (select 1 from public.notifications n where n.user_id = sa.user_id and n.metadata->>'key' = _key);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

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
  n_cap int := 0; n_exp int := 0; n_pay int := 0; n_adm int := 0; n_schools int := 0;
begin
  for r in select distinct school_id from public.school_offer_subscriptions where offer_type = 'per_school' and status = 'active' loop
    v_sub := public._school_flat_sub(r.school_id);
    continue when v_sub.id is null;
    n_schools := n_schools + 1;
    select name into v_name from public.schools where id = r.school_id;

    -- 1) Plafond d'élèves : alerte à 90 %, puis à 100 %
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

    -- 2) Fin de l'offre exceptionnelle : J-60, J-30, J-7, puis période de grâce
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

    -- 3) Paiements (calendrier progressif)
    if public._flat_is_progressive(v_sub)
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

        -- Date limite de paiement des 12 mois
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

revoke all on function public._fmt_gnf(numeric) from public, anon, authenticated;
revoke all on function public._flat_notify_school(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public._flat_notify_admins(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.run_flat_billing_reminders(date) from public, anon, authenticated;
