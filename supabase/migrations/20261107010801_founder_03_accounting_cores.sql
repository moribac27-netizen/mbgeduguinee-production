-- Module « Vue Fondateur » — migration 3 : extraction du cœur de calcul des fonctions comptables existantes (comportement inchangé)
-- accounting_summary() et accounting_balances() gardent EXACTEMENT leurs contrôles (suspension, rôle finance) et appellent le cœur.
-- Retour arrière : recréer l'ancien corps (cœur + contrôles) dans accounting_summary / accounting_balances, puis drop des fonctions _accounting_*_core.
do $$
declare d text; c text;
begin
  -- ===== accounting_summary =====
  select pg_get_functiondef('public.accounting_summary(date,date,uuid)'::regprocedure) into d;
  c := d;
  c := replace(c, 'public.accounting_summary(_from date DEFAULT NULL::date, _to date DEFAULT NULL::date, _account_id uuid DEFAULT NULL::uuid)',
                  'public._accounting_summary_core(_school uuid, _from date, _to date, _account_id uuid)');
  c := replace(c, 'v_school uuid := public.current_school_id();', 'v_school uuid := _school;');
  c := regexp_replace(c, 'if public\.my_school_suspended\(\) then raise exception ''SCHOOL_SUSPENDED'' using errcode = ''P0001''; end if;', '');
  c := regexp_replace(c, 'if auth\.uid\(\) is null or not \(public\.is_finance\(auth\.uid\(\)\) or public\.is_super_admin\(auth\.uid\(\)\)\) then raise exception ''FORBIDDEN''; end if;', '');
  if c like '%current_school_id%' or c like '%my_school_suspended%' or c like '%is_finance%' or c not like '%_accounting_summary_core%' then raise exception 'PATCH_SUMMARY_NOT_APPLIED'; end if;
  execute c;
  create or replace function public.accounting_summary(_from date default null, _to date default null, _account_id uuid default null)
  returns jsonb language plpgsql stable security definer set search_path to 'public' as $f$
  declare v_school uuid := public.current_school_id();
  begin
    if public.my_school_suspended() then raise exception 'SCHOOL_SUSPENDED' using errcode = 'P0001'; end if;
    if auth.uid() is null or not (public.is_finance(auth.uid()) or public.is_super_admin(auth.uid())) then raise exception 'FORBIDDEN'; end if;
    return public._accounting_summary_core(v_school, _from, _to, _account_id);
  end $f$;

  -- ===== accounting_balances =====
  select pg_get_functiondef('public.accounting_balances()'::regprocedure) into d;
  c := d;
  c := replace(c, 'public.accounting_balances()', 'public._accounting_balances_core(_school uuid)');
  c := regexp_replace(c, 'where a\.school_id = public\.current_school_id\(\)', 'where a.school_id = _school');
  c := regexp_replace(c, 'if public\.my_school_suspended\(\) then raise exception ''SCHOOL_SUSPENDED'' using errcode = ''P0001''; end if;', '');
  c := regexp_replace(c, 'if auth\.uid\(\) is null or not \(public\.is_finance\(auth\.uid\(\)\) or public\.is_super_admin\(auth\.uid\(\)\)\) then raise exception ''FORBIDDEN''; end if;', '');
  if c like '%current_school_id%' or c like '%my_school_suspended%' or c like '%is_finance%' or c not like '%_accounting_balances_core%' then raise exception 'PATCH_BALANCES_NOT_APPLIED'; end if;
  execute c;
  create or replace function public.accounting_balances()
  returns table(account_id uuid, name text, type text, is_active boolean, initial_balance numeric, revenues numeric, expenses numeric, transfers_in numeric, transfers_out numeric, balance numeric)
  language plpgsql stable security definer set search_path to 'public' as $f$
  begin
    if public.my_school_suspended() then raise exception 'SCHOOL_SUSPENDED' using errcode = 'P0001'; end if;
    if auth.uid() is null or not (public.is_finance(auth.uid()) or public.is_super_admin(auth.uid())) then raise exception 'FORBIDDEN'; end if;
    return query select * from public._accounting_balances_core(public.current_school_id());
  end $f$;
end $$;
revoke all on function public._accounting_summary_core(uuid, date, date, uuid), public._accounting_balances_core(uuid) from public, anon, authenticated;
grant execute on function public.accounting_summary(date, date, uuid), public.accounting_balances() to authenticated;
