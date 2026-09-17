import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Award } from "lucide-react";
import { toast } from "sonner";
import { maxScoreForLevel } from "@/lib/grading";
import { useScopedClassOptions } from "@/hooks/useOptions";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => ({ meta: [{ title: "Notes — MBGEduGuinée" }] }),
  component: NotesPage,
});

function NotesPage() {
  const qc = useQueryClient();
  const [classId, setClassId] = useState<string>("");
  const [period, setPeriod] = useState("T1");
  const [open, setOpen] = useState(false);

  const { classes } = useScopedClassOptions();
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => (await supabase.from("subjects").select("*").order("name")).data ?? [],
  });
  const { data: students = [] } = useQuery({
    queryKey: ["students-class", classId],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("students").select("id, full_name, matricule").eq("class_id", classId).order("full_name")).data ?? [],
  });
  const studentIds = students.map((s: any) => s.id);
  const { data: grades = [] } = useQuery({
    queryKey: ["grades", classId, period, studentIds.length],
    enabled: studentIds.length > 0,
    queryFn: async () => (await supabase.from("grades").select("*").in("student_id", studentIds).eq("period", period)).data ?? [],
  });

  const cls = classes.find((c: any) => c.id === classId);
  const maxScore = maxScoreForLevel(cls?.level);

  const rows = useMemo(() => {
    return students.map((s: any) => {
      const sg = grades.filter((g: any) => g.student_id === s.id);
      let totalWeighted = 0, totalCoef = 0;
      subjects.forEach((sub: any) => {
        const g = sg.find((x: any) => x.subject_id === sub.id);
        if (g) { totalWeighted += Number(g.score) * Number(sub.coefficient); totalCoef += Number(sub.coefficient); }
      });
      const avg = totalCoef > 0 ? totalWeighted / totalCoef : null;
      return { student: s, grades: sg, avg };
    }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  }, [students, grades, subjects]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Notes & bulletins</h1>
          <p className="text-muted-foreground mt-1">Saisie des notes, calcul des moyennes et classement.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-2" disabled={!classId}><Plus className="size-4" />Saisir une note</Button></DialogTrigger>
          <GradeDialog students={students} subjects={subjects} period={period} maxScore={maxScore} onClose={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["grades"] }); }} />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <Label>Classe</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="Choisir une classe" /></SelectTrigger>
              <SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.level}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label>Période</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["T1","T2","T3"].map((p) => <SelectItem key={p} value={p}>Trimestre {p[1]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {classId && (
        <Card>
          <CardContent className="p-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rang</TableHead>
                  <TableHead>Élève</TableHead>
                  {subjects.map((s: any) => <TableHead key={s.id} className="text-center">{s.name}<div className="text-xs text-muted-foreground font-normal">coef {s.coefficient}</div></TableHead>)}
                  <TableHead className="text-center">Moyenne</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <TableRow><TableCell colSpan={subjects.length + 3} className="text-center py-8 text-muted-foreground">Aucun élève dans cette classe</TableCell></TableRow>}
                {rows.map((r, i) => (
                  <TableRow key={r.student.id}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {i === 0 && r.avg != null && <Award className="size-4 text-accent" />}
                        <span className="font-bold">{r.avg != null ? i + 1 : "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell><div className="font-medium">{r.student.full_name}</div><div className="text-xs text-muted-foreground font-mono">{r.student.matricule}</div></TableCell>
                    {subjects.map((s: any) => {
                      const g = r.grades.find((x: any) => x.subject_id === s.id);
                      return <TableCell key={s.id} className="text-center text-sm">{g ? Number(g.score).toFixed(1) : <span className="text-muted-foreground">—</span>}</TableCell>;
                    })}
                    <TableCell className="text-center font-bold">{r.avg != null ? r.avg.toFixed(2) : "—"} / {maxScore}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function GradeDialog({ students, subjects, period, maxScore, onClose }: any) {
  const [form, setForm] = useState({ student_id: "", subject_id: "", score: Math.min(10, maxScore) });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.student_id || !form.subject_id) return;
    const score = Number(form.score);
    if (Number.isNaN(score) || score < 0 || score > maxScore) {
      return toast.error(`La note doit être comprise entre 0 et ${maxScore}.`);
    }
    const { error } = await supabase.from("grades").insert({ ...form, score, period });
    if (error) return toast.error(error.message);
    toast.success("Note enregistrée");
    onClose();
  }
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nouvelle note ({period}) — sur {maxScore}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>Élève</Label>
          <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{students.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Matière</Label>
          <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Note / {maxScore}</Label>
          <Input
            type="number"
            step="0.25"
            min="0"
            max={maxScore}
            value={form.score}
            placeholder={`Entrer une note sur ${maxScore}`}
            onChange={(e) => setForm({ ...form, score: Number(e.target.value) })}
          />
        </div>
        <DialogFooter><Button type="submit">Enregistrer</Button></DialogFooter>
      </form>
    </DialogContent>
  );
}
