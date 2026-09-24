import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRoles, primaryRole } from "@/hooks/useAuth";
import {
  Users,
  GraduationCap,
  CreditCard,
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  BookOpenCheck,
  TrendingUp,
  Megaphone,
  ClipboardList,
  BookOpen,
  UserPlus,
  Wallet,
  Receipt,
  History,
  Bell,
  PenLine,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Tableau de bord — MBGEduGuinée" },
      { name: "description", content: "Indicateurs, finances et activités récentes de votre établissement." },
    ],
  }),
  component: Dashboard,
});

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const ACTION_LABELS: Record<string, string> = {
  login: "Connexion", logout: "Déconnexion", create: "Création", update: "Modification",
  delete: "Suppression", export: "Export", print: "Impression", view: "Consultation",
  upload: "Téléversement", download: "Téléchargement", send: "Envoi", publish: "Publication",
};

function Dashboard() {
  const { roles } = useRoles();
  const role = primaryRole(roles);
  const showFinance = roles.some((r) => ["admin", "directeur", "comptable"].includes(r));
  const showPedago = roles.some((r) => ["admin", "directeur", "enseignant"].includes(r));

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-smart"],
    staleTime: 60_000,
    queryFn: async () => {
      const today = todayISO();
      const monthStart = new Date();
      monthStart.setDate(1);
      const monthStartISO = monthStart.toISOString().slice(0, 10);

      const [
        students,
        teachers,
        parentsRes,
        classesRes,
        payments,
        studentsWithPay,
        attendanceToday,
        expensesAll,
        upcomingExams,
        recentAnnouncements,
        recentPayments,
        recentStudents,
        recentGrades,
        recentLogs,
        recentNotifications,
      ] = await Promise.all([
        supabase.from("students").select("id, gender", { count: "exact" }),
        supabase.from("teachers").select("id", { count: "exact", head: true }),
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "parent"),
        supabase.from("classes").select("id, name, annual_fee"),
        supabase.from("payments").select("amount, paid_at, payment_type"),
        supabase.from("students").select("id, full_name, class_id, classes(name, annual_fee), payments(amount)"),
        supabase.from("student_attendance").select("status").eq("date", today),
        supabase.from("expenses").select("amount, expense_date"),
        supabase.from("exams").select("id, name, exam_date, subject_id, class_id, classes(name)").gte("exam_date", today).order("exam_date", { ascending: true }).limit(5),
        supabase.from("announcements").select("id, title, created_at, target_role").order("created_at", { ascending: false }).limit(5),
        supabase.from("payments").select("id, amount, paid_at, payment_type, students(full_name)").order("paid_at", { ascending: false }).limit(5),
        supabase.from("students").select("id, full_name, created_at, classes(name)").order("created_at", { ascending: false }).limit(5),
        supabase.from("grades").select("id, score, created_at, students(full_name), subjects(name)").order("created_at", { ascending: false }).limit(5),
        supabase.from("activity_logs").select("id, action, entity_type, entity_label, actor_name, created_at").order("created_at", { ascending: false }).limit(6),
        supabase.from("notifications").select("id, title, body, created_at, link").order("created_at", { ascending: false }).limit(5),
      ]);

      const allPayments = payments.data ?? [];
      const allExpenses = expensesAll.data ?? [];

      const totalRevenue = allPayments.reduce((s, p: any) => s + Number(p.amount), 0);
      const totalExpenses = allExpenses.reduce((s: number, e: any) => s + Number(e.amount), 0);
      const monthRevenue = allPayments
        .filter((p: any) => String(p.paid_at) >= monthStartISO)
        .reduce((s, p: any) => s + Number(p.amount), 0);
      const dayRevenue = allPayments
        .filter((p: any) => String(p.paid_at).slice(0, 10) === today)
        .reduce((s, p: any) => s + Number(p.amount), 0);
      const dayCount = allPayments.filter((p: any) => String(p.paid_at).slice(0, 10) === today).length;
      const monthExpenses = allExpenses
        .filter((e: any) => String(e.expense_date) >= monthStartISO)
        .reduce((s: number, e: any) => s + Number(e.amount), 0);

      const late = (studentsWithPay.data ?? []).filter((s: any) => {
        const paid = (s.payments ?? []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
        const due = Number(s.classes?.annual_fee ?? 0);
        return due > 0 && paid < due * 0.5;
      });

      // Revenus vs Dépenses par mois (6 derniers)
      const now = new Date();
      const months: { label: string; revenus: number; depenses: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleDateString("fr-FR", { month: "short" });
        const revenus = allPayments
          .filter((p: any) => {
            const pd = new Date(p.paid_at);
            return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
          })
          .reduce((s, p: any) => s + Number(p.amount), 0);
        const depenses = allExpenses
          .filter((e: any) => {
            const pd = new Date(e.expense_date);
            return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
          })
          .reduce((s: number, e: any) => s + Number(e.amount), 0);
        months.push({ label, revenus, depenses });
      }

      // Répartition genre
      const genderData = (() => {
        const g = { Garçons: 0, Filles: 0, Autre: 0 };
        (students.data ?? []).forEach((s: any) => {
          if (s.gender === "M") g.Garçons++;
          else if (s.gender === "F") g.Filles++;
          else g.Autre++;
        });
        return Object.entries(g)
          .filter(([, v]) => v > 0)
          .map(([name, value]) => ({ name, value }));
      })();

      // Top classes par effectif
      const topClasses = (() => {
        const map = new Map<string, { name: string; count: number }>();
        (studentsWithPay.data ?? []).forEach((s: any) => {
          const name = s.classes?.name ?? "—";
          const cur = map.get(name) ?? { name, count: 0 };
          cur.count++;
          map.set(name, cur);
        });
        return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5);
      })();

      // Présence aujourd'hui
      const att = attendanceToday.data ?? [];
      const attTotal = att.length;
      const attPresent = att.filter((a: any) => a.status === "present" || a.status === "late").length;
      const attRate = attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : null;

      return {
        students: students.count ?? 0,
        teachers: teachers.count ?? 0,
        parents: parentsRes.count ?? 0,
        classes: (classesRes.data ?? []).length,
        revenue: totalRevenue,
        dayRevenue,
        dayCount,
        monthRevenue,
        monthExpenses,
        monthNet: monthRevenue - monthExpenses,
        balance: totalRevenue - totalExpenses,
        late: late.length,
        months,
        genderData,
        topClasses,
        attRate,
        attTotal,
        upcomingExams: upcomingExams.data ?? [],
        recentAnnouncements: recentAnnouncements.data ?? [],
        recentPayments: recentPayments.data ?? [],
        recentStudents: recentStudents.data ?? [],
        recentGrades: recentGrades.data ?? [],
        recentLogs: recentLogs.data ?? [],
        recentNotifications: recentNotifications.data ?? [],
      };
    },
  });

  const commonCards = [
    { label: "Élèves inscrits", value: fmt(stats?.students ?? 0), icon: Users, color: "text-primary bg-primary/10", to: "/eleves" as const, show: true },
    { label: "Enseignants", value: fmt(stats?.teachers ?? 0), icon: GraduationCap, color: "text-chart-2 bg-chart-2/10", to: "/enseignants" as const, show: showPedago },
    { label: "Parents", value: fmt(stats?.parents ?? 0), icon: Users, color: "text-chart-4 bg-chart-4/10", to: "/eleves" as const, show: showPedago },
    { label: "Classes", value: fmt(stats?.classes ?? 0), icon: BookOpen, color: "text-chart-5 bg-chart-5/10", to: "/classes" as const, show: true },
    { label: "Paiements du jour", value: fmt(stats?.dayRevenue ?? 0) + " GNF", icon: Receipt, color: "text-success bg-success/10", to: "/paiements" as const, show: showFinance },
    { label: "Paiements du mois", value: fmt(stats?.monthRevenue ?? 0) + " GNF", icon: CreditCard, color: "text-success bg-success/10", to: "/paiements" as const, show: showFinance },
    { label: "Dépenses du mois", value: fmt(stats?.monthExpenses ?? 0) + " GNF", icon: Wallet, color: "text-destructive bg-destructive/10", to: "/comptabilite" as const, show: showFinance },
    { label: "Solde actuel", value: fmt(stats?.balance ?? 0) + " GNF", icon: TrendingUp, color: (stats?.balance ?? 0) >= 0 ? "text-success bg-success/10" : "text-destructive bg-destructive/10", to: "/comptabilite" as const, show: showFinance },
    { label: "Présence aujourd'hui", value: stats?.attRate == null ? "—" : `${stats.attRate}%`, icon: CalendarCheck, color: "text-chart-3 bg-chart-3/10", to: "/presences" as const, show: showPedago },
    { label: "Retards paiement", value: fmt(stats?.late ?? 0), icon: AlertTriangle, color: "text-destructive bg-destructive/10", to: "/paiements" as const, show: showFinance },
  ].filter((c) => c.show);

  const PIE_COLORS = ["var(--color-primary)", "var(--color-chart-2)", "var(--color-chart-3)"];

  const roleLabel =
    role === "comptable" ? "Vue financière" :
    role === "enseignant" ? "Vue pédagogique" :
    role === "surveillant" ? "Vue vie scolaire" :
    "Vue direction";

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold">Tableau de bord</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          {roleLabel} · Vue intelligente de votre établissement.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        {commonCards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.label} to={c.to}>
              <Card className="hover:border-primary/40 hover:shadow-md transition-all duration-200 h-full">
                <CardContent className="p-4 sm:p-5">
                  <div className={"size-9 sm:size-10 rounded-lg flex items-center justify-center mb-3 " + c.color}><Icon className="size-4 sm:size-5" /></div>
                  <div className="text-base sm:text-xl font-bold font-display break-words">{isLoading ? "…" : c.value}</div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center justify-between gap-2">
                    <span>{c.label}</span>
                    <ArrowRight className="size-3.5 opacity-50 shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {showFinance && (
        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Revenus vs Dépenses (6 mois)</CardTitle>
            </CardHeader>
            <CardContent className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.months ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(v) => fmt(v)} width={70} />
                  <Tooltip formatter={(v: number) => fmt(v) + " GNF"} />
                  <Legend />
                  <Bar dataKey="revenus" fill="var(--color-success)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="depenses" fill="var(--color-destructive)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tendance des revenus</CardTitle>
            </CardHeader>
            <CardContent className="h-64 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats?.months ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(v) => fmt(v)} width={70} />
                  <Tooltip formatter={(v: number) => fmt(v) + " GNF"} />
                  <Line type="monotone" dataKey="revenus" stroke="var(--color-primary)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {showPedago && (
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Répartition élèves</CardTitle>
            </CardHeader>
            <CardContent className="h-64 sm:h-72">
              {(stats?.genderData ?? []).length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Aucune donnée</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stats?.genderData ?? []} dataKey="value" nameKey="name" outerRadius={85} label>
                      {(stats?.genderData ?? []).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top classes (effectif)</CardTitle>
            </CardHeader>
            <CardContent>
              {(stats?.topClasses ?? []).length === 0 ? (
                <div className="text-muted-foreground text-sm">Aucune classe.</div>
              ) : (
                <ul className="space-y-3">
                  {(stats?.topClasses ?? []).map((c) => {
                    const max = Math.max(...(stats?.topClasses ?? []).map((x) => x.count));
                    const pct = max > 0 ? (c.count / max) * 100 : 0;
                    return (
                      <li key={c.name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-muted-foreground">{c.count} élèves</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
        {showPedago && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><UserPlus className="size-4" /> Dernières inscriptions</CardTitle>
              <Link to="/eleves" className="text-xs text-primary hover:underline">Voir tout</Link>
            </CardHeader>
            <CardContent>
              {(stats?.recentStudents ?? []).length === 0 ? (
                <div className="text-muted-foreground text-sm">Aucune inscription récente.</div>
              ) : (
                <ul className="space-y-3">
                  {(stats?.recentStudents ?? []).map((s: any) => (
                    <li key={s.id} className="flex items-start justify-between gap-3 pb-3 border-b last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{s.full_name}</div>
                        <div className="text-xs text-muted-foreground">{s.classes?.name ?? "—"}</div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {s.created_at ? new Date(s.created_at).toLocaleDateString("fr-FR") : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {showFinance && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="size-4" /> Derniers paiements</CardTitle>
              <Link to="/paiements" className="text-xs text-primary hover:underline">Voir tout</Link>
            </CardHeader>
            <CardContent>
              {(stats?.recentPayments ?? []).length === 0 ? (
                <div className="text-muted-foreground text-sm">Aucun paiement récent.</div>
              ) : (
                <ul className="space-y-3">
                  {(stats?.recentPayments ?? []).map((p: any) => (
                    <li key={p.id} className="flex items-start justify-between gap-3 pb-3 border-b last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{p.students?.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground capitalize">{p.payment_type}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-medium text-sm text-success">{fmt(Number(p.amount))} GNF</div>
                        <div className="text-xs text-muted-foreground">{new Date(p.paid_at).toLocaleDateString("fr-FR")}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {showPedago && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><PenLine className="size-4" /> Dernières notes saisies</CardTitle>
              <Link to="/notes" className="text-xs text-primary hover:underline">Voir tout</Link>
            </CardHeader>
            <CardContent>
              {(stats?.recentGrades ?? []).length === 0 ? (
                <div className="text-muted-foreground text-sm">Aucune note récente.</div>
              ) : (
                <ul className="space-y-3">
                  {(stats?.recentGrades ?? []).map((g: any) => (
                    <li key={g.id} className="flex items-start justify-between gap-3 pb-3 border-b last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{g.students?.full_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{g.subjects?.name ?? "—"}</div>
                      </div>
                      <Badge variant="outline" className="shrink-0">{g.score}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
        {showPedago && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base"><BookOpenCheck className="size-4" /> Prochains examens</CardTitle>
              <Link to="/examens" className="text-xs text-primary hover:underline">Voir tout</Link>
            </CardHeader>
            <CardContent>
              {(stats?.upcomingExams ?? []).length === 0 ? (
                <div className="text-muted-foreground text-sm">Aucun examen programmé.</div>
              ) : (
                <ul className="space-y-3">
                  {(stats?.upcomingExams ?? []).map((e: any) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 pb-3 border-b last:border-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{e.name}</div>
                        <div className="text-xs text-muted-foreground">{e.classes?.name ?? "—"}</div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {new Date(e.exam_date).toLocaleDateString("fr-FR")}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><Bell className="size-4" /> Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            {(stats?.recentNotifications ?? []).length === 0 ? (
              <div className="text-muted-foreground text-sm">Aucune notification.</div>
            ) : (
              <ul className="space-y-3">
                {(stats?.recentNotifications ?? []).map((n: any) => (
                  <li key={n.id} className="pb-3 border-b last:border-0 last:pb-0">
                    <div className="font-medium text-sm">{n.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center justify-between gap-2 mt-1">
                      <span className="truncate">{n.body ?? ""}</span>
                      <span className="shrink-0">{fmtDateTime(n.created_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><Megaphone className="size-4" /> Dernières annonces</CardTitle>
            <Link to="/annonces" className="text-xs text-primary hover:underline">Voir tout</Link>
          </CardHeader>
          <CardContent>
            {(stats?.recentAnnouncements ?? []).length === 0 ? (
              <div className="text-muted-foreground text-sm">Aucune annonce.</div>
            ) : (
              <ul className="space-y-3">
                {(stats?.recentAnnouncements ?? []).map((a: any) => (
                  <li key={a.id} className="pb-3 border-b last:border-0 last:pb-0">
                    <div className="font-medium text-sm">{a.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center justify-between mt-1">
                      <span className="capitalize">{a.target_role ?? "tous"}</span>
                      <span>{new Date(a.created_at).toLocaleDateString("fr-FR")}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {roles.some((r) => ["admin", "directeur"].includes(r)) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base"><History className="size-4" /> Dernières activités</CardTitle>
            <Link to="/journal" className="text-xs text-primary hover:underline">Journal complet</Link>
          </CardHeader>
          <CardContent>
            {(stats?.recentLogs ?? []).length === 0 ? (
              <div className="text-muted-foreground text-sm">Aucune activité enregistrée.</div>
            ) : (
              <ul className="divide-y">
                {(stats?.recentLogs ?? []).map((l: any) => (
                  <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="shrink-0">{ACTION_LABELS[l.action] ?? l.action}</Badge>
                      <span className="font-medium truncate">{l.actor_name ?? "—"}</span>
                      <span className="text-muted-foreground truncate">
                        {l.entity_type}{l.entity_label ? ` · ${l.entity_label}` : ""}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{fmtDateTime(l.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}