-- Suspension GLOBALE d'un établissement au forfait dont un paiement est en retard (après le délai de grâce) :
-- tous les utilisateurs rattachés (direction, enseignants, comptables, parents, élèves…) perdent l'accès aux données de l'établissement.
-- Contrôlée côté serveur (RLS restrictive + déclencheurs), donc impossible à contourner en appelant directement l'API.
-- Restent accessibles : la session, la situation financière et le paiement (tables de forfait), les notifications.
-- Le Super Admin n'est jamais concerné ; les écoles « par élève » ne sont pas concernées. Aucune donnée n'est supprimée.
-- Réactivation : automatique et immédiate dès que la base juge l'établissement en règle (paiement validé).
-- Interrupteur d'urgence : update platform_settings set value = value || '{"enforce_suspension": false}' where key = 'billing.flat';
-- Retour arrière complet : voir le bloc commenté en bas de ce fichier.

create or replace function public.my_school_suspended()
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then false
    when public.is_super_admin(auth.uid()) then false
    when coalesce((public.platform_setting('billing.flat', '{}'::jsonb)->>'enforce_suspension')::boolean, true) is not true then false
    when public.current_school_id() is null then false
    else public.school_flat_phase(public.current_school_id()) in ('unpaid', 'overdue')
  end
$$;
revoke all on function public.my_school_suspended() from public, anon;
grant execute on function public.my_school_suspended() to authenticated;

create or replace function public._suspension_gate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.my_school_suspended() then
    raise exception 'SCHOOL_SUSPENDED' using errcode = 'P0001', hint = 'Accès suspendu : régularisez le paiement dans « Mon forfait ».';
  end if;
  return null;
end $$;
revoke all on function public._suspension_gate() from public, anon, authenticated;

-- Application à toutes les tables d'établissement, sauf celles qui servent à payer et à se connecter.
do $$
declare t text;
  exempt text[] := array['profiles','school_offer_subscriptions','school_flat_payments','school_flat_installments',
                         'flat_billing_state','flat_billing_audit','notifications','trial_identities','activity_logs'];
begin
  for t in
    select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'school_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and c.relname <> all (exempt)
  loop
    execute format('drop policy if exists suspension_gate on public.%I', t);
    execute format('create policy suspension_gate on public.%I as restrictive for all to authenticated using (not (select public.my_school_suspended()))', t);
    execute format('drop trigger if exists trg_suspension_gate on public.%I', t);
    execute format('create trigger trg_suspension_gate before insert or update or delete on public.%I for each statement execute function public._suspension_gate()', t);
  end loop;
end $$;

-- Information affichée à TOUS les membres de l'établissement (les montants ne sont donnés qu'aux responsables).
create or replace function public.my_school_suspension()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_school uuid := public.current_school_id(); v_uid uuid := auth.uid();
  v_sub public.school_offer_subscriptions; v_susp boolean; v_manager boolean; s jsonb; v_since timestamptz; v_name text;
begin
  if v_uid is null or v_school is null then return jsonb_build_object('suspended', false); end if;
  v_susp := public.my_school_suspended();
  if not v_susp then return jsonb_build_object('suspended', false); end if;
  v_sub := public._school_flat_sub(v_school);
  select name into v_name from public.schools where id = v_school;
  select since into v_since from public.flat_billing_state where school_id = v_school and state = 'suspended';
  v_manager := public.has_role(v_uid, 'admin') or public.has_role(v_uid, 'directeur') or public.has_role(v_uid, 'comptable');
  s := case when v_manager then public.my_flat_schedule() else null end;
  return jsonb_build_object(
    'suspended', true, 'school_name', v_name, 'offer_name', v_sub.offer_name, 'since', v_since,
    'phase', public.school_flat_phase(v_school), 'can_manage', v_manager,
    'balance', s->'balance', 'overdue_amount', s->'overdue_amount', 'next_due_date', s->'next_due_date',
    'pay_now', s->'pay_now');
end $$;
revoke all on function public.my_school_suspension() from public, anon;
grant execute on function public.my_school_suspension() to authenticated;

/* RETOUR ARRIÈRE (à exécuter seulement si nécessaire) :
do $$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' loop
    execute format('drop policy if exists suspension_gate on public.%I', t);
    execute format('drop trigger if exists trg_suspension_gate on public.%I', t);
  end loop; end $$;
*/
