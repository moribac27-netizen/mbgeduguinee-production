-- Correctif de sécurité découvert en construisant l'écran collaborateurs
-- (Prompt 2) : la table public.user_roles n'a jamais porté de colonne
-- school_id, et ses policies "Staff voit tous les rôles" / "Staff gère les
-- rôles" ne vérifiaient que is_staff(auth.uid()) — sans comparer l'école du
-- compte ciblé à celle de l'appelant. Concrètement, un admin/directeur/
-- directeur_etudes/proviseur de N'IMPORTE QUELLE école pouvait lire ET
-- modifier (insert/update/delete) les rôles de N'IMPORTE QUEL utilisateur,
-- toutes écoles confondues — alors que profiles, students, etc. étaient
-- bien isolés par current_school_id()/same_school(). Toutes les autres
-- tables scolaires restent protégées (RLS via school_id), donc l'impact
-- réel se limite à user_roles, mais reste sérieux : lecture/écriture inter-
-- établissements sur les rôles.
--
-- Cette migration ne change aucun comportement pour un usage normal
-- (chacun ne gère que les collaborateurs de sa propre école) ; elle ferme
-- uniquement l'accès inter-écoles.

DROP POLICY IF EXISTS "Staff voit tous les rôles" ON public.user_roles;
DROP POLICY IF EXISTS "Staff gère les rôles" ON public.user_roles;

CREATE POLICY "user_roles_staff_read_same_school" ON public.user_roles
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.user_roles.user_id
        AND p.school_id = public.current_school_id()
    )
  )
);

CREATE POLICY "user_roles_staff_insert_same_school" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.user_roles.user_id
        AND p.school_id = public.current_school_id()
    )
  )
);

CREATE POLICY "user_roles_staff_update_same_school" ON public.user_roles
FOR UPDATE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.user_roles.user_id
        AND p.school_id = public.current_school_id()
    )
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.user_roles.user_id
        AND p.school_id = public.current_school_id()
    )
  )
);

CREATE POLICY "user_roles_staff_delete_same_school" ON public.user_roles
FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.is_staff(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.user_roles.user_id
        AND p.school_id = public.current_school_id()
    )
  )
);

-- Note : "Voir son propre rôle" (auth.uid() = user_id) n'est pas touchée,
-- chacun continue de voir son propre rôle normalement.
