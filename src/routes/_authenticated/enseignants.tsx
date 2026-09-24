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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/enseignants")({
  head: () => ({ meta: [{ title: "Enseignants — MBGEduGuinée" }] }),
  component: TeachersPage,
});

function TeachersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    matricule: "ENS-" + globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
    full_name: "", phone: "", email: "", subjects: "", monthly_salary: 2000000,
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await supabase.from("teachers").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form, subjects: form.subjects.split(",").map((s) => s.trim()).filter(Boolean) };
    const { error } = await supabase.from("teachers").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Enseignant ajouté");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["teachers"] });
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ?")) return;
    await supabase.from("teachers").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["teachers"] });
  }

  const totalSalary = teachers.reduce((s: number, t: any) => s + Number(t.monthly_salary || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Enseignants</h1>
          <p className="text-muted-foreground mt-1">{teachers.length} enseignant(s) · masse salariale {new Intl.NumberFormat("fr-FR").format(totalSalary)} GNF/mois</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="size-4" />Nouvel enseignant</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Ajouter un enseignant</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="grid grid-cols-2 gap-3">
              <div><Label>Matricule</Label><Input required value={form.matricule} onChange={(e) => setForm({ ...form, matricule: e.target.value })} /></div>
              <div><Label>Nom complet</Label><Input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="col-span-2"><Label>Matières (séparées par virgule)</Label><Input value={form.subjects} onChange={(e) => setForm({ ...form, subjects: e.target.value })} placeholder="Mathématiques, Physique" /></div>
              <div className="col-span-2"><Label>Salaire mensuel (GNF)</Label><Input type="number" value={form.monthly_salary} onChange={(e) => setForm({ ...form, monthly_salary: Number(e.target.value) })} /></div>
              <DialogFooter className="col-span-2"><Button type="submit">Ajouter</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Matricule</TableHead><TableHead>Nom</TableHead><TableHead>Matières</TableHead><TableHead>Contact</TableHead><TableHead>Salaire</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {teachers.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Aucun enseignant</TableCell></TableRow>}
              {teachers.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.matricule}</TableCell>
                  <TableCell className="font-medium">{t.full_name}</TableCell>
                  <TableCell className="text-sm">{(t.subjects ?? []).join(", ")}</TableCell>
                  <TableCell className="text-sm"><div>{t.phone}</div><div className="text-xs text-muted-foreground">{t.email}</div></TableCell>
                  <TableCell>{new Intl.NumberFormat("fr-FR").format(t.monthly_salary)} GNF</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="size-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
