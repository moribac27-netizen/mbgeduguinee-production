import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { StudentPhoto } from "@/components/StudentPhoto";
import { ArrowLeft, ArrowRight, Loader2, Save, Search } from "lucide-react";
import type { Cell, StudentProgress, StudentStatus } from "@/lib/grade-entry";
import { STATUS_LABELS, markKey } from "@/lib/grade-entry";
import { ProgressMeter, ScoreInput, StatusBadge, scoreText } from "./entry-shared";

/* ------------------------------------------------------------------ */
/* Filtres + liste intelligente des élèves                              */
/* ------------------------------------------------------------------ */

export interface ListFilters {
  search: string;
  onlyTodo: boolean;
  status: StudentStatus | "all";
}

export function FilterBar({ value, onChange, total, shown }: { value: ListFilters; onChange: (v: ListFilters) => void; total: number; shown: number }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input
          value={value.search}
          onChange={(e) => onChange({ ...value, search: e.target.value })}
          placeholder="Rechercher : nom, prénom ou matricule"
          className="pl-8"
          aria-label="Rechercher un élève"
        />
      </div>
      <select
        className="h-9 rounded-md border bg-background px-2 text-sm"
        value={value.status}
        onChange={(e) => onChange({ ...value, status: e.target.value as ListFilters["status"] })}
        aria-label="Filtrer par statut"
      >
        <option value="all">Tous les statuts</option>
        {(Object.keys(STATUS_LABELS) as StudentStatus[]).map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s].icon} {STATUS_LABELS[s].label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2 pb-1">
        <Switch id="only-todo" checked={value.onlyTodo} onCheckedChange={(v) => onChange({ ...value, onlyTodo: v })} />
        <Label htmlFor="only-todo" className="cursor-pointer">À traiter</Label>
      </div>
      <span className="text-xs text-muted-foreground pb-2">{shown} / {total} élève(s)</span>
    </div>
  );
}

