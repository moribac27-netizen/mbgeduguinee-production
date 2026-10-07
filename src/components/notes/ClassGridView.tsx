import { memo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { StudentPhoto } from "@/components/StudentPhoto";
import { AlertTriangle, Copy } from "lucide-react";
import type { Cell, StudentProgress } from "@/lib/grade-entry";
import { markKey } from "@/lib/grade-entry";
import { ProgressMeter, ScoreInput, StatusBadge, focusCell, scoreText } from "./entry-shared";

export interface GridProps {
  students: any[];
  subjects: any[];
  cellsByStudent: Map<string, Map<string, Cell>>;
  progressByStudent: Map<string, StudentProgress>;
  drafts: Map<string, string>;
  errors: Map<string, string>;
  onDraft: (studentId: string, subjectId: string, text: string) => void;
  onOpenStudent: (studentId: string) => void;
}

interface RowProps {
  index: number;
  student: any;
  subjects: any[];
  cells: Map<string, Cell> | undefined;
  progress: StudentProgress | undefined;
  /** Valeur affichée par matière (brouillon sinon valeur enregistrée). */
  values: string[];
  changed: boolean[];
  errs: Array<string | undefined>;
  onDraft: GridProps["onDraft"];
  onOpenStudent: GridProps["onOpenStudent"];
}

const sameArr = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Ligne mémoïsée : taper dans une case ne refait le rendu QUE de sa ligne,
 * ce qui garde la grille fluide pour 60-80 élèves ou plus.
 */
const GridRow = memo(
  function GridRow({ index, student, subjects, cells, progress, values, changed, errs, onDraft, onOpenStudent }: RowProps) {
    return (
      <tr className="border-b last:border-0 align-middle">
        <td className="py-1.5 pr-3">
          <button type="button" className="flex items-center gap-2 text-left hover:underline" onClick={() => onOpenStudent(student.id)}>
            <StudentPhoto path={student.photo_url} name={student.full_name} size="xs" />
            <span>
              <span className="block font-medium leading-tight">{student.full_name}</span>
              <span className="block text-xs text-muted-foreground font-mono">{student.matricule}</span>
            </span>
          </button>
        </td>
        <td className="py-1.5 pr-3 hidden md:table-cell">{progress ? <StatusBadge status={progress.status} /> : null}</td>
        <td className="py-1.5 pr-3 w-36 hidden lg:table-cell">
          {progress ? (
            <>
              <ProgressMeter percent={progress.percent} />
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {progress.filled} saisie(s) · {progress.missing} restante(s)
              </div>
            </>
          ) : null}
        </td>
        {subjects.map((sub, i) => {
          const cell = cells?.get(sub.id);
          const dup = (cell?.rows.length ?? 0) > 1;
          const warn = !!cell?.anomalies.length && !dup;
          return (
            <td key={sub.id} className="py-1.5 px-1 text-center">
              {dup ? (
                <Badge variant="destructive" className="gap-1" title={cell!.anomalies[0]?.message}>
                  <Copy className="size-3" /> Doublon
                </Badge>
              ) : (
                <ScoreInput
                  row={index}
                  col={i}
                  value={values[i]}
                  changed={changed[i]}
                  invalid={!!errs[i]}
                  warning={warn}
                  title={errs[i] ?? (warn ? cell!.anomalies[0]?.message : undefined)}
                  aria-label={`Note de ${student.full_name} en ${sub.name}`}
                  onValue={(v) => onDraft(student.id, sub.id, v)}
                />
              )}
              {(errs[i] || warn) && (
                <div className={`mt-0.5 text-[10px] leading-tight max-w-24 mx-auto ${errs[i] ? "text-red-700" : "text-amber-700"}`}>
                  {errs[i] ? "❌ Invalide" : "⚠️ À vérifier"}
                </div>
              )}
            </td>
          );
        })}
      </tr>
    );
  },
  (a, b) =>
    a.student === b.student &&
    a.index === b.index &&
    a.subjects === b.subjects &&
    a.cells === b.cells &&
    a.progress === b.progress &&
    sameArr(a.values, b.values) &&
    sameArr(a.changed, b.changed) &&
    sameArr(a.errs, b.errs),
);

/**
 * VUE CLASSE — la grille classique, élèves en lignes, matières en colonnes.
 * Clavier : Tab / Maj+Tab entre colonnes, Entrée / Maj+Entrée entre élèves.
 */
export function ClassGridView({ students, subjects, cellsByStudent, progressByStudent, drafts, errors, onDraft, onOpenStudent }: GridProps) {
  const root = useRef<HTMLTableSectionElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const t = e.target as HTMLInputElement;
    if (e.key !== "Enter" || t.dataset.row == null) return;
    e.preventDefault();
    const r = Number(t.dataset.row);
    const c = Number(t.dataset.col);
    focusCell(root.current, r + (e.shiftKey ? -1 : 1), c);
  }

  if (!students.length) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Aucun élève à afficher avec ces filtres.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-3 font-medium">Élève</th>
            <th className="py-2 pr-3 font-medium hidden md:table-cell">Statut</th>
            <th className="py-2 pr-3 font-medium hidden lg:table-cell">Progression</th>
            {subjects.map((s) => (
              <th key={s.id} className="py-2 px-1 font-medium text-center">
                {s.name}
                <div className="font-normal text-[10px]">coef {s.coefficient}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={root} onKeyDown={onKeyDown}>
          {students.map((s, i) => {
            const cells = cellsByStudent.get(s.id);
            const values = subjects.map((sub) => {
              const k = markKey(s.id, sub.id);
              const cell = cells?.get(sub.id);
              return drafts.has(k) ? (drafts.get(k) as string) : scoreText(cell?.rows.length === 1 ? Number(cell.rows[0].score) : null);
            });
            const changed = subjects.map((sub) => drafts.has(markKey(s.id, sub.id)));
            const errs = subjects.map((sub) => errors.get(markKey(s.id, sub.id)));
            return (
              <GridRow
                key={s.id}
                index={i}
                student={s}
                subjects={subjects}
                cells={cells}
                progress={progressByStudent.get(s.id)}
                values={values}
                changed={changed}
                errs={errs}
                onDraft={onDraft}
                onOpenStudent={onOpenStudent}
              />
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
        <AlertTriangle className="size-3" /> Une case vide reste vide : elle n'est jamais enregistrée comme 0. Pour une note nulle, saisir « 0 ».
      </p>
    </div>
  );
}
