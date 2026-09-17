-- Prompt 1 : rôles manquants + module Discipline
-- Ajoute les 7 rôles déjà présents côté frontend (src/hooks/useAuth.ts) mais
-- absents de l'enum app_role en base. Ne touche à aucun rôle existant.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'secretariat';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'bibliothecaire';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'infirmerie';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'educatrice_maternelle';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'responsable_transport';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'responsable_cantine';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'rh';
