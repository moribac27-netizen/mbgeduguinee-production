-- Prompt 1 (suite) : module Discipline pour le Surveillant général
-- Un incident par élève : date, type, description, sanction, suivi.
-- Historique consultable depuis la fiche élève. Export PDF côté client
-- (src/lib/reports.ts), pas de logique serveur additionnelle nécessaire.

CREATE TABLE public.discipline_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT public.current_school_id() REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  incident_date date NOT NULL DEFAULT CURRENT_DATE,
  incident_type text NOT NULL, -- retard, absence injustifiée, bagarre, insolence, tricherie, autre...
  description text NOT NULL,
  sanction text, -- avertissement, retenue, exclusion temporaire, convocation parents...
  follow_up text, -- suivi : ce qui a été fait / décidé ensuite
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_discipline_incidents_school ON public.discipline_incidents(school_id, incident_date DESC);
CREATE INDEX idx_discipline_incidents_student ON public.discipline_incidents(student_id, incident_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discipline_incidents TO authenticated;
GRANT ALL ON public.discipline_incidents TO service_role;

ALTER TABLE public.discipline_incidents ENABLE ROW LEVEL SECURITY;

-- Lecture : direction, direction des études/proviseur, surveillant, de la même école.
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

-- Écriture : mêmes rôles, dans leur propre école, en s'assignant comme auteur.
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

CREATE TRIGGER discipline_incidents_touch
BEFORE UPDATE ON public.discipline_incidents
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
