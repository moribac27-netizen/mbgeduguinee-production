import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, GraduationCap, CreditCard, UserCheck, CalendarDays, Megaphone, FileText, Eye, UserPlus, Lock } from "lucide-react";
import { maxScoreForLevel } from "@/lib/grading";
import { StudentPhoto } from "@/components/StudentPhoto";
import { BulletinAnalytics } from "@/components/BulletinAnalytics";
import { BulletinPreviewDialog } from "@/components/BulletinPreviewDialog";
import { CotisationCard } from "@/components/CotisationCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { linkAdditionalChild } from "@/lib/access-codes.functions";
import { toast } from "sonner";
import { usePerStudentPlan, usePaidStudentIds } from "@/hooks/usePerStudentPlan";

export const Route = createFileRoute("/_authenticated/parent")({
  head: () => ({ meta: [{ title: "Espace Parent — MBGEduGuinée" }] }),
  component: ParentPortal,
});

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}

function ParentPortal() {
  // Fetch children linked to current parent via student_parents OR legacy parent_user_id
  const { data: children = [], isLoading } = useQuery({
    queryKey: ["parent-children"],
    queryFn: async () => {
      const { data: user } = await supabase.auth.getUser();
      const uid = user.user?.id;
      if (!uid) return [];
      const { data } = await supabase
        .from("students")
        .select("id, full_name, matricule, photo_url, class_id, classes(name, level)")
        .order("full_name");
      return data ?? [];
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedId && children.length > 0) setSelectedId(children[0].id);
  }, [children, selectedId]);

  const selected = children.find((c: any) => c.id === selectedId);

  const [addChildOpen, setAddChildOpen] = useState(false);

  // Plan "par élève" : statut de paiement par enfant, calculé une seule fois
  // pour l'école du parent connecté et réutilisé pour le badge + le verrouillage.
  const { info: planInfo } = usePerStudentPlan();
  const { paidIds } = usePaidStudentIds(planInfo.schoolId, planInfo.academicYear, planInfo.isPerStudent);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-display font-bold">Espace Parent</h1>
          <p className="text-muted-foreground">Suivez la scolarité de vos enfants en un coup d'œil.</p>
        </div>
        <Button variant="outline" onClick={() => setAddChildOpen(true)}>
          <UserPlus className="size-4 mr-2" /> Ajouter un enfant
        </Button>
      </div>

      <AddChildDialog open={addChildOpen} onOpenChange={setAddChildOpen} />

      {isLoading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : children.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucun enfant n'est encore lié à votre compte. Contactez l'administration de l'école.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Users className="size-5" /> Mes enfants</CardTitle>
              <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
                <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {children.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {children.map((c: any) => {
                  const unpaid = planInfo.isPerStudent && !paidIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={`px-4 py-3 rounded-lg border text-left transition flex items-center gap-3 ${selectedId === c.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
                    >
                      <StudentPhoto path={c.photo_url} name={c.full_name} size="sm" />
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {c.full_name}
                          {unpaid && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Non payé</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{c.matricule} · {c.classes?.name ?? "—"}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {selected && (
            <ChildDetails
              student={selected}
              isLocked={planInfo.isPerStudent && !paidIds.has(selected.id)}
            />
          )}
        </>
      )}
    </div>
  );
}

function ChildDetails({ student, isLocked }: { student: any; isLocked: boolean }) {
  const studentId = student.id;
  const [preview, setPreview] = useState(false);
  const max = maxScoreForLevel(student.classes?.level) as 10 | 20;

  const { data: grades = [] } = useQuery({
    queryKey: ["parent-grades", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("grades")
        .select("id, score, period, evaluation_type, created_at, subjects(name, coefficient)")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["parent-payments", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("id, amount, payment_type, period, payment_method, paid_at, validation_status, receipt_number")
        .eq("student_id", studentId)
        .order("paid_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["parent-attendance", studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_attendance")
        .select("id, status, date, justification")
        .eq("student_id", studentId)
        .order("date", { ascending: false })
        .limit(60);
      return data ?? [];
    },
  });

  const { data: schedule = [] } = useQuery({
    queryKey: ["parent-schedule", student.class_id],
    enabled: !!student.class_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("schedule_slots")
        .select("id, day_of_week, start_time, end_time, subjects(name), rooms(name), teachers(full_name)")
        .eq("class_id", student.class_id)
        .order("day_of_week")
        .order("start_time");
      return data ?? [];
    },
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ["parent-announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id, title, content, created_at, audience")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  // Compute weighted average
  const perSubject = new Map<string, { total: number; coef: number; name: string }>();
  for (const g of grades) {
    const name = (g as any).subjects?.name ?? "—";
    const coef = (g as any).subjects?.coefficient ?? 1;
    const cur = perSubject.get(name) ?? { total: 0, coef: 0, name };
    cur.total += Number(g.score) * coef;
    cur.coef += coef;
    perSubject.set(name, cur);
  }
  const avgList = Array.from(perSubject.values()).map((s) => ({ name: s.name, avg: s.coef ? s.total / s.coef : 0 }));
  const overall = avgList.length ? avgList.reduce((a, b) => a + b.avg, 0) / avgList.length : 0;

  const absents = attendance.filter((a: any) => a.status === "absent").length;
  const retards = attendance.filter((a: any) => a.status === "retard").length;
  const totalDue = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

  const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  const LockedNotice = ({ what }: { what: string }) => (
    <Card>
      <CardContent className="py-10 text-center text-muted-foreground flex flex-col items-center gap-2">
        <Lock className="size-6" />
        <p>{what} verrouillé{what.endsWith("s") ? "s" : ""} — la cotisation annuelle de {student.full_name} doit être réglée pour y accéder.</p>
      </CardContent>
    </Card>
  );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<GraduationCap className="size-4" />}
          label={`Moyenne générale ${max === 10 ? "/10" : "/20"}`}
          value={isLocked ? "—" : overall.toFixed(2)}
        />
        <StatCard icon={<UserCheck className="size-4" />} label="Absences" value={String(absents)} sub={`${retards} retards`} />
        <StatCard icon={<CreditCard className="size-4" />} label="Total payé (GNF)" value={fmt(totalDue)} />
        <StatCard icon={<FileText className="size-4" />} label="Classe" value={student.classes?.name ?? "—"} />
      </div>

      <div className="mt-4">
        <CotisationCard
          studentId={student.id}
          studentName={student.full_name}
          matricule={student.matricule}
          className={student.classes?.name ?? null}
        />
      </div>

      <Tabs defaultValue="notes" className="mt-2">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="notes"><GraduationCap className="size-4 mr-1" /> Notes</TabsTrigger>
          <TabsTrigger value="paiements"><CreditCard className="size-4 mr-1" /> Paiements</TabsTrigger>
          <TabsTrigger value="presences"><UserCheck className="size-4 mr-1" /> Présences</TabsTrigger>
          <TabsTrigger value="edt"><CalendarDays className="size-4 mr-1" /> Emploi du temps</TabsTrigger>
          <TabsTrigger value="bulletin"><FileText className="size-4 mr-1" /> Bulletin</TabsTrigger>
          <TabsTrigger value="annonces"><Megaphone className="size-4 mr-1" /> Annonces</TabsTrigger>
        </TabsList>

        <TabsContent value="notes">
          {isLocked ? (
            <LockedNotice what="Notes" />
          ) : (
            <>
              <Card><CardHeader><CardTitle>Notes par matière</CardTitle></CardHeader><CardContent>
                {avgList.length === 0 ? <p className="text-muted-foreground">Aucune note.</p> : (
                  <div className="space-y-2">
                    {avgList.map((s) => (
                      <div key={s.name} className="flex justify-between border-b py-2">
                        <span>{s.name}</span>
                        <span className="font-medium">{s.avg.toFixed(2)} / {max}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent></Card>

              <Card className="mt-4"><CardHeader><CardTitle>Historique des notes</CardTitle></CardHeader><CardContent>
                {grades.length === 0 ? <p className="text-muted-foreground">Aucune note.</p> : (
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {grades.map((g: any) => (
                      <div key={g.id} className="flex justify-between text-sm border-b py-1.5">
                        <div>
                          <span className="font-medium">{g.subjects?.name}</span>
                          <span className="text-muted-foreground ml-2">{g.evaluation_type} · {g.period}</span>
                        </div>
                        <span className="font-medium">{Number(g.score).toFixed(2)} / {max}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent></Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="paiements">
          <Card><CardHeader><CardTitle>Paiements</CardTitle></CardHeader><CardContent>
            {payments.length === 0 ? <p className="text-muted-foreground">Aucun paiement.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="py-2">Date</th><th>Type</th><th>Période</th><th>Méthode</th><th>Statut</th><th className="text-right">Montant</th><th>Reçu</th></tr></thead>
                  <tbody>
                    {payments.map((p: any) => (
                      <tr key={p.id} className="border-b">
                        <td className="py-2">{p.paid_at ? new Date(p.paid_at).toLocaleDateString("fr-FR") : "—"}</td>
                        <td>{p.payment_type}</td>
                        <td>{p.period ?? "—"}</td>
                        <td>{p.payment_method}</td>
                        <td><Badge variant={p.validation_status === "validé" ? "default" : "secondary"}>{p.validation_status}</Badge></td>
                        <td className="text-right font-medium">{fmt(Number(p.amount))} GNF</td>
                        <td>{p.receipt_number ? <Link className="text-primary underline" to="/verifier-recu/$number" params={{ number: p.receipt_number }}>{p.receipt_number}</Link> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="presences">
          <Card><CardHeader><CardTitle>Présences (60 derniers relevés)</CardTitle></CardHeader><CardContent>
            {attendance.length === 0 ? <p className="text-muted-foreground">Aucun relevé.</p> : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {attendance.map((a: any) => (
                  <div key={a.id} className="flex justify-between text-sm border-b py-1.5">
                    <span>{new Date(a.date).toLocaleDateString("fr-FR")}</span>
                    <Badge variant={a.status === "present" ? "default" : a.status === "retard" ? "secondary" : "destructive"}>{a.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="edt">
          <Card><CardHeader><CardTitle>Emploi du temps</CardTitle></CardHeader><CardContent>
            {schedule.length === 0 ? <p className="text-muted-foreground">Aucun cours planifié.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left border-b"><th className="py-2">Jour</th><th>Horaire</th><th>Matière</th><th>Enseignant</th><th>Salle</th></tr></thead>
                  <tbody>
                    {schedule.map((s: any) => (
                      <tr key={s.id} className="border-b">
                        <td className="py-2">{days[s.day_of_week - 1] ?? s.day_of_week}</td>
                        <td>{s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)}</td>
                        <td>{s.subjects?.name}</td>
                        <td>{s.teachers?.full_name ?? "—"}</td>
                        <td>{s.rooms?.name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="bulletin">
          {isLocked ? (
            <LockedNotice what="Bulletin" />
          ) : (
            <Card><CardHeader><CardTitle>Bulletin</CardTitle></CardHeader><CardContent>
              <p className="text-muted-foreground mb-3">Consultez l'aperçu A4 exact du bulletin, puis imprimez-le ou enregistrez-le en PDF.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setPreview(true)} disabled={!student.class_id} className="gap-2">
                  <Eye className="size-4" /> Aperçu avant impression
                </Button>
              </div>
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
              <div className="space-y-3">
                {announcements.map((a: any) => (
                  <div key={a.id} className="border-b pb-3">
                    <div className="flex items-start justify-between">
                      <h4 className="font-medium">{a.title}</h4>
                      <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString("fr-FR")}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.content}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
        <div className="text-2xl font-bold mt-2">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function AddChildDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const linkFn = useServerFn(linkAdditionalChild);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading || !code.trim()) return;
    setLoading(true);
    try {
      await linkFn({ data: { code: code.trim() } });
      toast.success("Enfant ajouté à votre compte.");
      qc.invalidateQueries({ queryKey: ["parent-children"] });
      setCode("");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Code invalide ou déjà utilisé.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Ajouter un enfant</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Code d'accès *</Label>
            <Input
              required
              autoFocus
              className="font-mono tracking-wider"
              placeholder="EX. EDG7X-9KQP2"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Demandez ce code à l'école pour cet enfant.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Rattachement..." : "Ajouter"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}