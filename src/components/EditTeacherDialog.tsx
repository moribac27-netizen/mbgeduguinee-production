import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TEACHER_TYPE_LABELS, isTitularType, normalizeTeacherType, type TeacherType } from "@/lib/teacher-types";

export type EditableTeacher = { id: string; full_name: string; phone?: string | null; email?: string | null; monthly_salary?: number | null; subjects?: string[] | null; teacher_type?: string | null };

/** Modification de la fiche d'un enseignant (nom, contact, salaire, type, matières). */
export function EditTeacherDialog({ teacher, onDone }: { teacher: EditableTeacher; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const init = () => ({
    full_name: teacher.full_name ?? "", phone: teacher.phone ?? "", email: teacher.email ?? "",
    salary: String(teacher.monthly_salary ?? 0), subjects: (teacher.subjects ?? []).join(", "), type: normalizeTeacherType(teacher.teacher_type),
  });
  const [f, setF] = useState(init);

  async function save() {
    if (busy) return;
    const name = f.full_name.trim();
    if (name.length < 2) return void toast.error("Le nom complet est obligatoire.");
    const salary = Number(f.salary);
    if (!Number.isFinite(salary) || salary < 0) return void toast.error("Salaire invalide.");
    const email = f.email.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return void toast.error("Adresse e-mail invalide.");
    const subjects = isTitularType(f.type) ? [] : f.subjects.split(",").map((s) => s.trim()).filter(Boolean);
    setBusy(true);
    const { data, error } = await supabase.from("teachers")
      .update({ full_name: name, phone: f.phone.trim() || null, email: email || null, monthly_salary: salary, subjects, teacher_type: f.type } as any)
      .eq("id", teacher.id).select("id");
    setBusy(false);
    if (error) return void toast.error(error.message.includes("USER_OTHER_SCHOOL") ? "Ce compte n'appartient pas à cet établissement." : "Modification impossible : " + error.message);
    if (!data?.length) return void toast.error("Aucune modification enregistrée : vous n'avez pas le droit de modifier cette fiche.");
    toast.success("Fiche enseignant mise à jour");
    setOpen(false); onDone();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(init()); }}>
      <DialogTrigger asChild><Button variant="ghost" size="icon" title="Modifier"><Pencil className="size-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Modifier l'enseignant</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Nom complet</Label><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Téléphone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          </div>
          <div><Label>Type</Label>
            <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v as TeacherType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(TEACHER_TYPE_LABELS) as TeacherType[]).map((k) => <SelectItem key={k} value={k}>{TEACHER_TYPE_LABELS[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!isTitularType(f.type) && <div><Label>Matières (séparées par des virgules)</Label><Input value={f.subjects} onChange={(e) => setF({ ...f, subjects: e.target.value })} /></div>}
          <div><Label>Salaire mensuel (GNF)</Label><Input type="number" min={0} value={f.salary} onChange={(e) => setF({ ...f, salary: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
