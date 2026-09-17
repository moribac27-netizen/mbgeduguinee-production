import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScopedClassOptions } from "@/hooks/useOptions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Printer, CalendarDays } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/examens")({
  head: () => ({ meta: [{ title: "Examens — MBGEduGuinée" }] }),
  component: ExamsPage,
});

const TYPE_LABELS: Record<string, string> = { composition: "Composition", devoir: "Devoir", controle: "Contrôle", examen: "Examen" };

function ExamsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");

  const { data: exams = [] } = useQuery({
    queryKey: ["exams"],
    queryFn: async () => (await supabase.from("exams").select("*, classes(name), subjects(name), rooms(name), teachers(full_name)").order("exam_date", { ascending: false })).data ?? [],
  });
  const { classes } = useScopedClassOptions();
  const { data: subjects = [] } = useQuery({ queryKey: ["subjects-e"], queryFn: async () => (await supabase.from("subjects").select("id, name").order("name")).data ?? [] });
  const { data: teachers = [] } = useQuery({ queryKey: ["teachers-e"], queryFn: async () => (await supabase.from("teachers").select("id, full_name").order("full_name")).data ?? [] });
  const { data: rooms = [] } = useQuery({ queryKey: ["rooms-e"], queryFn: async () => (await supabase.from("rooms").select("id, name").order("name")).data ?? [] });

  const filtered = useMemo(() => filter === "all" ? exams : (exams as any[]).filter((e) => e.type === filter), [exams, filter]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (exams as any[]).filter((e) => e.exam_date >= today).slice(0, 5);
  }, [exams]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Examens</h1>
          <p className="text-muted-foreground mt-1">Compositions, devoirs, contrôles et calendrier de surveillance.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="size-4" />Calendrier PDF</Button>
          <ExamDialog classes={classes} subjects={subjects} teachers={teachers} rooms={rooms} onSaved={() => qc.invalidateQueries({ queryKey: ["exams"] })} />
        </div>
      </div>

      {upcoming.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3"><CalendarDays className="size-5 text-primary" /><h2 className="font-semibold">Prochains examens</h2></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {upcoming.map((e) => (
                <div key={e.id} className="p-3 rounded-lg border bg-card">
                  <div className="text-xs text-muted-foreground uppercase">{TYPE_LABELS[e.type]}</div>
                  <div className="font-semibold text-sm mt-1 truncate">{e.title}</div>
                  <div className="text-xs mt-1">{e.classes?.name} · {e.subjects?.name}</div>
                  <div className="text-xs text-primary mt-1">{new Date(e.exam_date).toLocaleDateString("fr-FR")} {e.start_time?.slice(0,5)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        {["all","composition","devoir","controle","examen"].map((t) => (
          <button key={t} onClick={() => setFilter(t)} className={"px-3 py-1.5 text-sm rounded-md border " + (filter === t ? "bg-primary text-primary-foreground border-primary" : "bg-transparent hover:bg-muted")}>
            {t === "all" ? "Tous" : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Titre</TableHead><TableHead>Type</TableHead><TableHead>Classe</TableHead><TableHead>Matière</TableHead><TableHead>Date</TableHead><TableHead>Durée</TableHead><TableHead>Coef.</TableHead><TableHead>Salle</TableHead><TableHead>Surveillant</TableHead></TableRow></TableHeader>
          <TableBody>
            {filtered.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.title}</TableCell>
                <TableCell><Badge variant="outline">{TYPE_LABELS[e.type]}</Badge></TableCell>
                <TableCell>{e.classes?.name}</TableCell>
                <TableCell>{e.subjects?.name}</TableCell>
                <TableCell>{new Date(e.exam_date).toLocaleDateString("fr-FR")} {e.start_time?.slice(0, 5)}</TableCell>
                <TableCell>{e.duration_minutes} min</TableCell>
                <TableCell>{e.coefficient}</TableCell>
                <TableCell>{e.rooms?.name ?? "—"}</TableCell>
                <TableCell>{e.teachers?.full_name ?? "—"}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Aucun examen planifié.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

function ExamDialog({ classes, subjects, teachers, rooms, onSaved }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    title: "", type: "devoir", class_id: "", subject_id: "", exam_date: new Date().toISOString().slice(0, 10),
    start_time: "08:00", duration_minutes: 60, coefficient: 1, room_id: "", supervisor_id: "",
  });
  async function save() {
    if (!form.title || !form.class_id || !form.subject_id) return toast.error("Titre, classe et matière requis");
    const payload = { ...form, room_id: form.room_id || null, supervisor_id: form.supervisor_id || null };
    const { error } = await supabase.from("exams").insert(payload as any);
    if (error) return toast.error(error.message);
    toast.success("Examen planifié"); setOpen(false); onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-2"><Plus className="size-4" />Planifier</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Nouvel examen</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Titre</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Devoir surveillé n°1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Coefficient</Label><Input type="number" step="0.5" value={form.coefficient} onChange={(e) => setForm({ ...form, coefficient: Number(e.target.value) })} /></div>
            <div><Label>Classe</Label>
              <Select value={form.class_id} onValueChange={(v) => setForm({ ...form, class_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Matière</Label>
              <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>{subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Date</Label><Input type="date" value={form.exam_date} onChange={(e) => setForm({ ...form, exam_date: e.target.value })} /></div>
            <div><Label>Heure début</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
            <div><Label>Durée (min)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></div>
            <div><Label>Salle</Label>
              <Select value={form.room_id} onValueChange={(v) => setForm({ ...form, room_id: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{rooms.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Surveillant</Label>
              <Select value={form.supervisor_id} onValueChange={(v) => setForm({ ...form, supervisor_id: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{teachers.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter><Button onClick={save}>Planifier</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
