import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Printer, Check, X, Clock, FileCheck2 } from "lucide-react";
import { toast } from "sonner";
import { useScopedClassOptions } from "@/hooks/useOptions";

export const Route = createFileRoute("/_authenticated/presences")({
  head: () => ({ meta: [{ title: "Présences — MBGEduGuinée" }] }),
  component: AttendancePage,
});

type Status = "present" | "absent" | "retard" | "justifie";
const STATUS_LABEL: Record<Status, string> = {
  present: "Présent", absent: "Absent", retard: "Retard", justifie: "Justifié",
};
const STATUS_COLOR: Record<Status, string> = {
  present: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  absent: "bg-destructive/15 text-destructive border-destructive/30",
  retard: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  justifie: "bg-primary/15 text-primary border-primary/30",
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function monthStart(d: string) { return d.slice(0, 7) + "-01"; }
function monthEnd(d: string) {
  const [y, m] = d.slice(0, 7).split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${d.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

function AttendancePage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [classId, setClassId] = useState<string>("");
  const [reportMonth, setReportMonth] = useState(todayISO().slice(0, 7));

  const { classes } = useScopedClassOptions();
  const activeClassId = classId || (classes as any[])[0]?.id || "";

  const { data: students = [] } = useQuery({
    queryKey: ["students-of-class", activeClassId],
    enabled: !!activeClassId,
    queryFn: async () =>
      (await supabase.from("students").select("id,full_name,matricule").eq("class_id", activeClassId).order("full_name")).data ?? [],
  });

  const { data: sAtt = [] } = useQuery({
    queryKey: ["s-att", date, activeClassId],
    enabled: !!activeClassId,
    queryFn: async () =>
      (await supabase.from("student_attendance").select("*").eq("date", date).eq("class_id", activeClassId)).data ?? [],
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-lite"],
    queryFn: async () => (await supabase.from("teachers").select("id,full_name,matricule").order("full_name")).data ?? [],
  });
  const { data: tAtt = [] } = useQuery({
    queryKey: ["t-att", date],
    queryFn: async () => (await supabase.from("teacher_attendance").select("*").eq("date", date)).data ?? [],
  });

  const sByStudent = new Map((sAtt as any[]).map((a) => [a.student_id, a]));
  const tByTeacher = new Map((tAtt as any[]).map((a) => [a.teacher_id, a]));

  async function markStudent(studentId: string, status: Status) {
    const existing = sByStudent.get(studentId);
    const payload = {
      student_id: studentId, class_id: activeClassId, date, status,
      justified: status === "justifie",
    };
    const { error } = existing
      ? await supabase.from("student_attendance").update(payload).eq("id", existing.id)
      : await supabase.from("student_attendance").insert(payload);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["s-att"] });
  }

  async function markTeacher(teacherId: string, status: Status) {
    const existing = tByTeacher.get(teacherId);
    const payload = { teacher_id: teacherId, date, status, justified: status === "justifie" };
    const { error } = existing
      ? await supabase.from("teacher_attendance").update(payload).eq("id", existing.id)
      : await supabase.from("teacher_attendance").insert(payload);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["t-att"] });
  }

  // Rapport mensuel
  const { data: monthS = [] } = useQuery({
    queryKey: ["s-att-month", reportMonth, activeClassId],
    enabled: !!activeClassId,
    queryFn: async () =>
      (await supabase.from("student_attendance").select("*")
        .gte("date", monthStart(reportMonth + "-01"))
        .lte("date", monthEnd(reportMonth + "-01"))
        .eq("class_id", activeClassId)).data ?? [],
  });
  const { data: monthT = [] } = useQuery({
    queryKey: ["t-att-month", reportMonth],
    queryFn: async () =>
      (await supabase.from("teacher_attendance").select("*")
        .gte("date", monthStart(reportMonth + "-01"))
        .lte("date", monthEnd(reportMonth + "-01"))).data ?? [],
  });

  const stats = useMemo(() => {
    const per = new Map<string, { present: number; absent: number; retard: number; justifie: number }>();
    for (const r of monthS as any[]) {
      const cur = per.get(r.student_id) ?? { present: 0, absent: 0, retard: 0, justifie: 0 };
      cur[r.status as Status]++;
      per.set(r.student_id, cur);
    }
    return per;
  }, [monthS]);

  const tStats = useMemo(() => {
    const per = new Map<string, { present: number; absent: number; retard: number; justifie: number }>();
    for (const r of monthT as any[]) {
      const cur = per.get(r.teacher_id) ?? { present: 0, absent: 0, retard: 0, justifie: 0 };
      cur[r.status as Status]++;
      per.set(r.teacher_id, cur);
    }
    return per;
  }, [monthT]);

  // Justification dialog
  const [justifyFor, setJustifyFor] = useState<{ kind: "student" | "teacher"; row: any } | null>(null);
  const [justifyText, setJustifyText] = useState("");
  async function saveJustification() {
    if (!justifyFor) return;
    const table = justifyFor.kind === "student" ? "student_attendance" : "teacher_attendance";
    const { error } = await supabase.from(table)
      .update({ justification: justifyText, justified: true, status: "justifie" })
      .eq("id", justifyFor.row.id);
    if (error) return toast.error(error.message);
    toast.success("Justification enregistrée");
    setJustifyFor(null);
    setJustifyText("");
    qc.invalidateQueries({ queryKey: ["s-att"] });
    qc.invalidateQueries({ queryKey: ["t-att"] });
  }

  return (
    <div className="space-y-6">
      <style>{`@media print { .no-print{display:none!important} @page{size:A4;margin:12mm} }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h1 className="font-display text-3xl font-bold">Présences</h1>
          <p className="text-muted-foreground mt-1">Élèves, enseignants, absences et justifications</p>
        </div>
      </div>

      <Tabs defaultValue="students">
        <TabsList className="no-print">
          <TabsTrigger value="students">Élèves</TabsTrigger>
          <TabsTrigger value="teachers">Enseignants</TabsTrigger>
          <TabsTrigger value="report">Rapport mensuel</TabsTrigger>
        </TabsList>

        {/* ÉLÈVES */}
        <TabsContent value="students" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end no-print">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="min-w-[220px]">
              <Label>Classe</Label>
              <Select value={activeClassId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="Classe" /></SelectTrigger>
                <SelectContent>
                  {(classes as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.level}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Feuille de présence — {date}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {(students as any[]).map((s) => {
                  const a = sByStudent.get(s.id);
                  const st = (a?.status ?? null) as Status | null;
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-[180px]">
                        <div className="font-medium text-sm">{s.full_name}</div>
                        <div className="text-xs text-muted-foreground">{s.matricule}</div>
                      </div>
                      {st && <Badge variant="outline" className={STATUS_COLOR[st]}>{STATUS_LABEL[st]}</Badge>}
                      <div className="flex gap-1 no-print">
                        <Button size="sm" variant={st === "present" ? "default" : "outline"} onClick={() => markStudent(s.id, "present")}><Check className="size-3.5" /></Button>
                        <Button size="sm" variant={st === "absent" ? "default" : "outline"} onClick={() => markStudent(s.id, "absent")}><X className="size-3.5" /></Button>
                        <Button size="sm" variant={st === "retard" ? "default" : "outline"} onClick={() => markStudent(s.id, "retard")}><Clock className="size-3.5" /></Button>
                        {a && (
                          <Button size="sm" variant="outline" onClick={() => { setJustifyFor({ kind: "student", row: a }); setJustifyText(a.justification ?? ""); }}>
                            <FileCheck2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {students.length === 0 && <div className="p-6 text-sm text-muted-foreground">Aucun élève dans cette classe.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ENSEIGNANTS */}
        <TabsContent value="teachers" className="space-y-4">
          <div className="no-print">
            <Label>Date</Label>
            <Input type="date" className="max-w-[200px]" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Présence enseignants — {date}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {(teachers as any[]).map((tc) => {
                  const a = tByTeacher.get(tc.id);
                  const st = (a?.status ?? null) as Status | null;
                  return (
                    <div key={tc.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-[180px]">
                        <div className="font-medium text-sm">{tc.full_name}</div>
                        <div className="text-xs text-muted-foreground">{tc.matricule}</div>
                      </div>
                      {st && <Badge variant="outline" className={STATUS_COLOR[st]}>{STATUS_LABEL[st]}</Badge>}
                      <div className="flex gap-1 no-print">
                        <Button size="sm" variant={st === "present" ? "default" : "outline"} onClick={() => markTeacher(tc.id, "present")}><Check className="size-3.5" /></Button>
                        <Button size="sm" variant={st === "absent" ? "default" : "outline"} onClick={() => markTeacher(tc.id, "absent")}><X className="size-3.5" /></Button>
                        <Button size="sm" variant={st === "retard" ? "default" : "outline"} onClick={() => markTeacher(tc.id, "retard")}><Clock className="size-3.5" /></Button>
                        {a && (
                          <Button size="sm" variant="outline" onClick={() => { setJustifyFor({ kind: "teacher", row: a }); setJustifyText(a.justification ?? ""); }}>
                            <FileCheck2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* RAPPORT */}
        <TabsContent value="report" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end no-print">
            <div>
              <Label>Mois</Label>
              <Input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
            </div>
            <div className="min-w-[220px]">
              <Label>Classe</Label>
              <Select value={activeClassId} onValueChange={setClassId}>
                <SelectTrigger><SelectValue placeholder="Classe" /></SelectTrigger>
                <SelectContent>
                  {(classes as any[]).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="gap-2" onClick={() => window.print()}><Printer className="size-4" />Imprimer PDF</Button>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Rapport élèves — {reportMonth}</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="p-2">Élève</th>
                    <th className="p-2 text-center">Présent</th>
                    <th className="p-2 text-center">Absent</th>
                    <th className="p-2 text-center">Retard</th>
                    <th className="p-2 text-center">Justifié</th>
                    <th className="p-2 text-center">Taux présence</th>
                  </tr>
                </thead>
                <tbody>
                  {(students as any[]).map((s) => {
                    const v = stats.get(s.id) ?? { present: 0, absent: 0, retard: 0, justifie: 0 };
                    const total = v.present + v.absent + v.retard + v.justifie;
                    const rate = total ? Math.round(((v.present + v.justifie) / total) * 100) : 0;
                    return (
                      <tr key={s.id} className="border-t">
                        <td className="p-2">{s.full_name}</td>
                        <td className="p-2 text-center">{v.present}</td>
                        <td className="p-2 text-center text-destructive">{v.absent}</td>
                        <td className="p-2 text-center">{v.retard}</td>
                        <td className="p-2 text-center">{v.justifie}</td>
                        <td className="p-2 text-center font-medium">{total ? `${rate}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Rapport enseignants — {reportMonth}</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="p-2">Enseignant</th>
                    <th className="p-2 text-center">Présent</th>
                    <th className="p-2 text-center">Absent</th>
                    <th className="p-2 text-center">Retard</th>
                    <th className="p-2 text-center">Justifié</th>
                  </tr>
                </thead>
                <tbody>
                  {(teachers as any[]).map((tc) => {
                    const v = tStats.get(tc.id) ?? { present: 0, absent: 0, retard: 0, justifie: 0 };
                    return (
                      <tr key={tc.id} className="border-t">
                        <td className="p-2">{tc.full_name}</td>
                        <td className="p-2 text-center">{v.present}</td>
                        <td className="p-2 text-center text-destructive">{v.absent}</td>
                        <td className="p-2 text-center">{v.retard}</td>
                        <td className="p-2 text-center">{v.justifie}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!justifyFor} onOpenChange={(o) => !o && setJustifyFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Justification d'absence</DialogTitle></DialogHeader>
          <Textarea rows={4} placeholder="Motif (certificat médical, raison familiale…)" value={justifyText} onChange={(e) => setJustifyText(e.target.value)} />
          <DialogFooter><Button onClick={saveJustification}>Enregistrer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
