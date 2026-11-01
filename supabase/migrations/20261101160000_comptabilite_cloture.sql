-- Comptabilité : clôture de période.
-- Après clôture jusqu'à une date, aucune écriture (recette, dépense, virement) datée jusque-là ne peut être créée, modifiée ni annulée.
-- Clôturer : direction ou finance. Rouvrir (reculer la date) : direction uniquement, avec un motif ; tout est tracé dans l'historique.
-- Idempotent ; aucune donnée modifiée.
create table if not exists public.accounting_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  closed_until date,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.accounting_settings enable row level security;
drop policy if exists accounting_settings_read on public.accounting_settings;
create policy accounting_settings_read on public.accounting_settings for select to authenticated
  using (public.is_super_admin(auth.uid()) or (public.same_school(school_id) and (public.is_finance(auth.uid()) or public.is_direction(auth.uid()))));
revoke insert, update, delete on public.accounting_settings from anon, authenticated;

create or replace function public.accounting_period_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_closed date;
begin
  if auth.uid() is null then return NEW; end if; -- maintenance (sauvegarde / restauration)
  select closed_until into v_closed from public.accounting_settings where school_id = NEW.school_id;
  if v_closed is null then return NEW; end if;
  if TG_OP = 'INSERT' and NEW.occurred_at <= v_closed then
    raise exception 'Période clôturée jusqu''au % : aucune écriture ne peut être créée à cette date ou avant.', to_char(v_closed, 'DD/MM/YYYY') using errcode = 'P0001', hint = 'PERIOD_CLOSED';
  end if;
  if TG_OP = 'UPDATE' and OLD.occurred_at <= v_closed then
    raise exception 'Période clôturée jusqu''au % : cette écriture ne peut plus être modifiée ni annulée.', to_char(v_closed, 'DD/MM/YYYY') using errcode = 'P0001', hint = 'PERIOD_CLOSED';
  end if;
  return NEW;
end $function$;

do $$
declare t text;
begin
  foreach t in array array['revenues','expenses','account_transfers'] loop
    execute format('drop trigger if exists trg_zz_accounting_period on public.%I', t);
    execute format('create trigger trg_zz_accounting_period before insert or update on public.%I for each row execute function public.accounting_period_guard()', t);
  end loop;
end $$;

create or replace function public.set_accounting_closure(_until date, _note text default null)
returns date language plpgsql security definer set search_path to 'public' as $function$
declare v_school uuid := public.current_school_id(); v_old date; v_reopen boolean;
begin
  if auth.uid() is null or v_school is null then raise exception 'FORBIDDEN'; end if;
  if not (public.is_finance(auth.uid()) or public.is_direction(auth.uid())) then raise exception 'FORBIDDEN'; end if;
  if _until is not null and _until > (now() at time zone 'Africa/Conakry')::date then
    raise exception 'On ne peut pas clôturer une période future.' using errcode = 'P0001';
  end if;
  select closed_until into v_old from public.accounting_settings where school_id = v_school for update;
  v_reopen := v_old is not null and (_until is null or _until < v_old);
  if v_reopen then
    if not public.is_direction(auth.uid()) then
      raise exception 'Seule la direction peut rouvrir une période clôturée.' using errcode = 'P0001';
    end if;
    if length(trim(coalesce(_note, ''))) < 3 then
      raise exception 'Le motif est obligatoire pour rouvrir une période (3 caractères minimum).' using errcode = 'P0001';
    end if;
  end if;
  insert into public.accounting_settings(school_id, closed_until, updated_by, updated_at) values (v_school, _until, auth.uid(), now())
  on conflict (school_id) do update set closed_until = excluded.closed_until, updated_by = excluded.updated_by, updated_at = now();
  insert into public.accounting_audit(school_id, table_name, row_id, action, actor, old_row, new_row)
  values (v_school, 'accounting_settings', null, case when v_reopen then 'REOPEN' else 'CLOSE' end, auth.uid(),
          jsonb_build_object('closed_until', v_old), jsonb_build_object('closed_until', _until, 'note', nullif(trim(coalesce(_note,'')), '')));
  return _until;
end $function$;
revoke all on function public.set_accounting_closure(date, text) from public, anon;
grant execute on function public.set_accounting_closure(date, text) to authenticated;
