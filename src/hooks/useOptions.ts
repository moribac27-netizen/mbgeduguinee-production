import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useAuth";

export interface Option { value: string; label: string }

const STAFF_SEES_ALL_CLASSES: string[] = ["admin", "directeur", "directeur_etudes", "proviseur", "surveillant", "secretariat"];

/** Vrai pour un compte limité à ses propres classes (enseignant « pur »). */
export function useIsClassScoped(): boolean {
  const { roles, loading } = useRoles();
  return !loading && roles.length > 0 && roles.every((r) => !STAFF_SEES_ALL_CLASSES.includes(r));
}

export function useStudentOptions() {
  const { data } = useQuery({
    queryKey: ["opt-students"],
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, matricule, classes(name)")
        .order("full_name");
      return (data ?? []) as any[];
    },
    staleTime: 5 * 60_000,
  });
  const options: Option[] = (data ?? []).map((s: any) => ({
    value: s.id,
    label: `${s.full_name}${s.classes?.name ? ` — ${s.classes.name}` : ""}`,
  }));
  const byId = new Map((data ?? []).map((s: any) => [s.id, s]));
  return { options, byId, students: data ?? [] };
}

export function useClassOptions() {
  const { data } = useQuery({
    queryKey: ["opt-classes"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name, level").order("name");
      return (data ?? []) as any[];
    },
    staleTime: 5 * 60_000,
  });
  const options: Option[] = (data ?? []).map((c: any) => ({ value: c.id, label: c.name }));
  return { options, classes: data ?? [] };
}

/**
 * Comme useClassOptions(), mais restreint la liste aux seules classes de
 * l'enseignant connecté (Prompt 5). Le staff (admin/directeur/directeur des
 * études/proviseur/surveillant/secrétariat) continue de voir toutes les
 * classes de l'école — seul un compte enseignant "pur" est limité à ses
 * propres affectations. C'est un filtrage d'ergonomie côté UI : la
 * protection réelle des données (notes, présences) est déjà appliquée par
 * les policies RLS teacher_teaches_class/teacher_teaches_student.
 */
export function useScopedClassOptions() {
  const { roles, loading: rolesLoading } = useRoles();
  const isRestricted = !rolesLoading && roles.length > 0 && roles.every((r) => !STAFF_SEES_ALL_CLASSES.includes(r));

  const all = useClassOptions();

  const { data: ownClassIds } = useQuery({
    queryKey: ["opt-classes-own", isRestricted],
    enabled: isRestricted,
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return [] as string[];
      const { data: teacher } = await supabase.from("teachers").select("id").eq("user_id", uid).maybeSingle();
      if (!teacher) return [] as string[];
      const { data: rows } = await supabase
        .from("teacher_class_assignments")
        .select("class_id")
        .eq("teacher_id", teacher.id);
      return Array.from(new Set((rows ?? []).map((r: any) => r.class_id)));
    },
    staleTime: 5 * 60_000,
  });

  if (!isRestricted) return all;

  const idSet = new Set(ownClassIds ?? []);
  return {
    options: all.options.filter((o) => idSet.has(o.value)),
    classes: all.classes.filter((c: any) => idSet.has(c.id)),
  };
}

/** Affectations (classe + matière) de l'enseignant connecté ; sans effet pour le personnel qui voit toute l'école. */
function useMyAssignments(enabled: boolean) {
  const { data } = useQuery({
    queryKey: ["opt-subjects-own", enabled],
    enabled,
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return [] as { class_id: string; subject_id: string | null }[];
      const { data: teacher } = await supabase.from("teachers").select("id").eq("user_id", uid).maybeSingle();
      if (!teacher) return [] as { class_id: string; subject_id: string | null }[];
      const { data: rows } = await supabase.from("teacher_class_assignments").select("class_id, subject_id").eq("teacher_id", teacher.id);
      return (rows ?? []) as { class_id: string; subject_id: string | null }[];
    },
    staleTime: 5 * 60_000,
  });
  return data;
}

/** Vrai si l'utilisateur voit toutes les matières de la classe (direction, ou titulaire de cette classe). */
export function useSeesAllSubjects(classId?: string): boolean {
  const { roles, loading } = useRoles();
  const isRestricted = !loading && roles.length > 0 && roles.every((r) => !STAFF_SEES_ALL_CLASSES.includes(r));
  const mine = useMyAssignments(isRestricted);
  if (!isRestricted) return true;
  return (mine ?? []).some((r) => r.subject_id === null && (!classId || r.class_id === classId));
}

/**
 * Matières que l'utilisateur peut noter. Le personnel de direction voit toutes les matières ;
 * un enseignant « pur » ne voit que celles de ses affectations (classe + matière). Un titulaire
 * (affectation sans matière : instituteur, éducatrice) garde toutes les matières de sa classe.
 * Ergonomie seulement : la règle réelle est appliquée en base (policy grades_teacher_manage).
 */
export function useScopedSubjects(classId?: string) {
  const { roles, loading } = useRoles();
  const isRestricted = !loading && roles.length > 0 && roles.every((r) => !STAFF_SEES_ALL_CLASSES.includes(r));
  const { data: all = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [],
  });
  const mine = useMyAssignments(isRestricted);
  return useMemo(() => {
    if (!isRestricted) return all as any[];
    const rows = (mine ?? []).filter((r) => !classId || r.class_id === classId);
    if (rows.some((r) => r.subject_id === null)) return all as any[];
    const ids = new Set(rows.map((r) => r.subject_id));
    return (all as any[]).filter((s) => ids.has(s.id));
  }, [isRestricted, all, mine, classId]);
}

export function useTableOptions(table: string, labelKey = "name", order = labelKey) {
  const { data } = useQuery({
    queryKey: ["opt", table, labelKey],
    queryFn: async () => {
      const { data } = await supabase.from(table as any).select(`id, ${labelKey}`).order(order);
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });
  const options: Option[] = (data ?? []).map((r: any) => ({ value: r.id, label: r[labelKey] }));
  return { options, rows: data ?? [] };
}
