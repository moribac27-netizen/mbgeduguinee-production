import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, PlayCircle, RotateCcw, Save, ListChecks } from "lucide-react";
import { maxScoreForLevel } from "@/lib/grading";
import { useScopedClassOptions } from "@/hooks/useOptions";
import { usePerStudentPlan, usePaidStudentIds } from "@/hooks/usePerStudentPlan";
import {
  DEFAULT_EVALUATION, ENTRY_PERIODS, EVALUATION_TYPES, fetchGradesFor,
  useClassStudents, useEntryGrades, useSaveGrades, useWorkContext,
  type DuplicateConflict, type SaveContext, type WorkContext,
} from "@/hooks/useGradeEntry";
import {
  buildCells, classProgress, diffDrafts, markKey, needsAttention, nextStudentId, previousStudentId,
  reviewItems, workItems, parseScoreInput, type Cell, type NextMode, type ReviewItem, type SaveOp,
} from "@/lib/grade-entry";
import { ClassGridView } from "./ClassGridView";
import { FilterBar, IntensiveView, StudentFormView, StudentList, type ListFilters } from "./StudentViews";
import { EntrySummary, MyWork, ReviewPanel } from "./ReviewAndSummary";
import { scoreText } from "./entry-shared";

type Mode = "classe" | "eleve" | "intensive";
const ALL = "all";

/**
 * La validation définitive de la saisie et le marquage « absent » en masse
 * demandent un stockage dédié (nouvelles tables) qui n'est pas encore créé.
 * Tant que ce n'est pas le cas, ces deux fonctions restent masquées plutôt que
 * d'afficher des boutons sans effet.
 */
export const VALIDATION_ENABLED = false;

const EMPTY: any[] = []; // référence stable : évite des recalculs à chaque rendu
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface SavePlan {
  ops: SaveOp[];
  scope?: string;
  then?: () => void;
}

