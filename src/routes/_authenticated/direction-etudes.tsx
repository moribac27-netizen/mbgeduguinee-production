import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GraduationCap, Users, BookOpen, AlertTriangle, CalendarDays, ClipboardList,
  FileText, UserCheck, MessageSquare, TrendingUp,
} from "lucide-react";
import { maxScoreForLevel } from "@/lib/grading";
import { getCurrentAcademicYear } from "@/lib/academic-year";

export const Route = createFileRoute("/_authenticated/direction-etudes")({
  head: () => ({
    meta: [
      { title: "Direction des études — MBGEduGuinée" },
      { name: "description", content: "Pilotage pédagogique : effectifs, moyennes par classe et par matière, alertes et raccourcis." },
      { property: "og:title", content: "Direction des études — MBGEduGuinée" },
      { property: "og:description", content: "Tableau de bord pédagogique de l'établissement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirectionEtudesPage,
});

const SHORTCUTS = [
  { to: "/emploi-du-temps", label: "Emplois du temps", icon: CalendarDays },
  { to: "/notes", label: "Notes", icon: ClipboardList },
  { to: "/bulletins", label: "Bulletins", icon: FileText },
  { to: "/presences", label: "Présences", icon: UserCheck },
  { to: "/affectations", label: "Affectations", icon: BookOpen },
  { to: "/messagerie", label: "Messagerie enseignants", icon: MessageSquare },
] as const;

function DirectionEtudesPage() {
  const today = new Date().toISOString().slice(0, 10);

  const { data: classes = [] } = useQuery({
    queryKey: ["de-classes"],
    queryFn: async () => (await supabase.from("classes").select("id, name, level").order("name")).data ?? [],
  });
  const { data: students = [] } = useQuery({
    queryKey: ["de-students"],
    queryFn: async () => (await supabase.from("students").select("id, class_id, full_name")).data ?? [],
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["de-subjects"],
    queryFn: async () => (await supabase.from("subjects").select("id, name, coefficient")).data ?? [],
  });
  const { data: grades = [] } = useQuery({
    queryKey: ["de-grades"],
    queryFn: async () => (await supabase.from("grades").select("student_id, subject_id, score, period").eq("academic_year", getCurrentAcademicYear())).data ?? [],
  });
  const { data: slots = [] } = useQuery({
    queryKey: ["de-slots"],
    queryFn: async () => (await supabase.from("schedule_slots").select("id, class_id")).data ?? [],
  });
  const { data: absences = [] } = useQuery({
    queryKey: ["de-absences", today],
    queryFn: async () =>
      (await supabase.from("student_attendance").select("id, student_id, status, date").eq("date", today)).data ?? [],
  });

  const byClass = useMemo(() => {
    const studentClass = new Map(students.map((s: any) => [s.id, s.class_id]));
    return classes.map((c: any) => {
      const ids = students.filter((s: any) => s.class_id === c.id).map((s: any) => s.id);
      const gs = grades.filter((g: any) => ids.includes(g.student_id));
      const max = maxScoreForLevel(c.level);
      const perStudent = ids.map((id: string) => {
        const own = gs.filter((g: any) => g.student_id === id);
        return own.length ? own.reduce((a: number, g: any) => a + Number(g.score), 0) / own.length : null;
      });
      const rated = perStudent.filter((v): v is number => v != null);
      const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
      const pass = rated.length ? (rated.filter((v) => (max === 10 ? v * 2 : v) >= 10).length / rated.length) * 100 : null;
      return {
        ...c,
        effectif: ids.length,
        avg,
        max,
        pass,
        hasSchedule: slots.some((s: any) => s.class_id === c.id),
        noGrades: gs.length === 0,
        studentClass,
      };
    });
  }, [classes, students, grades, slots]);

  const bySubject = useMemo(() => {
    return subjects
      .map((sub: any) => {
        const gs = grades.filter((g: any) => g.subject_id === sub.id);
        const avg = gs.length ? gs.reduce((a: number, g: any) => a + Number(g.score), 0) / gs.length : null;
        return { ...sub, count: gs.length, avg };
      })
      .sort((a: any, b: any) => (b.avg ?? -1) - (a.avg ?? -1));
  }, [subjects, grades]);

  const totalStudents = students.length;
  const ratedClasses = byClass.filter((c: any) => c.avg != null);
  const globalAvg = ratedClasses.length
    ? ratedClasses.reduce((a: number, c: any) => a + c.avg, 0) / ratedClasses.length
    : null;
  const absentToday = absences.filter((a: any) => a.status === "absent").length;
  const lateToday = absences.filter((a: any) => a.status === "retard").length;

  const alerts = [
    ...byClass.filter((c: any) => !c.hasSchedule).map((c: any) => `Aucun emploi du temps pour la classe ${c.name}`),
    ...byClass.filter((c: any) => c.noGrades && c.effectif > 0).map((c: any) => `Aucune note saisie pour la classe ${c.name}`),
    ...(absentToday > 0 ? [`${absentToday} absence(s) enregistrée(s) aujourd'hui`] : []),
    ...(lateToday > 0 ? [`${lateToday} retard(s) enregistré(s) aujourd'hui`] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <GraduationCap className="size-7" /> Direction des études
        </h1>
        <p className="text-muted-foreground mt-1">Pilotage pédagogique de l'établissement : effectifs, résultats et alertes.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Users} label="Élèves" value={totalStudents} />
        <Kpi icon={BookOpen} label="Classes" value={classes.length} />
        <Kpi icon={TrendingUp} label="Moyenne générale" value={globalAvg != null ? globalAvg.toFixed(2) : "—"} />
        <Kpi icon={UserCheck} label="Absents aujourd'hui" value={absentToday} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="size-4" /> Alertes pédagogiques</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.length === 0 && <p className="text-sm text-muted-foreground">Aucune alerte. Tout est à jour.</p>}
          {alerts.map((a, i) => (
            <div key={i} className="text-sm flex items-center gap-2 rounded-md border px-3 py-2">
              <AlertTriangle className="size-4 text-amber-600 shrink-0" /> {a}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Par classe</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {byClass.length === 0 && <p className="text-sm text-muted-foreground">Aucune classe.</p>}
            {byClass.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{c.name} <span className="text-muted-foreground font-normal">({c.level})</span></div>
                  <div className="text-xs text-muted-foreground">{c.effectif} élève(s)</div>
                </div>
                <Badge variant="secondary">{c.avg != null ? `${c.avg.toFixed(2)} / ${c.max}` : "—"}</Badge>
                <Badge variant={c.pass != null && c.pass >= 50 ? "default" : "outline"}>
                  {c.pass != null ? `${c.pass.toFixed(0)} % réussite` : "—"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Par matière</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {bySubject.length === 0 && <p className="text-sm text-muted-foreground">Aucune matière.</p>}
            {bySubject.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.count} note(s) · coef. {s.coefficient}</div>
                </div>
                <Badge variant="secondary">{s.avg != null ? s.avg.toFixed(2) : "—"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Raccourcis pédagogiques</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {SHORTCUTS.map((s) => {
            const Icon = s.icon;
            return (
              <Button key={s.to} asChild variant="outline" size="sm" className="gap-2">
                <Link to={s.to}><Icon className="size-4" /> {s.label}</Link>
              </Button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