export function StudentList({
  students,
  progressByStudent,
  currentId,
  draftIds,
  onSelect,
}: {
  students: any[];
  progressByStudent: Map<string, StudentProgress>;
  currentId: string | null;
  draftIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: "nearest" });
  }, [currentId]);

  return (
    <ul className="max-h-[60vh] overflow-y-auto rounded-lg border divide-y" role="listbox" aria-label="Liste des élèves">
      {students.length === 0 && <li className="p-4 text-sm text-center text-muted-foreground">Aucun élève avec ces filtres.</li>}
      {students.map((s) => {
        const p = progressByStudent.get(s.id);
        const isCurrent = s.id === currentId;
        return (
          <li key={s.id}>
            <button
              ref={isCurrent ? active : undefined}
              type="button"
              role="option"
              aria-selected={isCurrent}
              onClick={() => onSelect(s.id)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/60 ${isCurrent ? "bg-primary/10 border-l-4 border-primary" : "border-l-4 border-transparent"}`}
            >
              <StudentPhoto path={s.photo_url} name={s.full_name} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{s.full_name}</span>
                <span className="block text-[11px] font-mono text-muted-foreground">{s.matricule}</span>
                {p && <ProgressMeter percent={p.percent} className="mt-0.5" />}
              </span>
              <span className="flex flex-col items-end gap-1">
                {p && <StatusBadge status={p.status} />}
                {draftIds.has(s.id) && <span className="text-[10px] text-sky-700 font-medium">✎ non enregistré</span>}
                {p && <span className="text-[10px] text-muted-foreground">{p.filled} saisie(s) · {p.missing} restante(s)</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* VUE ÉLÈVE                                                           */
/* ------------------------------------------------------------------ */

interface StudentViewProps {
  student: any | null;
  subjects: any[];
  cells: Map<string, Cell> | undefined;
  progress: StudentProgress | undefined;
  maxScore: number;
  drafts: Map<string, string>;
  errors: Map<string, string>;
  position: { index: number; total: number } | null;
  saving: boolean;
  onDraft: (studentId: string, subjectId: string, text: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
}

export function StudentFormView({ student, subjects, cells, progress, maxScore, drafts, errors, position, saving, onDraft, onPrev, onNext, onSave }: StudentViewProps) {
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    first.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [student?.id]);

  if (!student) {
    return <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Choisissez un élève dans la liste pour afficher l'ensemble de ses notes.</div>;
  }
  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-3">
        <StudentPhoto path={student.photo_url} name={student.full_name} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold leading-tight">{student.full_name}</h3>
          <div className="text-xs text-muted-foreground font-mono">{student.matricule}</div>
          {progress && (
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={progress.status} />
              <span className="text-xs text-muted-foreground">{progress.filled} / {progress.expected} note(s)</span>
            </div>
          )}
        </div>
        {position && <div className="text-sm text-muted-foreground tabular-nums">Élève {position.index} / {position.total}</div>}
      </div>

      <div ref={first} data-student-form className="grid gap-2 sm:grid-cols-2">
        {subjects.map((sub, i) => {
          const k = markKey(student.id, sub.id);
          const cell = cells?.get(sub.id);
          const dup = (cell?.rows.length ?? 0) > 1;
          const value = drafts.has(k) ? (drafts.get(k) as string) : scoreText(cell?.rows.length === 1 ? Number(cell.rows[0].score) : null);
          const err = errors.get(k);
          return (
            <div key={sub.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <Label className="font-medium">{sub.name}</Label>
                <div className="text-[11px] text-muted-foreground">coef {sub.coefficient} · sur {maxScore}</div>
                {dup && <div className="text-[11px] text-red-700">⚠️ Doublon : {cell!.anomalies[0]?.message}</div>}
                {!dup && cell?.anomalies[0] && <div className="text-[11px] text-amber-700">⚠️ {cell.anomalies[0].message}</div>}
                {err && <div className="text-[11px] text-red-700">❌ {err}</div>}
              </div>
              <ScoreInput
                row={i}
                col={0}
                value={value}
                disabled={dup}
                changed={drafts.has(k)}
                invalid={!!err}
                aria-label={`Note en ${sub.name}`}
                onValue={(v) => onDraft(student.id, sub.id, v)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const root = (e.currentTarget.closest("[data-student-form]") ?? document) as HTMLElement;
                  const next = root.querySelector<HTMLInputElement>(`input[data-row="${i + (e.shiftKey ? -1 : 1)}"]`);
                  next?.focus();
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onPrev} className="gap-1"><ArrowLeft className="size-4" />Précédent</Button>
        <Button onClick={onSave} disabled={saving} className="gap-1">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Enregistrer
        </Button>
        <Button variant="secondary" onClick={onNext} className="gap-1">Suivant<ArrowRight className="size-4" /></Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SAISIE INTENSIVE                                                    */
/* ------------------------------------------------------------------ */

interface IntensiveProps {
  student: any | null;
  subject: any;
  cell: Cell | undefined;
  progress: StudentProgress | undefined;
  maxScore: number;
  draft: string | undefined;
  error: string | undefined;
  position: { index: number; total: number } | null;
  saving: boolean;
  smartNext: boolean;
  onlyTodo: boolean;
  remaining: number;
  onSmartNext: (v: boolean) => void;
  onOnlyTodo: (v: boolean) => void;
  onDraft: (text: string) => void;
  onPrev: () => void;
  onSkip: () => void;
  onSave: () => void;
  onSaveNext: () => void;
}

export function IntensiveView({
  student, subject, cell, progress, maxScore, draft, error, position, saving, smartNext, onlyTodo, remaining,
  onSmartNext, onOnlyTodo, onDraft, onPrev, onSkip, onSave, onSaveNext,
}: IntensiveProps) {
  const input = useRef<HTMLInputElement>(null);
  // Focus automatique sur le champ à chaque nouvel élève : saisie → Entrée → élève suivant.
  useEffect(() => {
    input.current?.focus();
  }, [student?.id]);

  if (!student) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        {onlyTodo ? "✅ Plus rien à traiter avec ce filtre." : "Aucun élève à afficher."}
      </div>
    );
  }
  const saved = cell?.rows.length === 1 ? Number(cell.rows[0].score) : null;
  const dup = (cell?.rows.length ?? 0) > 1;
  const value = draft !== undefined ? draft : scoreText(saved);

  return (
    <div className="rounded-xl border p-5 space-y-4 max-w-xl mx-auto">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{position ? `Élève ${position.index} / ${position.total}` : "Élève"}</span>
        <span>{subject.name} · sur {maxScore}</span>
      </div>

      <div className="flex items-center gap-3">
        <StudentPhoto path={student.photo_url} name={student.full_name} size="lg" />
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-tight">{student.full_name}</div>
          <div className="text-sm text-muted-foreground font-mono">Matricule : {student.matricule}</div>
          {progress && <StatusBadge status={progress.status} className="mt-1" />}
        </div>
      </div>

      <div>
        <Label htmlFor="intensive-note" className="text-base">Note</Label>
        <div className="flex items-center gap-3 mt-1">
          <ScoreInput
            id="intensive-note"
            ref={input}
            value={value}
            disabled={dup}
            changed={draft !== undefined}
            invalid={!!error}
            className="h-14 w-36 text-3xl font-bold"
            placeholder="—"
            onValue={onDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSaveNext();
              }
            }}
          />
          <span className="text-lg text-muted-foreground">/ {maxScore}</span>
        </div>
        {saved != null && draft === undefined && <p className="mt-1 text-xs text-muted-foreground">Note déjà enregistrée : {scoreText(saved)}</p>}
        {error && <p className="mt-1 text-sm text-red-700">❌ {error}</p>}
        {dup && <p className="mt-1 text-sm text-red-700">⚠️ {cell!.anomalies[0]?.message} Corrigez ce doublon depuis la Vue Classe.</p>}
        {!dup && !error && cell?.anomalies[0] && <p className="mt-1 text-sm text-amber-700">⚠️ Vérification recommandée : {cell.anomalies[0].message}</p>}
        <p className="mt-1 text-[11px] text-muted-foreground">Champ vide = aucune note (jamais 0). Entrée = enregistrer &amp; suivant · Alt+← / Alt+→ = précédent / suivant.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onPrev} aria-label="Élève précédent"><ArrowLeft className="size-4" /></Button>
        <Button variant="outline" onClick={onSave} disabled={saving} className="gap-1">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Enregistrer
        </Button>
        <Button onClick={onSaveNext} disabled={saving} className="gap-1 flex-1 sm:flex-none">
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}Enregistrer &amp; suivant<ArrowRight className="size-4" />
        </Button>
        <Button variant="ghost" onClick={onSkip}>Passer</Button>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-3">
        <div className="flex items-center gap-2">
          <Switch id="smart-next" checked={smartNext} onCheckedChange={onSmartNext} />
          <Label htmlFor="smart-next" className="cursor-pointer">Prochain élève à traiter</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="intensive-todo" checked={onlyTodo} onCheckedChange={onOnlyTodo} />
          <Label htmlFor="intensive-todo" className="cursor-pointer">Seulement les notes manquantes ou à corriger</Label>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {remaining > 0 ? `${remaining} élève(s) restent à traiter.` : "✅ Tous les élèves sont traités pour cette matière."}
      </p>
    </div>
  );
}