export function SmartEntry() {
  const { classes } = useScopedClassOptions();
  const { info: planInfo } = usePerStudentPlan();
  const { isUnlocked } = usePaidStudentIds(planInfo.schoolId, planInfo.academicYear, planInfo.isPerStudent);
  const academicYear = planInfo.academicYear;

  const { data: subjectsData } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [],
  });
  const subjects: any[] = subjectsData ?? EMPTY;

  // ---- contexte de travail ----
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [period, setPeriod] = useState("T1");
  const [evalType, setEvalType] = useState<string>(DEFAULT_EVALUATION);
  const [mode, setMode] = useState<Mode>("classe");
  const [started, setStarted] = useState(false);

  // ---- saisie ----
  const [drafts, setDrafts] = useState<Map<string, string>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ListFilters>({ search: "", onlyTodo: false, status: "all" });
  const [smartNext, setSmartNext] = useState(true);
  const [showReview, setShowReview] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const retryPlan = useRef<SavePlan | null>(null);

  // ---- boîtes de dialogue ----
  const [guardAction, setGuardAction] = useState<null | (() => void)>(null);
  const [largeConfirm, setLargeConfirm] = useState<null | (SavePlan & { large: Array<Extract<SaveOp, { type: "update" }>> })>(null);
  const [conflictPlan, setConflictPlan] = useState<null | (SavePlan & { conflicts: DuplicateConflict[] })>(null);

  const { save, saving } = useSaveGrades();
  const work = useWorkContext();

  // ---- données ----
  const cls = classes.find((c: any) => c.id === classId);
  const maxScore = maxScoreForLevel(cls?.level);
  const studentsQ = useClassStudents(classId);
  const allStudents: any[] = studentsQ.data ?? EMPTY;
  const eligible = useMemo(
    () => allStudents.filter((s) => !(planInfo.isPerStudent && !isUnlocked(s.id))),
    [allStudents, planInfo.isPerStudent, isUnlocked],
  );
  const lockedCount = allStudents.length - eligible.length;
  const eligibleIds = useMemo(() => eligible.map((s) => s.id), [eligible]);
  const gradesQ = useEntryGrades(classId, eligibleIds, period, academicYear);
  const grades: any[] = gradesQ.data ?? EMPTY;

  const subjectsInScope = useMemo(
    () => (subjectId === ALL ? subjects : subjects.filter((s: any) => s.id === subjectId)),
    [subjects, subjectId],
  );
  const subjectName = (id: string) => subjects.find((s: any) => s.id === id)?.name ?? "—";

  const ctx = useMemo(
    () => ({ classId, subjectIds: subjectsInScope.map((s: any) => s.id), period, evaluationType: evalType, academicYear, maxScore }),
    [classId, subjectsInScope, period, evalType, academicYear, maxScore],
  );
  const cells = useMemo(() => buildCells({ ctx, students: eligible, grades }), [ctx, eligible, grades]);
  const cellsByStudent = useMemo(() => {
    const m = new Map<string, Map<string, Cell>>();
    for (const c of cells) {
      const inner = m.get(c.studentId) ?? new Map<string, Cell>();
      inner.set(c.subjectId, c);
      m.set(c.studentId, inner);
    }
    return m;
  }, [cells]);
  const progress = useMemo(() => classProgress(eligibleIds, cells), [eligibleIds, cells]);
  const progressByStudent = useMemo(() => new Map(progress.students.map((p) => [p.studentId, p])), [progress]);
  const items = useMemo(() => reviewItems(cells), [cells]);

  const diff = useMemo(() => diffDrafts({ drafts, cells, maxScore }), [drafts, cells, maxScore]);
  const pendingCount = diff.ops.length + diff.invalid.length;
  const hasPending = pendingCount > 0;
  const draftIds = useMemo(() => new Set([...drafts.keys()].map((k) => k.split("|")[0])), [drafts]);

  const visible = useMemo(() => {
    const q = norm(filters.search.trim());
    return eligible.filter((s) => {
      if (q && !norm(`${s.full_name} ${s.matricule ?? ""}`).includes(q)) return false;
      const p = progressByStudent.get(s.id);
      if (filters.onlyTodo && p && !needsAttention(p)) return false;
      if (filters.status !== "all" && p?.status !== filters.status) return false;
      return true;
    });
  }, [eligible, filters, progressByStudent]);
  const visibleIds = useMemo(() => visible.map((s) => s.id), [visible]);

  const singleSubject = subjectId !== ALL && !!subjectId;
  const currentStudent = eligible.find((s) => s.id === currentId) ?? null;
  const intensiveSubject = singleSubject ? subjects.find((s: any) => s.id === subjectId) : null;

  // ---- protections ----
  useEffect(() => {
    if (!hasPending) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [hasPending]);

  /** Exécute `action` tout de suite, ou après avis de l'utilisateur s'il y a des modifications non enregistrées. */
  const guard = useCallback(
    (action: () => void) => {
      if (hasPending) setGuardAction(() => action);
      else action();
    },
    [hasPending],
  );

  // ---- brouillons ----
  const setDraft = useCallback(
    (studentId: string, subjectIdArg: string, text: string) => {
      const key = markKey(studentId, subjectIdArg);
      const cell = cellsByStudent.get(studentId)?.get(subjectIdArg);
      const saved = cell?.rows.length === 1 ? scoreText(Number(cell.rows[0].score)) : "";
      const a = parseScoreInput(text, maxScore);
      const b = parseScoreInput(saved, maxScore);
      const same = text.trim() === saved || (a.kind === "empty" && b.kind === "empty") || (a.kind === "ok" && b.kind === "ok" && a.value === b.value);
      setDrafts((prev) => {
        const next = new Map(prev);
        if (same) next.delete(key);
        else next.set(key, text);
        return next;
      });
      setErrors((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    },
    [cellsByStudent, maxScore],
  );

  const dropDrafts = useCallback((keys: string[]) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      keys.forEach((k) => next.delete(k));
      return next;
    });
  }, []);

  // ---- enregistrement ----
  const saveCtx: SaveContext = { classId, period, evaluationType: evalType, academicYear, maxScore, className: cls?.name };

  const perform = useCallback(
    async (plan: SavePlan) => {
      setFailed(null);
      retryPlan.current = plan;
      const res = await save(plan.ops, saveCtx);
      if (res.ok) {
        const n = res.inserted + res.updated;
        const emptyKeys = [...drafts].filter(([, v]) => parseScoreInput(v, maxScore).kind === "empty").map(([k]) => k);
        dropDrafts([...plan.ops.map((o) => markKey(o.studentId, o.subjectId)), ...emptyKeys]);
        toast.success(n > 0 ? `✅ ${n} note${n > 1 ? "s" : ""} enregistrée${n > 1 ? "s" : ""}.` : "Aucune modification à enregistrer.");
        retryPlan.current = null;
        plan.then?.();
      } else if (res.kind === "conflict") {
        const conflictKeys = new Set(res.conflicts.map((c) => markKey(c.studentId, c.subjectId)));
        dropDrafts(plan.ops.map((o) => markKey(o.studentId, o.subjectId)).filter((k) => !conflictKeys.has(k)));
        setConflictPlan({ ...plan, conflicts: res.conflicts });
        toast.warning("⚠️ Cette note existe déjà.");
      } else if (res.kind === "error") {
        // Les données saisies restent dans l'écran : rien n'est effacé.
        setFailed(res.message);
        toast.error(res.network ? "❌ Enregistrement impossible : connexion perdue." : `❌ Enregistrement impossible : ${res.message}`);
      }
      // kind === "busy" : un enregistrement tourne déjà → ignoré, aucune requête dupliquée.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [save, saveCtx.classId, saveCtx.period, saveCtx.evaluationType, saveCtx.academicYear, saveCtx.maxScore, drafts, dropDrafts, maxScore],
  );

  const requestSave = useCallback(
    (scope?: string, then?: () => void) => {
      const scoped = scope ? new Map([...drafts].filter(([k]) => k.startsWith(scope + "|"))) : drafts;
      const d = diffDrafts({ drafts: scoped, cells, maxScore });
      if (d.invalid.length) {
        setErrors((prev) => {
          const next = new Map(prev);
          d.invalid.forEach((i) => next.set(markKey(i.studentId, i.subjectId), i.reason));
          return next;
        });
        toast.error(`❌ ${d.invalid.length} note${d.invalid.length > 1 ? "s" : ""} invalide${d.invalid.length > 1 ? "s" : ""}.`);
        return;
      }
      if (!d.ops.length) {
        // rien à envoyer (cases vides / valeurs inchangées) : on enchaîne sans requête
        const emptyKeys = [...scoped].filter(([, v]) => parseScoreInput(v, maxScore).kind === "empty").map(([k]) => k);
        if (emptyKeys.length) dropDrafts(emptyKeys);
        then?.();
        return;
      }
      const large = d.ops.filter((o): o is Extract<SaveOp, { type: "update" }> => o.type === "update" && o.large);
      if (large.length) {
        setLargeConfirm({ ops: d.ops, scope, then, large });
        return;
      }
      void perform({ ops: d.ops, scope, then });
    },
    [drafts, cells, maxScore, perform, dropDrafts],
  );

  function discardAll() {
    setDrafts(new Map());
    setErrors(new Map());
    setFailed(null);
  }

  // ---- navigation entre élèves ----
  const computeNext = useCallback(
    (from: string | null, m: NextMode) =>
      nextStudentId({ orderedIds: visibleIds.length ? visibleIds : eligibleIds, currentId: from, progress: progressByStudent, draftIds, mode: m }),
    [visibleIds, eligibleIds, progressByStudent, draftIds],
  );
  const goNext = useCallback(() => guard(() => setCurrentId(computeNext(currentId, smartNext ? "smart" : "sequential") ?? currentId)), [guard, computeNext, currentId, smartNext]);
  const goPrev = useCallback(() => guard(() => setCurrentId(previousStudentId(visibleIds.length ? visibleIds : eligibleIds, currentId) ?? currentId)), [guard, visibleIds, eligibleIds, currentId]);
  const selectStudent = useCallback((id: string) => guard(() => setCurrentId(id)), [guard]);

  // un élève courant valide dès qu'on entre en vue élève / intensive
  useEffect(() => {
    if (!started || mode === "classe" || !eligibleIds.length) return;
    if (currentId && eligibleIds.includes(currentId)) return;
    setCurrentId(computeNext(null, "smart") ?? eligibleIds[0]);
  }, [started, mode, eligibleIds, currentId, computeNext]);

  // mémorisation du contexte (identifiants seulement)
  useEffect(() => {
    if (!started || !classId || !subjectId) return;
    work.save({ classId, subjectId, period, evaluationType: evalType, mode, lastStudentId: currentId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, classId, subjectId, period, evalType, mode, currentId]);

  // ---- démarrage / reprise ----
  const canStart = !!classId && !!subjectId && !!period && !!evalType;
  function start(asMode?: Mode) {
    setStarted(true);
    setShowReview(false);
    setMode(asMode ?? mode);
  }
  function continueEntry() {
    setShowReview(false);
    setFilters((f) => ({ ...f, onlyTodo: false, search: "" }));
    const next = nextStudentId({ orderedIds: eligibleIds, currentId: null, progress: progressByStudent, draftIds, mode: "smart" });
    if (next) setCurrentId(next);
    setMode(singleSubject ? "intensive" : "eleve");
  }
  function resume(c: WorkContext) {
    setClassId(c.classId);
    setSubjectId(c.subjectId);
    setPeriod(c.period);
    setEvalType(c.evaluationType);
    setMode(c.mode);
    setCurrentId(c.lastStudentId);
    setStarted(true);
  }
  function pickWork(cId: string, sId: string) {
    setClassId(cId);
    setSubjectId(sId);
    setMode("intensive");
    setCurrentId(null);
    setStarted(true);
  }
  function editContext() {
    guard(() => {
      discardAll();
      setStarted(false);
      setCurrentId(null);
    });
  }

  // ---- contrôle / corrections ----
  function openItem(it: ReviewItem) {
    guard(() => {
      setShowReview(false);
      setCurrentId(it.studentId);
      setMode(singleSubject ? "intensive" : "eleve");
    });
  }
  function startMissing() {
    guard(() => {
      setShowReview(false);
      setFilters({ search: "", status: "all", onlyTodo: true });
      const first = eligibleIds.find((id) => (progressByStudent.get(id)?.missing ?? 0) > 0) ?? eligibleIds[0];
      setCurrentId(first ?? null);
      setMode(singleSubject ? "intensive" : "eleve");
    });
  }

  // ---- clavier ----
  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      requestSave(mode === "classe" ? undefined : currentId ?? undefined);
    } else if (e.altKey && mode !== "classe" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      if (e.key === "ArrowRight") goNext();
      else goPrev();
    }
  }

  const position = useMemo(() => {
    const list = visibleIds.includes(currentId ?? "") ? visibleIds : eligibleIds;
    const i = list.indexOf(currentId ?? "");
    return i >= 0 ? { index: i + 1, total: list.length } : null;
  }, [visibleIds, eligibleIds, currentId]);
  const remaining = useMemo(() => progress.students.filter((p) => needsAttention(p)).length, [progress]);

  const title = `${cls?.name ?? "—"} — ${subjectId === ALL ? "Toutes les matières" : subjectName(subjectId)}`;
  const nameOf = (id: string) => allStudents.find((s) => s.id === id)?.full_name ?? "—";

  /* ================================================================ */
  /* RENDU                                                             */
  /* ================================================================ */

  if (!started) {
    return (
      <div className="space-y-4">
        {work.ctx && (
          <ResumeBanner
            ctx={work.ctx}
            classes={classes}
            subjects={subjects}
            academicYear={academicYear}
            onContinue={() => resume(work.ctx!)}
            onDismiss={work.clear}
          />
        )}

        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <h2 className="font-semibold text-lg">Préparer la saisie</h2>
              <p className="text-sm text-muted-foreground">Choisissez le contexte avant de modifier la moindre note.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Step n={1} label="Classe">
                <Select value={classId} onValueChange={(v) => { setClassId(v); setSubjectId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Choisir une classe" /></SelectTrigger>
                  <SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.level}</SelectItem>)}</SelectContent>
                </Select>
              </Step>
              <Step n={2} label="Matière">
                <Select value={subjectId} onValueChange={setSubjectId} disabled={!classId}>
                  <SelectTrigger><SelectValue placeholder="Choisir une matière" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Toutes les matières</SelectItem>
                    {subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Step>
              <Step n={3} label="Période">
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ENTRY_PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
                </Select>
              </Step>
              <Step n={4} label="Type d'évaluation">
                <Select value={evalType} onValueChange={setEvalType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EVALUATION_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                </Select>
              </Step>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => start()} disabled={!canStart} className="gap-2"><PlayCircle className="size-4" />5. Commencer la saisie</Button>
              {classId && studentsQ.isLoading && <span className="text-sm text-muted-foreground">Chargement des élèves…</span>}
            </div>
          </CardContent>
        </Card>

        <MyWork period={period} evaluationType={evalType} academicYear={academicYear} classes={classes} subjects={subjects} onPick={pickWork} />
      </div>
    );
  }

  return (
    <div className="space-y-4" onKeyDown={onKeyDown}>
      {/* contexte sélectionné, toujours visible */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <span className="font-semibold">{cls?.name}</span>
        <span>· {subjectId === ALL ? "Toutes les matières" : subjectName(subjectId)}</span>
        <span>· {ENTRY_PERIODS.find((p) => p.v === period)?.l}</span>
        <span>· {EVALUATION_TYPES.find((t) => t.v === evalType)?.l}</span>
        <span>· sur {maxScore}</span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={editContext}>Modifier le contexte</Button>
      </div>

      <EntrySummary title={title} studentsCount={eligible.length} progress={progress} lockedCount={lockedCount} onContinue={continueEntry} />

      {progress.complete && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 flex flex-wrap items-center gap-3">
          <span>✅ Toutes les notes attendues ont été saisies.</span>
          <Button size="sm" variant="outline" onClick={() => setShowReview(true)}>Vérifier</Button>
          {VALIDATION_ENABLED && <Button size="sm">Valider la saisie</Button>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={mode} onValueChange={(v) => guard(() => { setMode(v as Mode); setShowReview(false); })}>
          <TabsList>
            <TabsTrigger value="classe">Vue Classe</TabsTrigger>
            <TabsTrigger value="eleve">Vue Élève</TabsTrigger>
            <TabsTrigger value="intensive">Saisie intensive</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant={showReview ? "default" : "outline"} size="sm" className="gap-2" onClick={() => setShowReview((v) => !v)}>
          <ListChecks className="size-4" />Contrôle &amp; corrections ({items.filter((i) => i.kind !== "missing").length + progress.missing})
        </Button>
      </div>

      {(gradesQ.isLoading || studentsQ.isLoading) && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {(gradesQ.error || studentsQ.error) && <p className="text-sm text-red-700">❌ Chargement impossible. Vérifiez votre connexion puis rechargez la page.</p>}

      {showReview ? (
        <ReviewPanel
          className={cls?.name ?? ""}
          progress={progress}
          items={items}
          nameOf={nameOf}
          subjectOf={subjectName}
          onOpen={openItem}
          onStartMissing={startMissing}
        />
      ) : (
        <>
          <FilterBar value={filters} onChange={setFilters} total={eligible.length} shown={visible.length} />

          {mode === "classe" && (
            <Card>
              <CardContent className="p-3">
                <ClassGridView
                  students={visible}
                  subjects={subjectsInScope}
                  cellsByStudent={cellsByStudent}
                  progressByStudent={progressByStudent}
                  drafts={drafts}
                  errors={errors}
                  onDraft={setDraft}
                  onOpenStudent={(id) => guard(() => { setCurrentId(id); setMode("eleve"); })}
                />
              </CardContent>
            </Card>
          )}

          {mode === "eleve" && (
            <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
              <StudentList students={visible} progressByStudent={progressByStudent} currentId={currentId} draftIds={draftIds} onSelect={selectStudent} />
              <StudentFormView
                student={currentStudent}
                subjects={subjectsInScope}
                cells={currentId ? cellsByStudent.get(currentId) : undefined}
                progress={currentId ? progressByStudent.get(currentId) : undefined}
                maxScore={maxScore}
                drafts={drafts}
                errors={errors}
                position={position}
                saving={saving}
                onDraft={setDraft}
                onPrev={goPrev}
                onNext={goNext}
                onSave={() => requestSave(currentId ?? undefined)}
              />
            </div>
          )}

          {mode === "intensive" && !intensiveSubject && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm">La saisie intensive se fait matière par matière. Choisissez la matière à saisir :</p>
                <div className="flex flex-wrap gap-2">
                  {subjects.map((s: any) => (
                    <Button key={s.id} variant="outline" size="sm" onClick={() => guard(() => setSubjectId(s.id))}>{s.name}</Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {mode === "intensive" && intensiveSubject && (
            <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
              <div className="hidden lg:block">
                <StudentList students={visible} progressByStudent={progressByStudent} currentId={currentId} draftIds={draftIds} onSelect={selectStudent} />
              </div>
              <IntensiveView
                student={currentStudent}
                subject={intensiveSubject}
                cell={currentId ? cellsByStudent.get(currentId)?.get(intensiveSubject.id) : undefined}
                progress={currentId ? progressByStudent.get(currentId) : undefined}
                maxScore={maxScore}
                draft={currentId ? drafts.get(markKey(currentId, intensiveSubject.id)) : undefined}
                error={currentId ? errors.get(markKey(currentId, intensiveSubject.id)) : undefined}
                position={position}
                saving={saving}
                smartNext={smartNext}
                onlyTodo={filters.onlyTodo}
                remaining={remaining}
                onSmartNext={setSmartNext}
                onOnlyTodo={(v) => setFilters((f) => ({ ...f, onlyTodo: v }))}
                onDraft={(t) => currentId && setDraft(currentId, intensiveSubject.id, t)}
                onPrev={goPrev}
                onSkip={goNext}
                onSave={() => requestSave(currentId ?? undefined)}
                onSaveNext={() =>
                  requestSave(currentId ?? undefined, () => setCurrentId(computeNext(currentId, smartNext ? "smart" : "sequential") ?? currentId))
                }
              />
            </div>
          )}
        </>
      )}

      {/* barre d'enregistrement */}
      {(hasPending || failed) && (
        <div className="sticky bottom-3 z-20 rounded-xl border bg-background/95 shadow-lg backdrop-blur px-4 py-3 flex flex-wrap items-center gap-3" role="status">
          {failed ? (
            <>
              <span className="text-sm text-red-700 flex-1">❌ Enregistrement impossible. Vos données saisies sont conservées.</span>
              <Button onClick={() => retryPlan.current && void perform(retryPlan.current)} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}Réessayer
              </Button>
            </>
          ) : (
            <>
              <span className="text-sm flex-1">✎ {pendingCount} modification{pendingCount > 1 ? "s" : ""} non enregistrée{pendingCount > 1 ? "s" : ""}</span>
              <Button variant="ghost" onClick={discardAll} disabled={saving}>Annuler les modifications</Button>
              <Button onClick={() => requestSave(undefined)} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Enregistrer <kbd className="hidden sm:inline text-[10px] opacity-70">Ctrl+S</kbd>
              </Button>
            </>
          )}
        </div>
      )}

      {/* modifications non enregistrées */}
      <AlertDialog open={!!guardAction} onOpenChange={(o) => !o && setGuardAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Des modifications ne sont pas enregistrées.</AlertDialogTitle>
            <AlertDialogDescription>{pendingCount} modification{pendingCount > 1 ? "s" : ""} en cours. Que souhaitez-vous faire ?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-wrap">
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button variant="outline" onClick={() => { const a = guardAction; setGuardAction(null); discardAll(); a?.(); }}>Continuer sans enregistrer</Button>
            <AlertDialogAction onClick={() => { const a = guardAction; setGuardAction(null); requestSave(undefined, a ?? undefined); }}>Enregistrer et continuer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* modification importante d'une note existante */}
      <AlertDialog open={!!largeConfirm} onOpenChange={(o) => !o && setLargeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Modification importante</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">Vérification recommandée avant d'enregistrer :</p>
                <ul className="space-y-1 text-foreground">
                  {largeConfirm?.large.map((o) => (
                    <li key={`${o.studentId}|${o.subjectId}`}>
                      <b>{nameOf(o.studentId)}</b> — {subjectName(o.subjectId)} : {scoreText(o.previous)} → <b>{scoreText(o.score)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const p = largeConfirm; setLargeConfirm(null); if (p) void perform(p); }}>Confirmer et enregistrer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* doublon détecté au moment d'enregistrer */}
      <AlertDialog open={!!conflictPlan} onOpenChange={(o) => !o && setConflictPlan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Cette note existe déjà.</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">Aucune nouvelle ligne n'a été créée. Pour chaque note ci-dessous, voulez-vous remplacer la valeur enregistrée ?</p>
                <ul className="space-y-1 text-foreground">
                  {conflictPlan?.conflicts.map((c) => (
                    <li key={c.existingId}>
                      <b>{nameOf(c.studentId)}</b> — {subjectName(c.subjectId)} : enregistrée <b>{scoreText(c.existingScore)}</b>, saisie <b>{scoreText(c.newScore)}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-wrap">
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                const p = conflictPlan;
                setConflictPlan(null);
                if (p) {
                  dropDrafts(p.conflicts.map((c) => markKey(c.studentId, c.subjectId)));
                  p.then?.();
                }
              }}
            >
              Conserver l'existante
            </Button>
            <AlertDialogAction
              onClick={async () => {
                const p = conflictPlan;
                setConflictPlan(null);
                if (!p) return;
                const res = await save([], saveCtx, { overwriteConflicts: p.conflicts });
                if (res.ok) {
                  dropDrafts(p.conflicts.map((c) => markKey(c.studentId, c.subjectId)));
                  toast.success(`✅ ${p.conflicts.length} note${p.conflicts.length > 1 ? "s" : ""} modifiée${p.conflicts.length > 1 ? "s" : ""}.`);
                  p.then?.();
                } else if (res.kind === "error") {
                  setFailed(res.message);
                  toast.error("❌ Enregistrement impossible.");
                }
              }}
            >
              Modifier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="flex items-center gap-1.5 mb-1">
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">{n}</span>
        {label}
      </Label>
      {children}
    </div>
  );
}

/** « Vous avez une saisie en cours » : reprise en un clic (identifiants uniquement). */
function ResumeBanner({
  ctx, classes, subjects, academicYear, onContinue, onDismiss,
}: {
  ctx: WorkContext; classes: any[]; subjects: any[]; academicYear: string; onContinue: () => void; onDismiss: () => void;
}) {
  const cls = classes.find((c: any) => c.id === ctx.classId);
  const single = ctx.subjectId !== ALL;
  const { data } = useQuery({
    queryKey: ["resume-progress", ctx.classId, ctx.subjectId, ctx.period, ctx.evaluationType, academicYear],
    enabled: !!cls && single && !!academicYear,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: studs } = await supabase.from("students").select("id").eq("class_id", ctx.classId);
      const students = (studs ?? []) as Array<{ id: string }>;
      const grades = await fetchGradesFor(students.map((s) => s.id), ctx.period, academicYear);
      const [w] = workItems({
        pairs: [{ classId: ctx.classId, subjectId: ctx.subjectId }],
        classStudents: new Map([[ctx.classId, students]]),
        grades,
        ctx: { period: ctx.period, evaluationType: ctx.evaluationType, academicYear },
      });
      return w;
    },
  });
  if (!cls) return null; // classe plus accessible : on n'affiche rien
  const sub = single ? subjects.find((s: any) => s.id === ctx.subjectId)?.name ?? "—" : "Toutes les matières";
  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="p-4 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-60">
          <div className="font-semibold">Vous avez une saisie en cours</div>
          <div className="text-sm text-muted-foreground">
            Classe : {cls.name} · Matière : {sub} · Période : {ENTRY_PERIODS.find((p) => p.v === ctx.period)?.l} · Évaluation : {EVALUATION_TYPES.find((t) => t.v === ctx.evaluationType)?.l}
          </div>
          {data && <div className="text-sm mt-1">Progression : {data.filled}/{data.expected} élèves</div>}
        </div>
        <Button onClick={onContinue}>Continuer</Button>
        <Button variant="ghost" size="sm" onClick={onDismiss}>Ignorer</Button>
      </CardContent>
    </Card>
  );
}
