-- Réductions : l'établissement utilisé est celui de l'élève (ou de la réduction), pas seulement celui du profil de l'appelant.
-- Avant : un compte dont le profil n'est pas rattaché à l'école de l'élève (ex. super administrateur qui voit plusieurs écoles)
-- obtenait toujours « Élève introuvable ». Désormais : même école que l'appelant, ou super administrateur.
-- Seules les deux fonctions sont remplacées. Aucune donnée modifiée. Idempotent.
create or replace function public.add_fee_adjustment(_student_id uuid, _kind text, _amount numeric, _reason text, _year text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_caller_school uuid := public.current_school_id();
  v_school uuid;
  v_year text;
  v_fee numeric; v_existing numeric; v_due numeric; v_amount numeric; v_id uuid;
begin
  if v_uid is null or not (public.is_finance(v_uid) or public.is_direction(v_uid) or public.is_super_admin(v_uid)) then
    raise exception 'Action réservée à la direction et à la comptabilité.' using errcode = 'P0001', hint = 'FORBIDDEN';
  end if;
  if _kind is null or _kind not in ('reduction', 'bourse', 'exoneration') then
    raise exception 'Type invalide (réduction, bourse ou exonération).' using errcode = 'P0001', hint = 'KIND_INVALID';
  end if;
  if _reason is null or length(trim(_reason)) < 3 then
    raise exception 'Le motif est obligatoire (3 caractères minimum).' using errcode = 'P0001', hint = 'REASON_REQUIRED';
  end if;
  select s.school_id, coalesce(c.annual_fee, 0) into v_school, v_fee
    from public.students s left join public.classes c on c.id = s.class_id
   where s.id = _student_id and (s.school_id = v_caller_school or public.is_super_admin(v_uid));
  if not found then
    raise exception 'Élève introuvable.' using errcode = 'P0001', hint = 'STUDENT_NOT_FOUND';
  end if;
  if public.school_write_blocked(v_school) then
    raise exception 'Établissement suspendu : aucune écriture possible.' using errcode = 'P0001', hint = 'SCHOOL_BLOCKED';
  end if;
  v_year := coalesce(nullif(trim(_year), ''), public.school_academic_year(v_school));
  if v_year is null or v_year !~ '^[0-9]{4}-[0-9]{4}$' then
    raise exception 'Année scolaire invalide.' using errcode = 'P0001', hint = 'YEAR_INVALID';
  end if;
  if v_fee <= 0 then
    raise exception 'Aucun frais n''est défini pour la classe de cet élève.' using errcode = 'P0001', hint = 'NO_FEE';
  end if;
  v_existing := public._fee_adjustment_total(_student_id, v_year);
  v_due := v_fee - v_existing;
  if v_due <= 0 then
    raise exception 'Les frais de cet élève sont déjà entièrement couverts par des réductions.' using errcode = 'P0001', hint = 'ALREADY_COVERED';
  end if;
  if _kind = 'exoneration' then
    v_amount := v_due;
  else
    if _amount is null or _amount <= 0 then
      raise exception 'Le montant doit être supérieur à zéro.' using errcode = 'P0001', hint = 'AMOUNT_INVALID';
    end if;
    if _amount > v_due then
      raise exception 'Montant trop élevé : il reste % GNF de frais à couvrir.', round(v_due)::bigint using errcode = 'P0001', hint = 'AMOUNT_TOO_HIGH';
    end if;
    v_amount := _amount;
  end if;
  insert into public.fee_adjustments(school_id, student_id, academic_year, kind, amount, reason, created_by)
  values (v_school, _student_id, v_year, _kind, v_amount, trim(_reason), v_uid)
  returning id into v_id;
  return v_id;
end $function$;

create or replace function public.void_fee_adjustment(_id uuid, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_caller_school uuid := public.current_school_id(); a public.fee_adjustments;
begin
  if v_uid is null or not (public.is_finance(v_uid) or public.is_direction(v_uid) or public.is_super_admin(v_uid)) then
    raise exception 'Action réservée à la direction et à la comptabilité.' using errcode = 'P0001', hint = 'FORBIDDEN';
  end if;
  if _reason is null or length(trim(_reason)) < 3 then
    raise exception 'Le motif de l''annulation est obligatoire (3 caractères minimum).' using errcode = 'P0001', hint = 'REASON_REQUIRED';
  end if;
  select * into a from public.fee_adjustments
   where id = _id and (school_id = v_caller_school or public.is_super_admin(v_uid)) for update;
  if not found then raise exception 'Réduction introuvable.' using errcode = 'P0001', hint = 'NOT_FOUND'; end if;
  if public.school_write_blocked(a.school_id) then
    raise exception 'Établissement suspendu : aucune écriture possible.' using errcode = 'P0001', hint = 'SCHOOL_BLOCKED';
  end if;
  if a.voided_at is not null then raise exception 'Déjà annulée.' using errcode = 'P0001', hint = 'ALREADY_VOIDED'; end if;
  update public.fee_adjustments set voided_at = now(), voided_by = v_uid, void_reason = trim(_reason) where id = _id;
end $function$;

revoke execute on function public.add_fee_adjustment(uuid, text, numeric, text, text) from public, anon;
grant execute on function public.add_fee_adjustment(uuid, text, numeric, text, text) to authenticated;
revoke execute on function public.void_fee_adjustment(uuid, text) from public, anon;
grant execute on function public.void_fee_adjustment(uuid, text) to authenticated;
