-- Forfait mensuel souple : l'école paie 1 mois à l'inscription, puis peut continuer MOIS PAR MOIS ;
-- les 12 mois doivent obligatoirement être réglés avant la date limite « full_by » (fin d'année).
--  * Calendrier : un mois de plus exigé à chaque échéance mensuelle (1, 2, 3 … 12) → retard = restriction après la tolérance, comme avant.
--  * Plus de rattrapage automatique forcé avant la date limite (réglage catch_up = false, réactivable par le Super Admin).
--  * Après la date limite : le minimum à payer devient la totalité du solde, et l'école sans les 12 mois payés n'est plus « en règle ».
-- Aucun paiement n'existe encore au moment du changement. Idempotent.

update public.platform_settings
   set value = value || jsonb_build_object('schedule', '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb, 'catch_up', false),
       updated_at = now()
 where key = 'billing.flat_progressive';

create or replace function public._flat_min_months_at(_credit integer, _today date)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  n int := jsonb_array_length(coalesce(public._flat_prog_cfg()->'schedule', '[1,2,3,4,5,6,7,8,9,10,11,12]'::jsonb));
  v_total int := public._flat_total_months(); v_full_by date := public._flat_full_by();
  v_catch boolean := coalesce((public._flat_prog_cfg()->>'catch_up')::boolean, false);
  k int; r int; base int := null; left_p int;
begin
  for k in 1..greatest(n, 1) loop
    r := public._flat_required_months(k);
    if r > _credit then base := r - _credit; exit; end if;
  end loop;
  if base is null then base := greatest(1, v_total - _credit); end if;
  if _credit > 0 and v_full_by is not null then
    if _today > v_full_by then
      -- Date limite dépassée : il faut solder les mois restants.
      base := greatest(1, v_total - _credit);
    elsif v_catch then
      left_p := (extract(year from v_full_by)::int * 12 + extract(month from v_full_by)::int)
              - (extract(year from _today)::int * 12 + extract(month from _today)::int) + 1;
      base := greatest(base, ceil((v_total - _credit)::numeric / greatest(left_p, 1))::int);
    end if;
  end if;
  return least(base, greatest(1, v_total - _credit));
end $$;
revoke all on function public._flat_min_months_at(integer, date) from public, anon, authenticated;
