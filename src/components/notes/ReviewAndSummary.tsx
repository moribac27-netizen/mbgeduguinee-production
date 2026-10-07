import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchGradesFor } from "@/hooks/useGradeEntry";
import { workItems, type ClassProgress, type ReviewItem } from "@/lib/grade-entry";
import { Kpi, ProgressMeter, TextBar } from "./entry-shared";

/* ------------------------------------------------------------------ */
/* Contrôle final de la classe + correction rapide                      */
/* ------------------------------------------------------------------ */

const KIND_LABEL: Record<string, string> = {
  missing: "Note manquante",
  duplicate: "Doublon",
  above_max: "Hors barème",
  negative: "Note négative",
  max_mismatch: "Barème différent",
  note_while_absent: "Note + absent",
  outlier: "Valeur inhabituelle",
};

export function ReviewPanel({
  className,
  progress,
  items,
  nameOf,
  subjectOf,
  onOpen,
  onStartMissing,
}: {
  className: string;
  progress: ClassProgress;
  items: ReviewItem[];
  nameOf: (studentId: string) => string;
  subjectOf: (subjectId: string) => string;
  onOpen: (item: ReviewItem) => void;
  onStartMissing: () => void;
}) {
  const { counts } = progress;
  const anomalyCount = progress.anomalies.filter((a) => a.severity === "error").length;
  const toCheck = items.filter((i) => i.kind !== "missing");

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2"><ListChecks className="size-5" />Contrôle de la classe — {className}</h3>
          <p className="text-sm text-muted-foreground">{progress.students.length} élève(s)</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Kpi label="🟢 Complets" value={counts.termine} tone="good" />
          <Kpi label="🟠 En cours" value={counts.en_cours} tone={counts.en_cours ? "warn" : "default"} />
          <Kpi label="⚪ Non commencés" value={counts.non_commence} />
          <Kpi label="🔴 À vérifier" value={counts.a_verifier} tone={counts.a_verifier ? "bad" : "default"} />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span><b>Notes manquantes :</b> {progress.missing}</span>
          <span><b>Anomalies :</b> {anomalyCount}</span>
        </div>

        {progress.complete ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="size-4" /> ✅ Toutes les notes attendues ont été saisies.
          </p>
        ) : null}

        {progress.missing > 0 && (
          <Button onClick={onStartMissing} className="gap-2">
            <ListChecks className="size-4" />Commencer les corrections ({progress.missing} note{progress.missing > 1 ? "s" : ""} manquante{progress.missing > 1 ? "s" : ""})
          </Button>
        )}

        <div>
          <h4 className="font-medium mb-2">Notes à vérifier : {toCheck.length}</h4>
          {toCheck.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune anomalie détectée.</p>
          ) : (
            <ol className="space-y-1">
              {toCheck.map((it, i) => (
                <li key={`${it.studentId}|${it.subjectId}|${it.kind}|${i}`}>
                  <button type="button" onClick={() => onOpen(it)} className="w-full text-left rounded-md border px-3 py-2 text-sm hover:bg-muted/60 flex items-start gap-2">
                    <AlertTriangle className="size-4 mt-0.5 text-amber-600 shrink-0" aria-hidden />
                    <span>
                      <b>{nameOf(it.studentId)}</b> — {subjectOf(it.subjectId)} — <span className="font-medium">{KIND_LABEL[it.kind] ?? it.kind}</span>
                      <span className="block text-xs text-muted-foreground">{it.message}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Ma saisie (résumé dynamique)                                         */
/* ------------------------------------------------------------------ */

export function EntrySummary({
  title,
  studentsCount,
  progress,
  lockedCount,
  onContinue,
}: {
  title: string;
  studentsCount: number;
  progress: ClassProgress;
  lockedCount: number;
  onContinue: () => void;
}) {
  const anomalyCount = progress.anomalies.filter((a) => a.severity === "error").length;
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Ma saisie</div>
            <h2 className="font-semibold text-lg">{title}</h2>
          </div>
          <Button onClick={onContinue} disabled={progress.expected === 0}>Continuer ma saisie</Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <Kpi label="Élèves" value={studentsCount} />
          <Kpi label="Notes attendues" value={progress.expected} />
          <Kpi label="Notes saisies" value={progress.filled} tone="good" />
          <Kpi label="Notes manquantes" value={progress.missing} tone={progress.missing ? "warn" : "default"} />
          <Kpi label="Anomalies" value={anomalyCount} tone={anomalyCount ? "bad" : "default"} />
        </div>
        <div>
          <div className="flex items-center justify-between text-sm mb-1"><span>Progression</span><TextBar percent={progress.percent} /></div>
          <ProgressMeter percent={progress.percent} />
        </div>
        {lockedCount > 0 && (
          <p className="text-xs text-muted-foreground">{lockedCount} élève(s) non éligible(s) (cotisation non réglée) ne sont pas comptés.</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Mes travaux (enseignants : classes × matières affectées)             */
/* ------------------------------------------------------------------ */

export function MyWork({
  period,
  evaluationType,
  academicYear,
  classes,
  subjects,
  onPick,
}: {
  period: string;
  evaluationType: string;
  academicYear: string;
  classes: any[];
  subjects: any[];
  onPick: (classId: string, subjectId: string) => void;
}) {
  const { user } = useAuth();

  const assignments = useQuery({
    queryKey: ["mywork-assignments", user?.id ?? null],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: teachers } = await supabase.from("teachers").select("id").eq("user_id", user!.id);
      const ids = (teachers ?? []).map((t: any) => t.id);
      if (!ids.length) return [] as Array<{ class_id: string; subject_id: string | null }>;
      const { data } = await supabase.from("teacher_class_assignments").select("class_id, subject_id").in("teacher_id", ids);
      return (data ?? []) as Array<{ class_id: string; subject_id: string | null }>;
    },
  });

  const pairs = useMemo(() => {
    const out = new Map<string, { classId: string; subjectId: string }>();
    for (const a of assignments.data ?? []) {
      const subs = a.subject_id ? [a.subject_id] : subjects.map((s: any) => s.id);
      for (const sid of subs) out.set(`${a.class_id}|${sid}`, { classId: a.class_id, subjectId: sid });
    }
    return [...out.values()];
  }, [assignments.data, subjects]);

  const classIds = useMemo(() => [...new Set(pairs.map((p) => p.classId))], [pairs]);

  const data = useQuery({
    queryKey: ["mywork-data", classIds.join(","), period, academicYear],
    enabled: classIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: studs } = await supabase.from("students").select("id, class_id").in("class_id", classIds);
      const students = (studs ?? []) as Array<{ id: string; class_id: string }>;
      const grades = await fetchGradesFor(students.map((s) => s.id), period, academicYear);
      return { students, grades };
    },
  });

  const items = useMemo(() => {
    if (!data.data) return [];
    const byClass = new Map<string, Array<{ id: string }>>();
    for (const s of data.data.students) byClass.set(s.class_id, [...(byClass.get(s.class_id) ?? []), { id: s.id }]);
    return workItems({ pairs, classStudents: byClass, grades: data.data.grades, ctx: { period, evaluationType, academicYear } }).sort(
      (a, b) => Number(a.done) - Number(b.done) || b.missing - a.missing,
    );
  }, [data.data, pairs, period, evaluationType, academicYear]);

  if (!pairs.length) return null; // direction : pas d'affectations → rien à afficher
  const clsName = (id: string) => classes.find((c: any) => c.id === id)?.name ?? "—";
  const subName = (id: string) => subjects.find((s: any) => s.id === id)?.name ?? "—";

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <h3 className="font-semibold">Mes travaux</h3>
        {data.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        <ul className="divide-y">
          {items.map((w) => (
            <li key={`${w.classId}|${w.subjectId}`} className="flex flex-wrap items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{clsName(w.classId)} — {subName(w.subjectId)}</div>
                <div className="text-xs text-muted-foreground">
                  {w.done ? "✅ Terminé" : `${w.missing} note${w.missing > 1 ? "s" : ""} manquante${w.missing > 1 ? "s" : ""}`}
                </div>
              </div>
              <div className="w-40"><ProgressMeter percent={w.percent} /></div>
              <Button size="sm" variant={w.done ? "outline" : "default"} onClick={() => onPick(w.classId, w.subjectId)}>
                {w.done ? "Revoir" : "Continuer"}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
