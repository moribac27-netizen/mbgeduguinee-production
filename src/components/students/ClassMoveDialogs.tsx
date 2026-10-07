import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { planReenrollment, type ClassMove } from "@/lib/enrollment";

const REFUSED = "Modification refusée : vos droits ne permettent pas de changer la classe d'un élève.";

/** Met à jour class_id d'un groupe d'élèves ; détecte le refus silencieux de la RLS (0 ligne modifiée). */
async function moveStudents(ids: string[], toClassId: string): Promise<{ moved: number; error?: string }> {
  const { data, error } = await supabase.from("students").update({ class_id: toClassId }).in("id", ids).select("id");
  if (error) return { moved: 0, error: error.message };
  const moved = (data ?? []).length;
  if (moved === 0) return { moved, error: REFUSED };
  return { moved };
}

function useRefresh() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["students"] }),
      qc.invalidateQueries({ queryKey: ["entry-students"] }),
      qc.invalidateQueries({ queryKey: ["entry-grades"] }),
      qc.invalidateQueries({ queryKey: ["grades"] }),
    ]);
}

/** Changement de classe d'un seul élève : la fiche (identité, matricule, notes) est conservée. */
export function ChangeClassDialog({ student, classes, onClose }: { student: any; classes: any[]; onClose: () => void }) {
  const refresh = useRefresh();
  const [to, setTo] = useState("");
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const fromName = classes.find((c) => c.id === student.class_id)?.name ?? "—";
  const toName = classes.find((c) => c.id === to)?.name;

  async function confirm() {
    if (lock.current || !to || to === student.class_id) return;
    lock.current = true;
    setSaving(true);
    try {
      const r = await moveStudents([student.id], to);
      if (r.error) return void toast.error(r.error);
      void logActivity({
        action: "update",
        entity_type: "student",
        entity_id: student.id,
        entity_label: `${student.full_name} : ${fromName} → ${toName}`,
        metadata: { fromClassId: student.class_id, toClassId: to, via: "changement_classe" },
      });
      await refresh();
      toast.success("Classe modifiée", { description: `${student.full_name} est maintenant en ${toName}.` });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Connexion interrompue. Réessayez.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Changer de classe — {student.full_name}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Classe actuelle : <b>{fromName}</b>. L'élève garde sa fiche, son matricule et ses notes déjà saisies : aucune nouvelle fiche n'est créée.</p>
        <div>
          <Label className="mb-1 block">Nouvelle classe</Label>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger><SelectValue placeholder="Choisir la classe" /></SelectTrigger>
            <SelectContent>
              {classes.filter((c) => c.id !== student.class_id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.level}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button onClick={confirm} disabled={!to || saving} className="gap-2">{saving && <Loader2 className="size-4 animate-spin" />}Confirmer le changement</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Réinscription en lot (début d'année) : une classe d'origine → une classe de destination, avec aperçu. */
export function ReenrollDialog({ students, classes, onClose }: { students: any[]; classes: any[]; onClose: () => void }) {
  const refresh = useRefresh();
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState<{ moved: number; failed: string[] } | null>(null);
  const lock = useRef(false);

  const sources = useMemo(
    () =>
      classes
        .map((c) => ({ c, count: students.filter((s) => s.class_id === c.id && (s.status ?? "actif") === "actif").length }))
        .filter((x) => x.count > 0),
    [classes, students],
  );
  const plan = useMemo(() => planReenrollment(students, mapping), [students, mapping]);
  const nameOf = (id: string) => classes.find((c) => c.id === id)?.name ?? "—";

  async function apply() {
    if (lock.current || !plan.total || !confirmed) return;
    lock.current = true;
    setSaving(true);
    let moved = 0;
    const failed: string[] = [];
    try {
      for (const m of plan.moves as ClassMove[]) {
        // Un seul UPDATE par groupe : le groupe passe en entier ou pas du tout.
        const r = await moveStudents(m.studentIds, m.toClassId);
        if (r.error || r.moved !== m.studentIds.length) {
          failed.push(`${nameOf(m.fromClassId)} → ${nameOf(m.toClassId)} : ${r.error ?? "déplacement incomplet, vérifiez la liste."}`);
          continue;
        }
        moved += r.moved;
        void logActivity({
          action: "update",
          entity_type: "student",
          entity_label: `Réinscription : ${r.moved} élève(s) ${nameOf(m.fromClassId)} → ${nameOf(m.toClassId)}`,
          metadata: { fromClassId: m.fromClassId, toClassId: m.toClassId, count: r.moved, via: "reinscription" },
        });
      }
      await refresh();
      setReport({ moved, failed });
    } catch (e: any) {
      toast.error(e?.message ?? "Connexion interrompue. Vérifiez la liste des élèves avant de réessayer.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Réinscriptions — passage en classe</DialogTitle></DialogHeader>
        {report ? (
          <div className="space-y-3">
            <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">✅ {report.moved} élève(s) réinscrit(s).</p>
            {report.failed.length > 0 && (
              <ul className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive space-y-1">
                {report.failed.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            )}
            <DialogFooter><Button onClick={onClose}>Fermer</Button></DialogFooter>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Choisissez la classe de destination de chaque classe. Les élèves gardent leur fiche et leur matricule ; seuls les élèves « actifs » sont déplacés.
              Une classe laissée sur « Ne pas changer » n'est pas touchée.
            </p>
            <div className="rounded-md border divide-y">
              {sources.length === 0 && <p className="p-3 text-sm text-muted-foreground">Aucun élève actif à réinscrire.</p>}
              {sources.map(({ c, count }) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-0 flex-1"><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{count} élève(s) actif(s)</div></div>
                  <span aria-hidden>→</span>
                  <div className="w-52">
                    <Select value={mapping[c.id] || "none"} onValueChange={(v) => { setMapping((m) => ({ ...m, [c.id]: v === "none" ? "" : v })); setConfirmed(false); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ne pas changer</SelectItem>
                        {classes.filter((x) => x.id !== c.id).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <div><b>{plan.total}</b> élève(s) changeront de classe.</div>
              {plan.moves.map((m) => <div key={m.fromClassId + m.toClassId} className="text-muted-foreground">{nameOf(m.fromClassId)} → {nameOf(m.toClassId)} : {m.studentIds.length}</div>)}
              {plan.inactive > 0 && <div className="text-muted-foreground">{plan.inactive} élève(s) non actif(s) ignoré(s).</div>}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={!plan.total} />
              <span>Je confirme ce changement de classe. Il s'applique tout de suite à Notes, Présences et Bulletins : à faire de préférence une fois les bulletins de l'année terminés.</span>
            </label>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
              <Button onClick={apply} disabled={!plan.total || !confirmed || saving} className="gap-2">{saving && <Loader2 className="size-4 animate-spin" />}{saving ? "Réinscription…" : `Réinscrire ${plan.total} élève(s)`}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
