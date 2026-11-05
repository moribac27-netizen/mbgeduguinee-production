-- Super Admin : (1) calendrier de paiement progressif modifiable en sécurité, (2) import d'un relevé Orange Money (CSV),
-- (3) historique des rapprochements (SMS + relevés). Idempotent. Aucune donnée existante n'est modifiée ni supprimée.

-- 1) Contrôle serveur du calendrier progressif : une valeur invalide casserait la facturation de toutes les écoles.
create or replace function public._check_flat_progressive_setting()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  v jsonb := new.value; total int; arr jsonb; n int; i int; cur int; prev int := 0;
begin
  if new.key <> 'billing.flat_progressive' then return new; end if;
  if jsonb_typeof(v) <> 'object' then raise exception 'PROGRESSIVE_SETTING_INVALID'; end if;
  total := coalesce((v->>'total_months')::int, 12);
  if total < 1 or total > 12 then raise exception 'PROGRESSIVE_SETTING_INVALID'; end if;
  arr := coalesce(v->'schedule', '[]'::jsonb);
  if jsonb_typeof(arr) <> 'array' then raise exception 'PROGRESSIVE_SETTING_INVALID'; end if;
  n := jsonb_array_length(arr);
  if n < 1 or n > 24 then raise exception 'PROGRESSIVE_SETTING_INVALID'; end if;
  for i in 0..n - 1 loop
    cur := (arr->>i)::int;
    if cur < 1 or cur > total or cur <= prev then raise exception 'PROGRESSIVE_SETTING_INVALID'; end if;
    prev := cur;
  end loop;
  if prev <> total then raise exception 'PROGRESSIVE_SETTING_INVALID'; end if;
  perform nullif(v->>'full_by', '')::date;
  perform nullif(v->>'vacation_start', '')::date;
  return new;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
  raise exception 'PROGRESSIVE_SETTING_INVALID';
end $function$;

drop trigger if exists trg_check_flat_progressive_setting on public.platform_settings;
create trigger trg_check_flat_progressive_setting
  before insert or update on public.platform_settings
  for each row execute function public._check_flat_progressive_setting();

-- 2) Origine des lignes de rapprochement (SMS ou relevé importé) + journal des imports.
alter table public.payment_sms_inbox add column if not exists source text not null default 'sms';
do $$ begin
  alter table public.payment_sms_inbox add constraint payment_sms_inbox_source_chk check (source in ('sms','csv'));
exception when duplicate_object then null; end $$;
alter table public.payment_sms_inbox add column if not exists import_id bigint;

create table if not exists public.payment_statement_imports (
  id bigserial primary key,
  imported_at timestamptz not null default now(),
  imported_by uuid,
  filename text,
  rows_total int not null default 0,
  rows_validated int not null default 0,
  rows_mismatch int not null default 0,
  rows_waiting int not null default 0,
  rows_duplicate int not null default 0,
  rows_ignored int not null default 0
);
alter table public.payment_statement_imports enable row level security;
revoke all on public.payment_statement_imports from anon, authenticated;
grant select on public.payment_statement_imports to authenticated;
drop policy if exists payment_statement_imports_read on public.payment_statement_imports;
create policy payment_statement_imports_read on public.payment_statement_imports for select to authenticated
  using (public.is_super_admin(auth.uid()));

