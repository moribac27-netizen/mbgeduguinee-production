-- Étape 3 de la mission : paramètres de facturation contrôlés côté serveur + journal de configuration unifié (Super Admin).
-- Idempotent. Aucune donnée existante n'est modifiée. Les valeurs actuelles sont toutes valides.

create or replace function public._check_billing_settings()
returns trigger language plpgsql set search_path to 'public' as $function$
declare v jsonb := new.value;
begin
  if new.key = 'billing.flat' then
    if jsonb_typeof(v) <> 'object' then raise exception 'BILLING_SETTING_INVALID'; end if;
    if (v ? 'due_day') and not ((v->>'due_day')::int between 1 and 28) then raise exception 'BILLING_SETTING_INVALID'; end if;
    if (v ? 'grace_days') and not ((v->>'grace_days')::int between 0 and 90) then raise exception 'BILLING_SETTING_INVALID'; end if;
    if (v ? 'expiry_grace_days') and not ((v->>'expiry_grace_days')::int between 0 and 180) then raise exception 'BILLING_SETTING_INVALID'; end if;
    if (v ? 'trial_days') and not ((v->>'trial_days')::int between 0 and 60) then raise exception 'BILLING_SETTING_INVALID'; end if;
    if (v ? 'trial_max_students') and not ((v->>'trial_max_students')::int between 0 and 1000) then raise exception 'BILLING_SETTING_INVALID'; end if;
    if (v ? 'enforce_suspension') and jsonb_typeof(v->'enforce_suspension') <> 'boolean' then raise exception 'BILLING_SETTING_INVALID'; end if;
  elsif new.key = 'billing.school_calendar' then
    if jsonb_typeof(v) <> 'object' then raise exception 'BILLING_SETTING_INVALID'; end if;
    perform make_date(2001, (v->>'start_month')::int, (v->>'start_day')::int);
    perform make_date(2001, (v->>'end_month')::int, (v->>'end_day')::int);
    if (v->>'start_month')::int = (v->>'end_month')::int and (v->>'start_day')::int <= (v->>'end_day')::int then
      raise exception 'BILLING_SETTING_INVALID';  -- l'année scolaire doit chevaucher deux années civiles
    end if;
  elsif new.key = 'billing.flat_installments' then
    if jsonb_typeof(v) <> 'object' then raise exception 'BILLING_SETTING_INVALID'; end if;
    if (v ? 'min_payment') and not ((v->>'min_payment')::numeric between 0 and 1000000) then raise exception 'BILLING_SETTING_INVALID'; end if;
    if (v ? 'enabled') and jsonb_typeof(v->'enabled') <> 'boolean' then raise exception 'BILLING_SETTING_INVALID'; end if;
  end if;
  return new;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range or null_value_not_allowed then
  raise exception 'BILLING_SETTING_INVALID';
end $function$;

drop trigger if exists trg_check_billing_settings on public.platform_settings;
create trigger trg_check_billing_settings
  before insert or update on public.platform_settings
  for each row execute function public._check_billing_settings();

-- Journal de configuration unifié : paramètres de facturation/paiement + modifications des tarifs, avec l'auteur.
create or replace function public.billing_config_journal(_limit int default 100)
returns table(changed_at timestamptz, kind text, subject text, old_value jsonb, new_value jsonb, actor_email text)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or not public.is_super_admin(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return query
  select * from (
    select h.changed_at, 'parametre'::text, h.key, h.old_value, h.new_value, u.email::text
      from public.platform_settings_history h left join auth.users u on u.id = h.changed_by
     where h.key like 'billing.%' or h.key like 'payment.%' or h.key like 'public.flat%'
    union all
    select o.changed_at, 'tarif'::text, coalesce(so.name, so.code, o.offer_id::text), o.old_values, o.new_values, u.email::text
      from public.subscription_offer_history o
      left join public.subscription_offers so on so.id = o.offer_id
      left join auth.users u on u.id = o.changed_by
  ) j
  order by 1 desc
  limit greatest(1, least(coalesce(_limit, 100), 500));
end $function$;
revoke execute on function public.billing_config_journal(int) from public, anon;
grant execute on function public.billing_config_journal(int) to authenticated;
