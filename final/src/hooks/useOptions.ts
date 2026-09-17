import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useAuth";

export interface Option { value: string; label: string }

const STAFF_SEES_ALL_CLASSES: string[] = ["admin", "directeur", "directeur_etudes", "proviseur", "surveillant", "secretariat"];

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
