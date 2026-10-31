-- Paiements ↔ Comptabilité : un paiement déjà comptabilisé (recette non annulée liée) ne peut plus être
-- modifié dans son montant / son statut / son élève, ni supprimé. Il faut d'abord annuler l'écriture comptable.
-- Idempotent. Aucune donnée modifiée.
create or replace function public.payments_posting_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null then return coalesce(NEW, OLD); end if;  -- service / migrations
  if not exists (select 1 from public.revenues r where r.payment_id = OLD.id and r.voided_at is null) then
    return coalesce(NEW, OLD);
  end if;
  if TG_OP = 'DELETE' then
    raise exception 'Ce paiement est comptabilisé : annulez d''abord l''écriture correspondante en Comptabilité.' using errcode = 'P0001', hint = 'PAYMENT_POSTED';
  end if;
  if NEW.amount is distinct from OLD.amount or NEW.validation_status is distinct from OLD.validation_status
     or NEW.student_id is distinct from OLD.student_id or NEW.school_id is distinct from OLD.school_id then
    raise exception 'Ce paiement est comptabilisé : annulez d''abord l''écriture correspondante en Comptabilité.' using errcode = 'P0001', hint = 'PAYMENT_POSTED';
  end if;
  return NEW;
end $function$;
drop trigger if exists trg_payments_posting_guard on public.payments;
create trigger trg_payments_posting_guard before update or delete on public.payments for each row execute function public.payments_posting_guard();
