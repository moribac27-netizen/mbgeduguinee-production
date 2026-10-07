import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logActivity } from "@/lib/audit";
import { gradeKey, type SaveOp } from "@/lib/grade-entry";

/** Types d'évaluation : nomenclature du module Examens (enum exam_type). */
export const EVALUATION_TYPES = [
  { v: "composition", l: "Composition" },
  { v: "devoir", l: "Devoir" },
  { v: "controle", l: "Contrôle" },
  { v: "examen", l: "Examen" },
] as const;
export const DEFAULT_EVALUATION = "composition";
export const ENTRY_PERIODS = [
  { v: "T1", l: "Trimestre 1" },
  { v: "T2", l: "Trimestre 2" },
  { v: "T3", l: "Trimestre 3" },
] as const;

const PAGE = 1000; // limite de lignes par requête côté Supabase
const CHUNK = 100;

/**
 * Lecture complète (paginée) des notes d'une liste d'élèves pour une période
 * et une année. Sans pagination, une grande classe dépasserait 1000 lignes et
 * des notes seraient silencieusement absentes — donc comptées « manquantes ».
 */
export async function fetchGradesFor(studentIds: string[], period: string, academicYear: string): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < studentIds.length; i += CHUNK) {
    const chunk = studentIds.slice(i, i + CHUNK);
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from("grades").select("*").in("student_id", chunk).eq("period", period);
      if (academicYear) q = q.eq("academic_year", academicYear);
      const { data, error } = await q.order("id", { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

/** Élèves d'une classe (photo incluse pour la liste intelligente). */
export function useClassStudents(classId: string) {
  return useQuery({
    queryKey: ["entry-students", classId],
    enabled: !!classId,
    staleTime: 60_000,
    queryFn: async () =>
      (
        await supabase
          .from("students")
          .select("id, full_name, matricule, photo_url, status")
          .eq("class_id", classId)
          .order("full_name")
      ).data ?? [],
  });
}

export const entryGradesKey = (classId: string, period: string, year: string) => ["entry-grades", classId, period, year];

export function useEntryGrades(classId: string, studentIds: string[], period: string, academicYear: string) {
  return useQuery({
    queryKey: [...entryGradesKey(classId, period, academicYear), studentIds.length],
    enabled: !!classId && studentIds.length > 0,
    staleTime: 30_000,
    queryFn: () => fetchGradesFor(studentIds, period, academicYear),
  });
}

/* ------------------------------------------------------------------ */
/* Enregistrement                                                      */
/* ------------------------------------------------------------------ */

export interface SaveContext {
  classId: string;
  period: string;
  evaluationType: string;
  academicYear: string;
  maxScore: number;
  className?: string;
}

export interface DuplicateConflict {
  studentId: string;
  subjectId: string;
  existingId: string;
  existingScore: number;
  newScore: number;
}

export type SaveResult =
  | { ok: true; inserted: number; updated: number }
  | { ok: false; kind: "conflict"; conflicts: DuplicateConflict[]; saved: { inserted: number; updated: number } }
  | { ok: false; kind: "busy" }
  | { ok: false; kind: "error"; message: string; network: boolean };

function isNetworkError(e: any): boolean {
  const m = String(e?.message ?? e ?? "").toLowerCase();
  return m.includes("failed to fetch") || m.includes("network") || m.includes("load failed") || m.includes("timeout");
}

/**
 * Enregistrement des seules notes modifiées.
 *  - « Une action utilisateur = une opération » : un verrou empêche deux
 *    enregistrements simultanés (double clic, Entrée + clic…).
 *  - Avant toute insertion, on relit la base : si une note existe déjà pour la
 *    même clé (saisie par quelqu'un d'autre entre-temps), on ne crée RIEN et on
 *    renvoie un conflit à résoudre (Modifier / Conserver / Annuler).
 *  - Les insertions utilisent exactement le même contenu que l'écran Notes
 *    existant : le trigger de coefficient et les notifications continuent de
 *    s'appliquer ; les bulletins lisent les mêmes lignes.
 */
export function useSaveGrades() {
  const qc = useQueryClient();
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (ops: SaveOp[], ctx: SaveContext, opts: { overwriteConflicts?: DuplicateConflict[] } = {}): Promise<SaveResult> => {
      // « Une action utilisateur = une opération » : tout appel pendant qu'un
      // enregistrement tourne (double clic, Entrée répétée) est ignoré.
      if (lock.current) return { ok: false, kind: "busy" };
      if (!ops.length && !opts.overwriteConflicts?.length) return { ok: true, inserted: 0, updated: 0 };
      lock.current = true;
      setSaving(true);
      try {
        const inserts = ops.filter((o): o is Extract<SaveOp, { type: "insert" }> => o.type === "insert");
        const updates = ops.filter((o): o is Extract<SaveOp, { type: "update" }> => o.type === "update");

        // 1) contrôle de doublon sur des données fraîches
        const conflicts: DuplicateConflict[] = [];
        let toInsert = inserts;
        if (inserts.length) {
          const fresh = await fetchGradesFor([...new Set(inserts.map((o) => o.studentId))], ctx.period, ctx.academicYear);
          const existing = new Map(
            fresh
              .filter((g) => String(g.evaluation_type ?? "") === ctx.evaluationType)
              .map((g) => [gradeKey({ ...g, evaluation_type: ctx.evaluationType }), g]),
          );
          toInsert = [];
          for (const o of inserts) {
            const hit = existing.get(
              gradeKey({ student_id: o.studentId, subject_id: o.subjectId, period: ctx.period, evaluation_type: ctx.evaluationType, academic_year: ctx.academicYear }),
            );
            if (hit) conflicts.push({ studentId: o.studentId, subjectId: o.subjectId, existingId: hit.id, existingScore: Number(hit.score), newScore: o.score });
            else toInsert.push(o);
          }
        }

        // 2) conflits que l'utilisateur a choisi de « Modifier »
        const overwrite = opts.overwriteConflicts ?? [];
        const allUpdates: Array<{ id: string; score: number; previous: number; studentId: string; subjectId: string }> = [
          ...updates.map((u) => ({ id: u.id, score: u.score, previous: u.previous, studentId: u.studentId, subjectId: u.subjectId })),
          ...overwrite.map((c) => ({ id: c.existingId, score: c.newScore, previous: c.existingScore, studentId: c.studentId, subjectId: c.subjectId })),
        ];
        const pendingConflicts = conflicts.filter((c) => !overwrite.some((o) => o.existingId === c.existingId));

        // 3) écriture
        let inserted = 0;
        if (toInsert.length) {
          const rows = toInsert.map((o) => ({
            student_id: o.studentId,
            subject_id: o.subjectId,
            score: o.score,
            period: ctx.period,
            max_score: ctx.maxScore,
            evaluation_type: ctx.evaluationType,
            academic_year: ctx.academicYear || undefined,
          }));
          const { error } = await supabase.from("grades").insert(rows as any);
          if (error) return { ok: false, kind: "error", message: error.message, network: isNetworkError(error) };
          inserted = rows.length;
        }

        let updated = 0;
        const results = await Promise.all(
          allUpdates.map(async (u) => {
            // `.select("id")` : Postgres/RLS ne renvoie aucune erreur quand une mise à
            // jour est refusée par les droits (0 ligne modifiée). Sans cette lecture,
            // une modification interdite serait comptée comme « enregistrée ».
            const { data, error } = await supabase.from("grades").update({ score: u.score }).eq("id", u.id).select("id");
            const denied = !error && (data ?? []).length === 0;
            return {
              u,
              error: error ?? (denied ? { message: "Modification refusée : cette note n'est pas modifiable avec vos droits." } : null),
            };
          }),
        );
        for (const r of results) if (!r.error) updated++;
        const failed = results.find((r) => r.error);

        // 4) audit : réutilise activity_logs (aucun second système)
        if (inserted) {
          void logActivity({
            action: "create",
            entity_type: "grade",
            entity_label: `${inserted} note(s) — ${ctx.className ?? ctx.classId} · ${ctx.period} · ${ctx.evaluationType}`,
            metadata: { classId: ctx.classId, period: ctx.period, evaluation: ctx.evaluationType, academicYear: ctx.academicYear, count: inserted },
          });
        }
        for (const r of results) {
          if (r.error) continue;
          void logActivity({
            action: "update",
            entity_type: "grade",
            entity_id: r.u.id,
            entity_label: `Note modifiée — ${ctx.className ?? ctx.classId} · ${ctx.period} · ${ctx.evaluationType}`,
            metadata: { studentId: r.u.studentId, subjectId: r.u.subjectId, ancienneValeur: r.u.previous, nouvelleValeur: r.u.score, classId: ctx.classId },
          });
        }

        await qc.invalidateQueries({ queryKey: ["entry-grades"] });
        await qc.invalidateQueries({ queryKey: ["grades"] }); // écran Notes existant

        if (failed?.error) return { ok: false, kind: "error", message: failed.error.message, network: isNetworkError(failed.error) };
        if (pendingConflicts.length) return { ok: false, kind: "conflict", conflicts: pendingConflicts, saved: { inserted, updated } };
        return { ok: true, inserted, updated };
      } catch (e: any) {
        return { ok: false, kind: "error", message: e?.message ?? "Erreur inconnue", network: isNetworkError(e) };
      } finally {
        lock.current = false;
        setSaving(false);
      }
    },
    [qc],
  );

  return { save, saving };
}

/* ------------------------------------------------------------------ */
/* Contexte de travail (« Continuer ma saisie »)                       */
/* ------------------------------------------------------------------ */

export interface WorkContext {
  classId: string;
  subjectId: string; // "all" = toutes les matières
  period: string;
  evaluationType: string;
  mode: "classe" | "eleve" | "intensive";
  lastStudentId: string | null;
  savedAt: number;
}

const CTX_PREFIX = "mbg.notes.context.v1:";
const CTX_TTL_MS = 30 * 24 * 3600 * 1000;

/**
 * Mémorise UNIQUEMENT des identifiants (classe, matière, période…) dans le
 * navigateur, par utilisateur : aucune note, aucune donnée personnelle, aucune
 * nouvelle table. Les erreurs de stockage sont ignorées (mode privé, etc.).
 */
export function useWorkContext() {
  const { user } = useAuth();
  const key = user ? CTX_PREFIX + user.id : null;
  const [ctx, setCtx] = useState<WorkContext | null>(null);

  useEffect(() => {
    if (!key) return setCtx(null);
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as WorkContext) : null;
      setCtx(parsed && Date.now() - parsed.savedAt < CTX_TTL_MS ? parsed : null);
    } catch {
      setCtx(null);
    }
  }, [key]);

  const save = useCallback(
    (next: Omit<WorkContext, "savedAt">) => {
      if (!key) return;
      const full = { ...next, savedAt: Date.now() };
      setCtx(full);
      try {
        localStorage.setItem(key, JSON.stringify(full));
      } catch {
        /* stockage indisponible : on continue sans mémoire */
      }
    },
    [key],
  );

  const clear = useCallback(() => {
    setCtx(null);
    if (!key) return;
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignoré */
    }
  }, [key]);

  return useMemo(() => ({ ctx, save, clear }), [ctx, save, clear]);
}
