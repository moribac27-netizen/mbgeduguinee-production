import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSchool } from "@/hooks/useSchool";
import { usePerStudentPlan } from "@/hooks/usePerStudentPlan";
import { fmtMoney, fmtNum } from "@/lib/reports";
import { Briefcase, Users, GraduationCap, BookOpen, Baby, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/directeur")({
  head: () => ({
    meta: [
      { title: "Espace Directeur — MBGEduGuinée" },
      { name: "description", content: "Vue globale de l'école : effectifs, classes, enseignants, maternelle, finances et cotisations annuelles." },
      { property: "og:title", content: "Espace Directeur — MBGEduGuinée" },
      { property: "og:description", content: "Tableau de bord de synthèse en lecture seule pour la direction de l'établissement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirecteurPage,
});

const today = () => new Date().toISOString().slice(0, 10);

function DirecteurPage() {
  const { school } = useSchool();
  const { info: contribution } = usePerStudentPlan();

  const { data } = useQuery({
    queryKey: ["directeur-overview"],
    staleTime: 60_000,
    queryFn: async () => {
      const [students, teachers, classes, payments, expenses, sections, children, logs] = await Promise.all([
        supabase.from("students").select("id, class_id, classes(name)"),
        supabase.from("teachers").select("id, full_name, subject_id"),
        supabase.from("classes").select("id, name, level, annual_fee"),
        supabase.from("payments").select("amount, paid_at"),
        supabase.from("expenses").select("amount"),
        supabase.from("nursery_sections" as any).select("id, name, capacity"),
        supabase.from("nursery_children" as any).select("id, section_id"),
        supabase.from("nursery_daily_logs" as any).select("id", { count: "exact", head: true }).eq("date", today()),
      ]);

      const studentRows = (students.data ?? []) as any[];
      const classRows = (classes.data ?? []) as any[];
      const paymentRows = (payments.data ?? []) as any[];
      const expenseRows = (expenses.data ?? []) as any[];
      const childRows = (children.data ?? []) as any[];

      const month = new Date().toISOString().slice(0, 7);
      const revenue = paymentRows.reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const revenueMonth = paymentRows
        .filter((p) => String(p.paid_at ?? "").slice(0, 7) === month)
        .reduce((s, p) => s + Number(p.amount ?? 0), 0);
      const expensesTotal = expenseRows.reduce((s, e) => s + Number(e.amount ?? 0), 0);

      const byClass = classRows
        .map((c) => ({
          id: c.id,
          name: c.name,
          level: c.level ?? "—",
          count: studentRows.filter((s) => s.class_id === c.id).length,
          fee: Number(c.annual_fee ?? 0),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const nurserySections = ((sections.data ?? []) as any[]).map((s) => ({
        id: s.id,
        name: s.name,
        capacity: s.capacity ?? null,
        count: childRows.filter((c) => c.section_id === s.id).length,
      }));

      return {
        students: studentRows.length,
        teachers: (teachers.data ?? []).length,
        classes: classRows.length,
        byClass,
        nurserySections,
        nurseryChildren: childRows.length,
        nurseryLogsToday: logs.count ?? 0,
        revenue,
        revenueMonth,
        expensesTotal,
        balance: revenue - expensesTotal,
      };
    },
  });

  const stats = [
    { label: "Élèves inscrits", value: fmtNum(data?.students ?? 0), icon: Users, to: "/eleves" as const },
    { label: "Enseignants", value: fmtNum(data?.teachers ?? 0), icon: GraduationCap, to: "/enseignants" as const },
    { label: "Classes", value: fmtNum(data?.classes ?? 0), icon: BookOpen, to: "/classes" as const },
    { label: "Enfants maternelle", value: fmtNum(data?.nurseryChildren ?? 0), icon: Baby, to: "/maternelle" as const },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Briefcase className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold">Espace Directeur</h1>
          <p className="text-muted-foreground mt-1">
            Vue globale {school?.name ? `de ${school.name}` : "de l'établissement"} — synthèse en lecture seule.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} to={s.to}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-muted flex items-center justify-center">
                    <Icon className="size-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <div className="text-2xl font-bold">{s.value}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Effectifs par classe</CardTitle>
            <CardDescription>Répartition des élèves et frais annuels de référence.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Classe</TableHead>
                  <TableHead>Niveau</TableHead>
                  <TableHead className="text-right">Élèves</TableHead>
                  <TableHead className="text-right">Frais annuels</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.byClass ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.level}</TableCell>
                    <TableCell className="text-right">{fmtNum(c.count)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(c.fee)}</TableCell>
                  </TableRow>
                ))}
                {(data?.byClass ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      Aucune classe enregistrée.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Wallet className="size-4" /> Finances</CardTitle>
            <CardDescription>Indicateurs agrégés des modules Paiements et Comptabilité.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Encaissements du mois" value={fmtMoney(data?.revenueMonth ?? 0)} />
            <Row label="Encaissements cumulés" value={fmtMoney(data?.revenue ?? 0)} />
            <Row label="Dépenses cumulées" value={fmtMoney(data?.expensesTotal ?? 0)} />
            <Row label="Solde" value={fmtMoney(data?.balance ?? 0)} strong />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Baby className="size-4" /> Maternelle</CardTitle>
            <CardDescription>{fmtNum(data?.nurseryLogsToday ?? 0)} suivi(s) saisi(s) aujourd'hui.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Section</TableHead>
                  <TableHead className="text-right">Enfants</TableHead>
                  <TableHead className="text-right">Capacité</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.nurserySections ?? []).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">{fmtNum(s.count)}</TableCell>
                    <TableCell className="text-right">{s.capacity ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {(data?.nurserySections ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                      Aucune section maternelle.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cotisation annuelle de l'école</CardTitle>
            <CardDescription>Progression calculée à partir des cotisations VALIDATED.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted-foreground">Accès global</span><Badge variant={contribution.unlocked ? "default" : "secondary"}>{contribution.accessMode}</Badge></div>
            <Row label="Cotisations validées" value={`${contribution.paidCount} / ${contribution.threshold}`} />
            <Row label="Restantes" value={fmtNum(contribution.remaining)} />
            <Row label="Part école" value={fmtMoney(contribution.schoolRevenue)} />
            <Row label="Montant / élève" value={fmtMoney(contribution.unitPrice)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}
