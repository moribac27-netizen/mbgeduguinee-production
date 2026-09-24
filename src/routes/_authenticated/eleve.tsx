import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Eye, GraduationCap, CreditCard, UserCheck, CalendarDays, Megaphone, FileText } from "lucide-react";
import { maxScoreForLevel } from "@/lib/grading";
import { StudentPhoto } from "@/components/StudentPhoto";
import { BulletinAnalytics } from "@/components/BulletinAnalytics";
import { BulletinPreviewDialog } from "@/components/BulletinPreviewDialog";
import { CotisationCard } from "@/components/CotisationCard";
import { usePerStudentPlan } from "@/hooks/usePerStudentPlan";

export const Route = createFileRoute("/_authenticated/eleve")({
  head: () => ({ meta: [{ title: "Espace Élève — MBGEduGuinée" }] }),
  component: StudentPortal,
});

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}

function StudentPortal() {
  const { data: student, isLoading, isError, error } = useQuery({
    queryKey: ["me-student"],
    queryFn: async () => {
      const { data: user, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const uid = user.user?.id;
      if (!uid) return null;
      const { data, error: studentError } = await supabase
        .from("students")
        .select("id, full_name, matricule, class_id, photo_url, classes(name, level)")
        .eq("student_user_id", uid)
        .maybeSingle();
      if (studentError) throw studentError;
      return data;
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Chargement...</p>;
  if (isError) {
    return (
      <Card><CardContent className="py-10 text-center">
        <p className="text-destructive font-medium">Impossible de charger votre espace élève.</p>
        <p className="text-sm text-muted-foreground mt-1">Vérifiez votre connexion puis réessayez.</p>
        {import.meta.env.DEV && error instanceof Error && (
          <p className="text-xs text-muted-foreground mt-2">{error.message}</p>
        )}
      </CardContent></Card>
    );
  }
  if (!student) {
    return (
      <Card><CardContent className="py-10 text-center text-muted-foreground">
        Votre compte n'est pas encore rattaché à un dossier élève. Contactez l'administration.
      </CardContent></Card>
    );
  }

  return <StudentDashboard student={student} />;
}

function StudentDashboard({ student }: { student: any }) {
  const studentId = student.id;
  const [preview, setPreview] = useState(false);
  const max = maxScoreForLevel(student.classes?.level) as 10 | 20;
  const { info: planInfo, loading: planLoading, error: planError } = usePerStudentPlan();
  const { data: planPayment, isLoading: planPaymentLoading, error: planPaymentError } = useQuery({
    queryKey: ["student-plan-payment", studentId, planInfo.academicYear],
    enabled: !!studentId && !!planInfo.academicYear && planInfo.isPerStudent,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("student_plan_payments")
        .select("id, status, academic_year, amount, receipt_number, paid_at, reference")
        .eq("student_id", studentId)
        .eq("academic_year", planInfo.academicYear)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
  const planCheckLoading = planLoading || planPaymentLoading;
  const planCheckError = planError || planPaymentError;
  const contentLocked = !!planCheckError || planCheckLoading || (planInfo.isPerStudent && planPayment?.status !== "VALIDATED");
  const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  const { data: grades = [], error: gradesError } = useQuery({
    queryKey: ["eleve-grades", studentId],
    queryFn: async () => (await supabase.from("grades").select("id, score, period, evaluation_type, created_at, subjects(name, coefficient)").eq("student_id", studentId).order("created_at", { ascending: false })).data ?? [],
  });
  const { data: payments = [], error: paymentsError } = useQuery({
    queryKey: ["eleve-payments", studentId],
    queryFn: async () => (await supabase.from("payments").select("id, amount, payment_type, period, payment_method, paid_at, validation_status, receipt_number").eq("student_id", studentId).order("paid_at", { ascending: false })).data ?? [],
  });
  const { data: attendance = [], error: attendanceError } = useQuery({
    queryKey: ["eleve-attendance", studentId],
    queryFn: async () => (await supabase.from("student_attendance").select("id, status, date, justification").eq("student_id", studentId).order("date", { ascending: false }).limit(60)).data ?? [],
  });
  const { data: schedule = [], error: scheduleError } = useQuery({
    queryKey: ["eleve-schedule", student.class_id],
    enabled: !!student.class_id,
    queryFn: async () => (await supabase.from("schedule_slots").select("id, day_of_week, start_time, end_time, subjects(name), rooms(name), teachers(full_name)").eq("class_id", student.class_id).order("day_of_week").order("start_time")).data ?? [],
  });
  const { data: announcements = [], error: announcementsError } = useQuery({
    queryKey: ["eleve-announcements"],
    queryFn: async () => (await supabase.from("announcements").select("id, title, content, created_at").order("created_at", { ascending: false }).limit(10)).data ?? [],
  });

  const perSubject = new Map<string, { total: number; coef: number }>();
  for (const g of grades) {
    const name = (g as any).subjects?.name ?? "—";
    const coef = (g as any).subjects?.coefficient ?? 1;
    const cur = perSubject.get(name) ?? { total: 0, coef: 0 };
    cur.total += Number(g.score) * coef;
    cur.coef += coef;
    perSubject.set(name, cur);
  }
  const avgList = Array.from(perSubject.entries()).map(([name, s]) => ({ name, avg: s.coef ? s.total / s.coef : 0 }));
  const overall = avgList.length ? avgList.reduce((a, b) => a + b.avg, 0) / avgList.length : 0;
  const absents = attendance.filter((a: any) => a.status === "absent").length;
  const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <StudentPhoto path={student.photo_url} name={student.full_name} size="lg" />
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Bonjour, {student.full_name}</h1>
          <p className="text-muted-foreground">{student.matricule} · {student.classes?.name ?? "—"}</p>
        </div>
      </div>

      <CotisationCard
        studentId={student.id}
        studentName={student.full_name}
        matricule={student.matricule}
        className={student.classes?.name ?? null}
      />


      {planCheckError && (
        <Card className="border-destructive/30">
          <CardContent className="py-4">
            <p className="text-sm font-medium text-destructive">Impossible de vérifier l'état de la cotisation annuelle.</p>
            <p className="text-xs text-muted-foreground mt-1">Les notes et le bulletin restent temporairement protégés.</p>
            {import.meta.env.DEV && planCheckError instanceof Error && <p className="text-xs text-muted-foreground mt-2">{planCheckError.message}</p>}
          </CardContent>
        </Card>
      )}
      {(gradesError || paymentsError || attendanceError || scheduleError || announcementsError) && (
        <Card className="border-amber-500/30">
          <CardContent className="py-4">
            <p className="text-sm font-medium">Certaines données n'ont pas pu être chargées.</p>
            <p className="text-xs text-muted-foreground mt-1">Les zones concernées sont affichées sans masquer l'erreur.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<GraduationCap className="size-4" />} label={`Moyenne ${max === 10 ? "/10" : "/20"}`} value={contentLocked ? "—" : overall.toFixed(2)} />
        <Stat icon={<UserCheck className="size-4" />} label="Absences" value={String(absents)} />
        <Stat icon={<CreditCard className="size-4" />} label="Total payé (GNF)" value={fmt(totalPaid)} />
        <Stat icon={<FileText className="size-4" />} label="Notes enregistrées" value={String(grades.length)} />
      </div>

      <Tabs defaultValue="notes">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="notes"><GraduationCap className="size-4 mr-1" />Notes</TabsTrigger>
          <TabsTrigger value="paiements"><CreditCard className="size-4 mr-1" />Paiements</TabsTrigger>
          <TabsTrigger value="presences"><UserCheck className="size-4 mr-1" />Présences</TabsTrigger>
          <TabsTrigger value="edt"><CalendarDays className="size-4 mr-1" />Emploi du temps</TabsTrigger>
          <TabsTrigger value="bulletin"><FileText className="size-4 mr-1" />Bulletin</TabsTrigger>
          <TabsTrigger value="annonces"><Megaphone className="size-4 mr-1" />Annonces</TabsTrigger>
        </TabsList>

        <TabsContent value="notes">
          {contentLocked ? (
            <LockedNotice />
          ) : (
          <>
          <Card><CardHeader><CardTitle>Moyennes par matière</CardTitle></CardHeader><CardContent>
            {avgList.length === 0 ? <p className="text-muted-foreground">Aucune note.</p> : (
              <div className="space-y-2">
                {avgList.map((s) => (
                  <div key={s.name} className="flex justify-between border-b py-2">
                    <span>{s.name}</span><span className="font-medium">{s.avg.toFixed(2)} / {max}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
          <Card className="mt-4"><CardHeader><CardTitle>Historique</CardTitle></CardHeader><CardContent>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {grades.map((g: any) => (
                <div key={g.id} className="flex justify-between text-sm border-b py-1.5">
                  <span>{g.subjects?.name} <span className="text-muted-foreground">· {g.evaluation_type} · {g.period}</span></span>
                  <span className="font-medium">{Number(g.score).toFixed(2)} / {max}</span>
                </div>
              ))}
            </div>
          </CardContent></Card>
          </>
          )}
        </TabsContent>

        <TabsContent value="paiements">
          <Card><CardHeader><CardTitle>Mes paiements</CardTitle></CardHeader><CardContent>
            {payments.length === 0 ? <p className="text-muted-foreground">Aucun paiement.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="py-2">Date</th><th>Type</th><th>Période</th><th>Statut</th><th className="text-right">Montant</th><th>Reçu</th></tr></thead>
                  <tbody>{payments.map((p: any) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-2">{p.paid_at ? new Date(p.paid_at).toLocaleDateString("fr-FR") : "—"}</td>
                      <td>{p.payment_type}</td><td>{p.period ?? "—"}</td>
                      <td><Badge variant={p.validation_status === "validé" ? "default" : "secondary"}>{p.validation_status}</Badge></td>
                      <td className="text-right font-medium">{fmt(Number(p.amount))} GNF</td>
                      <td>{p.receipt_number ? <Link className="text-primary underline" to="/verifier-recu/$number" params={{ number: p.receipt_number }}>{p.receipt_number}</Link> : "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="presences">
          <Card><CardHeader><CardTitle>Mes présences</CardTitle></CardHeader><CardContent>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {attendance.map((a: any) => (
                <div key={a.id} className="flex justify-between text-sm border-b py-1.5">
                  <span>{new Date(a.date).toLocaleDateString("fr-FR")}</span>
                  <Badge variant={a.status === "present" ? "default" : a.status === "retard" ? "secondary" : "destructive"}>{a.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="edt">
          <Card><CardHeader><CardTitle>Emploi du temps</CardTitle></CardHeader><CardContent>
            {schedule.length === 0 ? <p className="text-muted-foreground">Aucun cours planifié.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="py-2">Jour</th><th>Horaire</th><th>Matière</th><th>Enseignant</th><th>Salle</th></tr></thead>
                  <tbody>{schedule.map((s: any) => (
                    <tr key={s.id} className="border-b">
                      <td className="py-2">{days[s.day_of_week - 1] ?? s.day_of_week}</td>
                      <td>{s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)}</td>
                      <td>{s.subjects?.name}</td><td>{s.teachers?.full_name ?? "—"}</td><td>{s.rooms?.name ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="bulletin">
          {contentLocked ? (
            <LockedNotice />
          ) : (
          <Card><CardHeader><CardTitle>Mon bulletin</CardTitle></CardHeader><CardContent>
            <p className="text-muted-foreground mb-3">Aperçu A4 identique au PDF imprimé.</p>
            <Button onClick={() => setPreview(true)} disabled={!student.class_id} className="gap-2">
              <Eye className="size-4" /> Aperçu avant impression
            </Button>
            {student.class_id && (
              <BulletinAnalytics studentId={studentId} classId={student.class_id} maxScore={max} variant="screen" />
            )}
            {student.class_id && (
              <BulletinPreviewDialog
                open={preview}
                onOpenChange={setPreview}
                studentId={studentId}
                studentName={student.full_name}
                classId={student.class_id}
              />
            )}
          </CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="annonces">
          <Card><CardHeader><CardTitle>Annonces</CardTitle></CardHeader><CardContent>
            {announcements.length === 0 ? <p className="text-muted-foreground">Aucune annonce.</p> : (
              <div className="space-y-3">{announcements.map((a: any) => (
                <div key={a.id} className="border-b pb-3">
                  <div className="flex items-start justify-between"><h4 className="font-medium">{a.title}</h4>
                    <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString("fr-FR")}</span></div>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.content}</p>
                </div>
              ))}</div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LockedNotice() {
  return (
    <Card><CardContent className="py-8 text-center">
      <p className="font-medium">Notes et bulletin verrouillés</p>
      <p className="text-sm text-muted-foreground mt-1">La cotisation annuelle doit être validée par l'école pour accéder à ces contenus.</p>
    </CardContent></Card>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="text-2xl font-bold mt-2">{value}</div>
    </CardContent></Card>
  );
}
