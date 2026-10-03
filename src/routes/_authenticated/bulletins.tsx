import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, FileDown, Eye, Lock } from "lucide-react";
import { BulletinDocument, BULLETIN_PERIODS, periodLabel } from "@/components/BulletinDocument";
import { BulletinPreviewDialog } from "@/components/BulletinPreviewDialog";
import { logActivity } from "@/lib/audit";
import { usePerStudentPlan, usePaidStudentIds } from "@/hooks/usePerStudentPlan";

export const Route = createFileRoute("/_authenticated/bulletins")({
  head: () => ({ meta: [{ title: "Bulletins scolaires — MBGEduGuinée" }] }),
  component: BulletinsPage,
});

function BulletinsPage() {
  const [classId, setClassId] = useState("");
  const [period, setPeriod] = useState("T1");
  const [studentId, setStudentId] = useState("");
  const [preview, setPreview] = useState(false);

  const { info: planInfo } = usePerStudentPlan();
  const { paidIds, isUnlocked } = usePaidStudentIds(planInfo.schoolId, planInfo.academicYear, planInfo.isPerStudent);

  const { data: classes = [] } = useQuery({
    queryKey: ["classes-list"],
    queryFn: async () => (await supabase.from("classes").select("*").order("name")).data ?? [],
  });
  const { data: students = [] } = useQuery({
    queryKey: ["students-class", classId],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("students").select("id, full_name").eq("class_id", classId).order("full_name")).data ?? [],
  });

  const student = students.find((s: any) => s.id === studentId);
  const isLocked = !!studentId && planInfo.isPerStudent && !isUnlocked(studentId);

  function handlePrint() {
    if (isLocked) return;
    void logActivity({
      action: "print",
      entity_type: "bulletin",
      entity_id: studentId || null,
      entity_label: student?.full_name ?? null,
      metadata: { periode: periodLabel(period) },
    });
    window.print();
  }

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="font-display text-3xl font-bold">Bulletins scolaires</h1>
        <p className="text-muted-foreground mt-1">Génération automatique conforme au système éducatif guinéen.</p>
      </div>

      <Card className="no-print">
        <CardContent className="p-4 grid gap-3 md:grid-cols-3">
          <div>
            <Label>Classe</Label>
            <Select value={classId} onValueChange={(v) => { setClassId(v); setStudentId(""); }}>
              <SelectTrigger><SelectValue placeholder="Choisir une classe" /></SelectTrigger>
              <SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.level}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Période</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{BULLETIN_PERIODS.map((p) => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Élève</Label>
            <Select value={studentId} onValueChange={setStudentId} disabled={!classId}>
              <SelectTrigger><SelectValue placeholder="Choisir un élève" /></SelectTrigger>
              <SelectContent>
                {students.map((s: any) => {
                  const locked = planInfo.isPerStudent && !paidIds.has(s.id);
                  return (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}{locked ? " (non payé)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {studentId && classId && isLocked && (
        <Card className="no-print">
          <CardContent className="py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
            <Lock className="size-6" />
            <p>Bulletin verrouillé — la cotisation annuelle de {student?.full_name} doit être réglée pour y accéder.</p>
          </CardContent>
        </Card>
      )}

      {studentId && classId && !isLocked && (
        <>
          <div className="flex flex-wrap gap-2 no-print">
            <Button onClick={() => setPreview(true)} variant="secondary" className="gap-2"><Eye className="size-4" />Aperçu A4</Button>
            <Button onClick={handlePrint} className="gap-2"><Printer className="size-4" />Imprimer</Button>
            <Button onClick={handlePrint} variant="outline" className="gap-2"><FileDown className="size-4" />Télécharger PDF</Button>
          </div>

          <div className={preview ? "no-print" : undefined}>
            <BulletinDocument studentId={studentId} classId={classId} period={period} />
          </div>

          <BulletinPreviewDialog
            open={preview}
            onOpenChange={setPreview}
            studentId={studentId}
            studentName={student?.full_name}
            classId={classId}
            defaultPeriod={period}
          />
        </>
      )}

      <style>{`
        .bulletin-analytics .recharts-surface { overflow: visible; }
        @media print {
          body * { visibility: hidden; }
          .bulletin, .bulletin * { visibility: visible; }
          .bulletin { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: none; }
          .no-print { display: none !important; }
          .bulletin-analytics { page-break-inside: auto; }
          .bulletin-analytics .break-inside-avoid { page-break-inside: avoid; break-inside: avoid; }
          .bulletin-analytics * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 1cm; }
        }
      `}</style>
    </div>
  );
}
