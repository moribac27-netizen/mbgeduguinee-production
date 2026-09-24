-- MBGEduGuinée : année scolaire dynamique et indépendante du fuseau navigateur.
-- La rentrée est fixée au 1er septembre en Guinée (Africa/Conakry, UTC+0).
-- Les lignes historiques (notamment student_plan_payments.academic_year) ne sont
-- jamais modifiées par cette migration.

CREATE OR REPLACE FUNCTION public.current_academic_year(_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM (_at AT TIME ZONE 'Africa/Conakry')) >= 9
      THEN (EXTRACT(YEAR FROM (_at AT TIME ZONE 'Africa/Conakry'))::int)::text
           || '-' || (EXTRACT(YEAR FROM (_at AT TIME ZONE 'Africa/Conakry'))::int + 1)::text
    ELSE (EXTRACT(YEAR FROM (_at AT TIME ZONE 'Africa/Conakry'))::int - 1)::text
           || '-' || (EXTRACT(YEAR FROM (_at AT TIME ZONE 'Africa/Conakry'))::int)::text
  END;
$$;

CREATE OR REPLACE FUNCTION public.school_academic_year(_school_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_academic_year(now());
$$;

REVOKE ALL ON FUNCTION public.current_academic_year(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_academic_year(timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.school_academic_year(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_academic_year(uuid) TO authenticated;

COMMENT ON FUNCTION public.current_academic_year(timestamptz) IS
'Année scolaire active MBGEduGuinée, calculée selon Africa/Conakry avec rentrée au 1er septembre.';
COMMENT ON FUNCTION public.school_academic_year(uuid) IS
'Année scolaire active de l’établissement. Le paramètre école est conservé pour compatibilité avec les appels existants; le millésime est déterminé par la date en Guinée.';
