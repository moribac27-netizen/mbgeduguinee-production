-- 1) Doublon : enforce_student_limit (trg_enforce_student_limit) couvre déjà plafond + essai + impayé
drop trigger if exists trg_students_flat_cap on public.students;
drop function if exists public.enforce_flat_student_cap();

-- 2) Fonctions internes de forfait : plus d'accès pour les visiteurs non connectés (anon)
--    (aucune politique RLS ni vue ne les référence ; les fonctions SECURITY DEFINER qui les appellent ne sont pas affectées)
revoke execute on function public._school_flat_sub(uuid) from public, anon;
revoke execute on function public.school_flat_in_good_standing(uuid) from public, anon;
revoke execute on function public.school_flat_phase(uuid) from public, anon;
revoke execute on function public.flat_offers_overview() from public, anon;
revoke execute on function public.my_flat_offer_status() from public, anon;
grant execute on function public._school_flat_sub(uuid) to authenticated, service_role;
grant execute on function public.school_flat_in_good_standing(uuid) to authenticated, service_role;
grant execute on function public.school_flat_phase(uuid) to authenticated, service_role;
grant execute on function public.flat_offers_overview() to authenticated, service_role;
grant execute on function public.my_flat_offer_status() to authenticated, service_role;

-- 3) search_path fixe
alter function public.current_academic_year_default() set search_path = public;