-- 3) Import d'un relevé : lignes déjà extraites par l'application [{ref, amount, phone?, label?}].
--    Chaque ligne suit EXACTEMENT la même règle que le SMS : référence + montant exacts, sinon rien n'est validé.
create or replace function public.import_payment_statement(_filename text, _rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  r jsonb; v_norm text; v_amount numeric; v_id bigint; v_imp bigint; v_res text; v_old public.payment_sms_inbox;
  n_total int := 0; n_val int := 0; n_mis int := 0; n_wait int := 0; n_dup int := 0; n_ign int := 0;
  v_out jsonb := '[]'::jsonb; v_status text;
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _rows is null or jsonb_typeof(_rows) <> 'array' then raise exception 'ROWS_INVALID'; end if;
  if jsonb_array_length(_rows) > 2000 then raise exception 'ROWS_TOO_MANY'; end if;

  insert into public.payment_statement_imports(imported_by, filename) values (auth.uid(), left(_filename, 200)) returning id into v_imp;

  for r in select * from jsonb_array_elements(_rows) loop
    n_total := n_total + 1;
    v_status := null;
    begin
      v_norm := upper(regexp_replace(coalesce(r->>'ref', ''), '[^A-Za-z0-9]', '', 'g'));
      v_amount := nullif(r->>'amount', '')::numeric;
    exception when others then v_norm := ''; v_amount := null; end;
    if v_amount is null or v_amount <= 0 or length(v_norm) < 8 then
      n_ign := n_ign + 1; v_status := 'ignored';
    else
      v_id := null;
      insert into public.payment_sms_inbox(raw_text, amount, sender_phone, ref_norm, source, import_id)
      values (left('[Relevé] ' || coalesce(r->>'label', r->>'ref'), 1000), v_amount, left(nullif(r->>'phone', ''), 30), v_norm, 'csv', v_imp)
      on conflict (ref_norm) do nothing returning id into v_id;
      if v_id is null then
        -- Déjà connue (SMS ou import précédent) : on retente seulement si elle attend encore un paiement.
        select * into v_old from public.payment_sms_inbox where ref_norm = v_norm;
        if v_old.status in ('RECEIVED', 'AMOUNT_MISMATCH') then
          v_res := public._auto_validate_flat_by_sms(v_old.id);
          if v_res = 'validated' then n_val := n_val + 1; v_status := 'validated';
          elsif v_res = 'amount_mismatch' then n_mis := n_mis + 1; v_status := 'amount_mismatch';
          else n_dup := n_dup + 1; v_status := 'duplicate'; end if;
        else
          n_dup := n_dup + 1; v_status := 'duplicate';
        end if;
      else
        v_res := public._auto_validate_flat_by_sms(v_id);
        if v_res = 'validated' then n_val := n_val + 1; v_status := 'validated';
        elsif v_res = 'amount_mismatch' then n_mis := n_mis + 1; v_status := 'amount_mismatch';
        else n_wait := n_wait + 1; v_status := 'waiting'; end if;
      end if;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('ref', v_norm, 'status', v_status));
  end loop;

  update public.payment_statement_imports
     set rows_total = n_total, rows_validated = n_val, rows_mismatch = n_mis, rows_waiting = n_wait, rows_duplicate = n_dup, rows_ignored = n_ign
   where id = v_imp;
  return jsonb_build_object('import_id', v_imp, 'total', n_total, 'validated', n_val, 'mismatch', n_mis,
                            'waiting', n_wait, 'duplicate', n_dup, 'ignored', n_ign, 'rows', v_out);
end $function$;
revoke execute on function public.import_payment_statement(text, jsonb) from public, anon;
grant execute on function public.import_payment_statement(text, jsonb) to authenticated;

-- 4) Historique des rapprochements (SMS + relevés) : numéro de téléphone masqué.
create or replace function public.payment_reconciliation_history(_limit int default 200)
returns table(id bigint, received_at timestamptz, source text, amount numeric, ref_norm text, sender_masked text,
              status text, note text, payment_reference text, school_name text, payment_status text, filename text)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return query
    select i.id, i.received_at, i.source, i.amount, i.ref_norm,
           case when i.sender_phone is null then null
                else repeat('•', greatest(length(i.sender_phone) - 3, 0)) || right(i.sender_phone, 3) end,
           i.status, i.note, p.reference, s.name, p.status, im.filename
      from public.payment_sms_inbox i
      left join public.school_flat_payments p on p.id = i.matched_payment_id
      left join public.schools s on s.id = p.school_id
      left join public.payment_statement_imports im on im.id = i.import_id
     order by i.received_at desc
     limit greatest(1, least(coalesce(_limit, 200), 1000));
end $function$;
revoke execute on function public.payment_reconciliation_history(int) from public, anon;
grant execute on function public.payment_reconciliation_history(int) to authenticated;
