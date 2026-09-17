-- Prompt 3 : sécurisation de l'espace Parent/Élève par code d'accès à usage unique.
-- Un code est généré par l'école pour un élève donné ; il est nécessaire et
-- suffisant pour créer un compte parent/élève ET pour le rattacher au bon
-- élève. Plusieurs codes peuvent être émis pour le même élève (ex. les deux
-- parents, ou un parent + le compte de l'élève lui-même).

CREATE TABLE public.student_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT public.current_school_id() REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_as_role text CHECK (used_as_role IN ('parent', 'eleve'))
);

CREATE INDEX idx_student_access_codes_student ON public.student_access_codes(student_id);
CREATE INDEX idx_student_access_codes_school ON public.student_access_codes(school_id);

GRANT SELECT, INSERT, UPDATE ON public.student_access_codes TO authenticated;
GRANT ALL ON public.student_access_codes TO service_role;

ALTER TABLE public.student_access_codes ENABLE ROW LEVEL SECURITY;

-- Seul le staff de l'école peut voir/émettre des codes (pour les imprimer).
-- La validation d'un code au moment de l'inscription passe par une fonction
-- serveur avec la clé service_role (contourne la RLS) : à ce stade la
-- personne qui saisit le code n'est pas encore authentifiée.
CREATE POLICY "codes_staff_manage" ON public.student_access_codes
FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.is_staff(auth.uid()) AND school_id = public.current_school_id())
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (public.is_staff(auth.uid()) AND school_id = public.current_school_id())
);
