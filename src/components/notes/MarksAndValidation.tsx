import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Lock, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MARK_LABELS, planMarks, type Cell, type MarkStatus } from "@/lib/grade-entry";

type Action = MarkStatus | "retirer";
const CHOICES: Array<{ v: Action; l: string }> = [
  { v: "absent", l: "Absent" },
  { v: "non_concerne", l: "Non concerné" },
  { v: "annule", l: "Évaluation annulée" },
  { v: "retirer", l: "Retirer le statut (redevient « à saisir »)" },
];

/**
 * « Absent » en masse : choisir des élèves, des matières et un statut.
 * Aucune note n'est créée (jamais de 0) ; une case qui a déjà une note n'est jamais masquée.
 */
export function MarkAbsentDialog({
  open, onOpenChange, students, subjects, cells, lockedSubjectIds, busy, onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  students: Array<{ id: string; full_name: string }>;
  subjects: Array<{ id: string; name: string }>;
  cells: Cell[];
  lockedSubjectIds: Set<string>;
  busy: boolean;
  onApply: (targets: Array<{ studentId: string; subjectId: string }>, status: MarkStatus | null) => Promise<boolean>;
}) {
  const [action, setAction] = useState<Action>("absent");
  const [studentIds, setStudentIds] = useState<Set<string>>(new Set());
  const [subjectIds, setSubjectIds] = useState<Set<string>>(new Set(subjects.map((s) => s.id)));

  const plan = useMemo(
    () => planMarks({ studentIds: [...studentIds], subjectIds: [...subjectIds], cells, lockedSubjectIds }),
    [studentIds, subjectIds, cells, lockedSubjectIds],
  );
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(id) ? n.delete(id) : n.add(id);
    fn(n);
  };
  const removing = action === "retirer";
  // Pour retirer un statut, les cases avec note ne sont pas un obstacle.
  const targets = removing
    ? [...studentIds].flatMap((studentId) => [...subjectIds].filter((s) => !lockedSubjectIds.has(s)).map((subjectId) => ({ studentId, subjectId })))
    : plan.targets;

  async function apply() {
    if (!targets.length) return toast.error("Rien à appliquer : choisissez des élèves et des matières.");
    const ok = await onApply(targets, removing ? null : (action as MarkStatus));
    if (ok) {
      onOpenChange(false);
      setStudentIds(new Set());
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Marquer « absent » en masse</DialogTitle>
          <DialogDescription>Aucune note n'est créée : la case est simplement dispensée (ni manquante, ni zéro).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Statut</Label>
            <Select value={action} onValueChange={(v) => setAction(v as Action)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CHOICES.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label>Élèves ({studentIds.size}/{students.length})</Label>
                <button type="button" className="text-xs underline" onClick={() => setStudentIds(studentIds.size === students.length ? new Set() : new Set(students.map((s) => s.id)))}>
                  {studentIds.size === students.length ? "Tout décocher" : "Tout cocher"}
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border p-2 space-y-1">
                {students.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={studentIds.has(s.id)} onCheckedChange={() => toggle(studentIds, s.id, setStudentIds)} />{s.full_name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-1 block">Matières</Label>
              <div className="max-h-56 overflow-y-auto rounded-md border p-2 space-y-1">
                {subjects.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={subjectIds.has(s.id)} onCheckedChange={() => toggle(subjectIds, s.id, setSubjectIds)} />
                    {s.name}{lockedSubjectIds.has(s.id) && <Lock className="size-3 text-muted-foreground" aria-label="Saisie validée" />}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {targets.length} case{targets.length > 1 ? "s" : ""} concernée{targets.length > 1 ? "s" : ""}.
            {!removing && plan.skippedWithNote > 0 && ` ${plan.skippedWithNote} ignorée${plan.skippedWithNote > 1 ? "s" : ""} car une note existe déjà.`}
            {plan.skippedValidated > 0 && ` ${plan.skippedValidated} ignorée${plan.skippedValidated > 1 ? "s" : ""} car la saisie est validée.`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Annuler</Button>
          <Button onClick={apply} disabled={busy || !targets.length}>{busy ? "Enregistrement…" : removing ? "Retirer le statut" : `Marquer « ${MARK_LABELS[action as MarkStatus]} »`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MarkAbsentButton({ onClick }: { onClick: () => void }) {
  return <Button variant="outline" size="sm" className="gap-2" onClick={onClick}><UserX className="size-4" />Absent en masse</Button>;
}
