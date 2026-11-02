import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { PRIMARY_SUBJECTS, SECONDARY_SUBJECTS, missingSubjects, type SubjectTemplate } from "@/lib/subject-catalog";

export const Route = createFileRoute("/_authenticated/matieres")({
  head: () => ({ meta: [{ title: "Matières — MBGEduGuinée" }] }),
  component: MatieresPage,
});

function MatieresPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [],
  });

  async function addDefaults(template: SubjectTemplate[]) {
    const todo = missingSubjects(template, subjects as any[]);
    if (todo.length === 0) return toast.info("Ces matières existent déjà.");
    const { data: sid } = await supabase.rpc("current_school_id");
    if (!sid) return toast.error("École non identifiée");
    const { error } = await supabase.from("subjects").insert(todo.map((t) => ({ name: t.name, coefficient: t.coefficient, school_id: sid as any })));
    if (error) return toast.error(error.message);
    toast.success(`${todo.length} matière(s) ajoutée(s). Vous pouvez modifier les coefficients.`);
    qc.invalidateQueries({ queryKey: ["subjects"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette matière ? Les notes existantes liées à cette matière seront affectées.")) return;
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Matière supprimée");
    qc.invalidateQueries({ queryKey: ["subjects"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Matières</h1>
          <p className="text-muted-foreground mt-1">{subjects.length} matière(s) enregistrée(s)</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="size-4" /> Nouvelle matière</Button>
          </DialogTrigger>
          <SubjectDialog editing={editing} onClose={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["subjects"] }); }} />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead className="w-32 text-center">Coefficient</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Chargement…</TableCell></TableRow>}
                {!isLoading && subjects.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center py-10 text-muted-foreground">
                    <BookOpen className="size-8 mx-auto mb-2 opacity-40" />
                    Aucune matière : sans matière, aucune note ne peut être saisie.
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      <Button size="sm" onClick={() => void addDefaults(PRIMARY_SUBJECTS)}>Ajouter les matières du primaire</Button>
                      <Button size="sm" variant="outline" onClick={() => void addDefaults(SECONDARY_SUBJECTS)}>Ajouter les matières du collège / lycée</Button>
                    </div>
                  </TableCell></TableRow>
                )}
                {subjects.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-center">{s.coefficient}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}><Trash2 className="size-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SubjectDialog({ editing, onClose }: { editing: any; onClose: () => void }) {
  const [form, setForm] = useState<any>(editing ?? { name: "", coefficient: 1 });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name?.trim()) return toast.error("Le nom est requis");
    const coef = Number(form.coefficient);
    if (!Number.isFinite(coef) || coef <= 0) return toast.error("Coefficient invalide");
    setLoading(true);
    const payload: any = { name: form.name.trim(), coefficient: coef };
    let error;
    if (editing) {
      ({ error } = await supabase.from("subjects").update(payload).eq("id", editing.id));
    } else {
      const { data: sid } = await supabase.rpc("current_school_id");
      if (!sid) { setLoading(false); return toast.error("École non identifiée"); }
      ({ error } = await supabase.from("subjects").insert({ ...payload, school_id: sid as any }));
    }
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Matière modifiée" : "Matière ajoutée");
    onClose();
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>{editing ? "Modifier la matière" : "Nouvelle matière"}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div><Label>Nom</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mathématiques" /></div>
        <div><Label>Coefficient</Label><Input type="number" step="0.5" min="0.5" required value={form.coefficient} onChange={(e) => setForm({ ...form, coefficient: e.target.value })} /></div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={loading}>{editing ? "Enregistrer" : "Ajouter"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
