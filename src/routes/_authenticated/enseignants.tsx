import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TEACHER_TYPE_LABELS, TEACHER_TYPE_SHORT, isTitularType, normalizeTeacherType, type TeacherType } from "@/lib/teacher-types";

export const Route = createFileRoute("/_authenticated/enseignants")({
  head: () => ({ meta: [{ title: "Enseignants — MBGEduGuinée" }] }),
  component: TeachersPage,
});

function TeachersPage() {
  const qc = useQueryClient();
  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => (await supabase.from("teachers").select("*").order("created_at", { ascending: false })).data ?? [],
  });

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
        <Button asChild className="gap-2"><Link to="/personnel" search={{ add: "enseignant" }}><Plus className="size-4" />Nouvel enseignant</Link></Button>
      </div>

      <Card>
        <CardContent className="p-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Matricule</TableHead><TableHead>Nom</TableHead><TableHead>Type</TableHead><TableHead>Matières</TableHead><TableHead>Contact</TableHead><TableHead>Salaire</TableHead><TableHead></TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {teachers.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun enseignant</TableCell></TableRow>}
              {teachers.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.matricule}</TableCell>
                  <TableCell className="font-medium">{t.full_name}</TableCell>
                  <TableCell>
                    <Select value={normalizeTeacherType(t.teacher_type)} onValueChange={async (v) => {
                      const { error } = await supabase.from("teachers").update({ teacher_type: v } as any).eq("id", t.id);
                      if (error) return toast.error(error.message);
                      toast.success("Type modifié"); qc.invalidateQueries({ queryKey: ["teachers"] });
                    }}>
                      <SelectTrigger className="h-8 w-36"><SelectValue>{TEACHER_TYPE_SHORT[normalizeTeacherType(t.teacher_type)]}</SelectValue></SelectTrigger>
                      <SelectContent>{(Object.keys(TEACHER_TYPE_LABELS) as TeacherType[]).map((k) => <SelectItem key={k} value={k}>{TEACHER_TYPE_LABELS[k]}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm">{isTitularType(t.teacher_type) ? <span className="text-muted-foreground">{t.teacher_type === "educatrice" ? "Tous les domaines d'éveil" : "Toutes les matières"}</span> : (t.subjects ?? []).join(", ")}</TableCell>
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
