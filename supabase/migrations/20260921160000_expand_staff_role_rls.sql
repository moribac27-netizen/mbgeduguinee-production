-- Étend le garde-fou RLS is_staff() à tous les rôles du personnel.
-- Le frontend autorise déjà ces rôles sur plusieurs écrans scolaires ;
-- sans cette extension, la navigation pouvait fonctionner alors que les
-- requêtes RLS retournaient silencieusement zéro ligne.
-- Les rôles parent et eleve restent volontairement exclus.

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN (
        'admin',
        'directeur',
        'directeur_etudes',
        'proviseur',
        'comptable',
        'enseignant',
        'surveillant',
        'secretariat',
        'bibliothecaire',
        'infirmerie',
        'educatrice_maternelle',
        'responsable_transport',
        'responsable_cantine',
        'rh'
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
