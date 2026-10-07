import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/classes")({
  head: () => ({ meta: [{ title: "Classes — MBGEduGuinée" }] }),
  component: ClassesPage,
});

function ClassesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", level: "Primaire", annual_fee: 1500000 });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-full"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("*, students(count)").order("level, name");
      return data ?? [];
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("classes").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Classe créée");
    setOpen(false);
    setForm({ name: "", level: "Primaire", annual_fee: 1500000 });
    qc.invalidateQueries({ queryKey: ["classes-full"] });
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette classe ?")) return;
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["classes-full"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Classes</h1>
          <p className="text-muted-foreground mt-1">{classes.length} classe(s)</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="size-4" />Nouvelle classe</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Créer une classe</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div><Label>Nom</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ex. CM2 A" /></div>
              <div>
                <Label>Niveau</Label>
                <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Maternelle", "Primaire", "Collège", "Lycée", "Formation"].map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Frais annuels (GNF)</Label><Input type="number" required value={form.annual_fee} onChange={(e) => setForm({ ...form, annual_fee: Number(e.target.value) })} /></div>
              <DialogFooter><Button type="submit">Créer</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map((c: any) => (
          <Card key={c.id} className="hover:border-primary/40 transition-colors">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.level}</div>
                  <div className="font-display text-2xl font-bold mt-1">{c.name}</div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground"><Users className="size-4" />{c.students?.[0]?.count ?? 0} élèves</div>
                <div className="font-medium">{new Intl.NumberFormat("fr-FR").format(c.annual_fee)} GNF/an</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
