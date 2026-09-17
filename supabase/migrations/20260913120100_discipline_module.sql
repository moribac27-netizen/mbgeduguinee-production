-- Ajouter la colonne recorded_by si elle n'existe pas
ALTER TABLE IF EXISTS public.discipline_incidents
ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Créer les index s'ils n'existent pas
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_school ON public.discipline_incidents(school_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_discipline_incidents_student ON public.discipline_incidents(student_id, incident_date DESC);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discipline_incidents TO authenticated;
GRANT ALL ON public.discipline_incidents TO service_role;

-- RLS
ALTER TABLE public.discipline_incidents ENABLE ROW LEVEL SECURITY;

-- Supprimer les anciennes politiques si elles existent
DROP POLICY IF EXISTS "discipline_staff_read" ON public.discipline_incidents;
DROP POLICY IF EXISTS "discipline_staff_insert" ON public.discipline_incidents;
DROP POLICY IF EXISTS "discipline_staff_update" ON public.discipline_incidents;
DROP POLICY IF EXISTS "discipline_staff_delete" ON public.discipline_incidents;

-- Créer les nouvelles politiques
CREATE POLICY "discipline_staff_read" ON public.discipline_incidents
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    school_id = public.current_school_id()
    AND (
      public.is_staff(auth.uid())
      OR public.has_role(auth.uid(), 'surveillant')
    )
  )
);

CREATE POLICY "discipline_staff_insert" ON public.discipline_incidents
FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.current_school_id()
  AND (public.is_staff(auth.uid()) OR public.has_role(auth.uid(), 'surveillant'))
  AND (recorded_by = auth.uid() OR recorded_by IS NULL)
);

CREATE POLICY "discipline_staff_update" ON public.discipline_incidents
FOR UPDATE TO authenticated
USING (
  school_id = public.current_school_id()
  AND (public.is_staff(auth.uid()) OR public.has_role(auth.uid(), 'surveillant'))
)
WITH CHECK (school_id = public.current_school_id());

CREATE POLICY "discipline_staff_delete" ON public.discipline_incidents
FOR DELETE TO authenticated
USING (
  school_id = public.current_school_id()
  AND (public.is_staff(auth.uid()) OR public.has_role(auth.uid(), 'surveillant'))
);

-- Trigger pour updated_at
DROP TRIGGER IF EXISTS discipline_incidents_touch ON public.discipline_incidents;
CREATE TRIGGER discipline_incidents_touch
BEFORE UPDATE ON public.discipline_incidents
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();