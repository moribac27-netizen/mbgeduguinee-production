import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/audit";
import type { MarkStatus } from "@/lib/grade-entry";

// Les tables grade_marks / grade_validations sont plus récentes que les types générés.
const db = supabase as any;

export interface MarkScope {
  classId: string;
  period: string;
  evaluationType: string;
  academicYear: string;
}

export const marksKey = (s: MarkScope) => ["grade-marks", s.classId, s.period, s.evaluationType, s.academicYear];
export const validationsKey = (s: MarkScope) => ["grade-validations", s.classId, s.period, s.evaluationType, s.academicYear];

/** Statuts (absent, non concerné…) des élèves de la classe pour la période. Échec de lecture = aucune donnée (jamais bloquant). */
export function useGradeMarks(scope: MarkScope, studentIds: string[]) {
  return useQuery({
    queryKey: [...marksKey(scope), studentIds.length],
    enabled: !!scope.classId && studentIds.length > 0,
    staleTime: 15_000,
    queryFn: async () => {
      const out: any[] = [];
      for (let i = 0; i < studentIds.length; i += 100) {
        const { data, error } = await db
          .from("grade_marks")
          .select("student_id, subject_id, status")
          .in("student_id", studentIds.slice(i, i + 100))
          .eq("period", scope.period)
          .eq("evaluation_type", scope.evaluationType)
          .eq("academic_year", scope.academicYear);
        if (error) throw error;
        out.push(...(data ?? []));
      }
      return out;
    },
  });
}

export function useGradeValidations(scope: MarkScope) {
  return useQuery({
    queryKey: validationsKey(scope),
    enabled: !!scope.classId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("grade_validations")
        .select("class_id, subject_id, period, evaluation_type, academic_year, validated_at")
        .eq("class_id", scope.classId)
        .eq("period", scope.period)
        .eq("evaluation_type", scope.evaluationType)
        .eq("academic_year", scope.academicYear);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** Écritures : pose / retrait de statuts, validation, réouverture. Une action à la fois (verrou). */
export function useMarkActions(scope: MarkScope) {
  const qc = useQueryClient();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | { error: string }> => {
      if (lock.current) return { error: "Une opération est déjà en cours." };
      lock.current = true;
      setBusy(true);
      try {
        return await fn();
      } catch (e: any) {
        return { error: e?.message ?? "Opération impossible." };
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [],
  );

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["grade-marks", scope.classId] }),
      qc.invalidateQueries({ queryKey: ["grade-validations", scope.classId] }),
    ]);

  /** status = null → retire le statut. */
  const setMarks = (targets: Array<{ studentId: string; subjectId: string }>, status: MarkStatus | null) =>
    run(async () => {
      if (!targets.length) return { ok: true as const, count: 0 };
      if (status === null) {
        for (const t of targets) {
          const { error } = await db
            .from("grade_marks")
            .delete()
            .eq("student_id", t.studentId).eq("subject_id", t.subjectId)
            .eq("period", scope.period).eq("evaluation_type", scope.evaluationType).eq("academic_year", scope.academicYear);
          if (error) throw error;
        }
      } else {
        const rows = targets.map((t) => ({
          student_id: t.studentId,
          subject_id: t.subjectId,
          period: scope.period,
          evaluation_type: scope.evaluationType,
          academic_year: scope.academicYear,
          status,
          updated_at: new Date().toISOString(),
        }));
        const { data, error } = await db
          .from("grade_marks")
          .upsert(rows, { onConflict: "school_id,student_id,subject_id,period,evaluation_type,academic_year" })
          .select("id");
        if (error) throw error;
        if ((data ?? []).length < rows.length) throw new Error("Enregistrement refusé : vérifiez vos droits.");
      }
      void logActivity({
        action: "update",
        entity_type: "grade_marks",
        entity_label: `${status ?? "statut retiré"} × ${targets.length}`,
        metadata: { ...scope, status, count: targets.length },
      });
      await refresh();
      return { ok: true as const, count: targets.length };
    });

  const validate = (subjectIds: string[]) =>
    run(async () => {
      const rows = subjectIds.map((subject_id) => ({
        class_id: scope.classId,
        subject_id,
        period: scope.period,
        evaluation_type: scope.evaluationType,
        academic_year: scope.academicYear,
      }));
      const { error } = await db.from("grade_validations").upsert(rows, { onConflict: "school_id,class_id,subject_id,period,evaluation_type,academic_year", ignoreDuplicates: true });
      if (error) throw error;
      void logActivity({ action: "update", entity_type: "grade_validation", entity_label: `Saisie validée (${subjectIds.length} matière(s))`, metadata: { ...scope, subjectIds } });
      await refresh();
      return { ok: true as const };
    });

  const reopen = (subjectIds: string[]) =>
    run(async () => {
      const { data, error } = await db
        .from("grade_validations")
        .delete()
        .eq("class_id", scope.classId).eq("period", scope.period)
        .eq("evaluation_type", scope.evaluationType).eq("academic_year", scope.academicYear)
        .in("subject_id", subjectIds)
        .select("id");
      if (error) throw error;
      if (!(data ?? []).length) throw new Error("Réouverture refusée : seule la direction peut rouvrir une saisie validée.");
      void logActivity({ action: "update", entity_type: "grade_validation", entity_label: `Saisie rouverte (${subjectIds.length} matière(s))`, metadata: { ...scope, subjectIds } });
      await refresh();
      return { ok: true as const };
    });

  return { busy, setMarks, validate, reopen };
}
