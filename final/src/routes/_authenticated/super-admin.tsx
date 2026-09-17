import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  resetSchoolAdminPassword, impersonateSchoolAdmin, updateSchoolAsSuperAdmin,
  deleteSchoolAsSuperAdmin, notifySchools, runAutoSuspendExpired,
  getStorageUsage, getLoginStats,
} from "@/lib/super-admin.functions";
import { logActivity } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import {
  Building2, Users, GraduationCap, CreditCard, TrendingUp, ShieldCheck,
  Package, Activity, RefreshCw, MoreVertical, Send, Power, PowerOff, Trash2,
  Pencil, KeyRound, LogIn, Clock, HardDrive, ChevronUp, ChevronDown, Eye, Copy, Ban,
} from "lucide-react";
import { toast } from "sonner";
import SubscriptionPaymentRequests from "@/components/SubscriptionPaymentRequests";

export const Route = createFileRoute("/_authenticated/super-admin")({
  head: () => ({ meta: [
    { title: "Super Admin — MBGEduGuinée" },
    { name: "description", content: "Supervision globale de la plateforme scolaire MBGEduGuinée" },
  ] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: sa } = await supabase.from("super_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
    if (!sa) throw redirect({ to: "/dashboard" });
  },
  component: SuperAdminDashboard,
});

type Plan = { id: string; code: string; name: string; price_monthly: number; price_yearly: number };
type Sub = {
  id: string; school_id: string; plan_id: string; status: string; billing_cycle: string | null;
  trial_ends_at: string | null; current_period_start: string; current_period_end: string;
  last_payment_at: string | null; last_payment_amount: number | null;
  discount_type: "percent" | "fixed" | null; discount_value: number | null;
  discount_reason: string | null; discount_expires_at: string | null;
};
type School = {
  id: string; name: string; code: string | null; city: string | null; address: string | null;
  email: string | null; phone: string | null; logo_url: string | null;
  director_name: string | null; status: string; created_at: string; academic_year: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  suspended: "bg-rose-100 text-rose-800 border-rose-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
};
const SUB_COLORS: Record<string, string> = {
  trial: "bg-amber-100 text-amber-800 border-amber-200",
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  past_due: "bg-orange-100 text-orange-800 border-orange-200",
  canceled: "bg-rose-100 text-rose-800 border-rose-200",
  expired: "bg-slate-200 text-slate-700 border-slate-300",
};
const CHART_COLORS = ["#2a5a3e", "#c8791f", "#8b5a2b", "#d4a574", "#5b8266"];
const PAGE_SIZE = 10;

type SortKey = "name" | "city" | "code" | "created_at" | "status" | "plan" | "expires";

function SuperAdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState<School[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [counts, setCounts] = useState<Record<string, { students: number; teachers: number; users: number; revenue: number }>>({});
  const [storage, setStorage] = useState<Record<string, { bytes: number; files: number }>>({});
  const [logins, setLogins] = useState<Record<string, { last: string | null; active30d: number; total: number }>>({});
  const [activity, setActivity] = useState<any[]>([]);

  // filters
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [codeFilter, setCodeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // sort + pagination
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // dialogs
  const [manage, setManage] = useState<{ school: School; sub: Sub | null } | null>(null);
  const [edit, setEdit] = useState<School | null>(null);
  const [details, setDetails] = useState<School | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [notify, setNotify] = useState<{ ids: string[] } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // server fns
  const resetPwd = useServerFn(resetSchoolAdminPassword);
  const impersonate = useServerFn(impersonateSchoolAdmin);
  const updateSchool = useServerFn(updateSchoolAsSuperAdmin);
  const deleteSchool = useServerFn(deleteSchoolAsSuperAdmin);
  const notifyFn = useServerFn(notifySchools);
  const autoSuspend = useServerFn(runAutoSuspendExpired);
  const storageFn = useServerFn(getStorageUsage);
  const loginFn = useServerFn(getLoginStats);

  async function load() {
    setLoading(true);
    const [sRes, subRes, pRes, stuRes, teaRes, payRes, actRes, profRes] = await Promise.all([
      supabase.from("schools").select("id,name,code,city,address,email,phone,logo_url,director_name,status,created_at,academic_year").order("created_at", { ascending: false }),
      (supabase as any).from("school_subscriptions").select("*"),
      (supabase as any).from("subscription_plans").select("id,code,name,price_monthly,price_yearly"),
      supabase.from("students").select("school_id"),
      supabase.from("teachers").select("school_id"),
      supabase.from("payments").select("school_id,amount,validation_status,paid_at"),
      (supabase as any).from("activity_logs").select("id,school_id,action,entity_type,entity_label,created_at,actor_name,ip_address").order("created_at", { ascending: false }).limit(50),
      supabase.from("profiles").select("school_id"),
    ]);
    setSchools((sRes.data ?? []) as School[]);
    setSubs((subRes.data ?? []) as Sub[]);
    setPlans((pRes.data ?? []) as Plan[]);
    setActivity(actRes.data ?? []);

    const c: Record<string, { students: number; teachers: number; users: number; revenue: number }> = {};
    const ensure = (id: string) => (c[id] ??= { students: 0, teachers: 0, users: 0, revenue: 0 });
    (stuRes.data ?? []).forEach((r: any) => ensure(r.school_id).students++);
    (teaRes.data ?? []).forEach((r: any) => ensure(r.school_id).teachers++);
    (profRes.data ?? []).forEach((r: any) => r.school_id && ensure(r.school_id).users++);
    (payRes.data ?? []).forEach((r: any) => { if (r.validation_status === "validé") ensure(r.school_id).revenue += Number(r.amount || 0); });
    setCounts(c);

    // Best-effort storage + logins (non-bloquant)
    try {
      const s = await storageFn();
      const map: Record<string, { bytes: number; files: number }> = {};
      (s as any[]).forEach((r) => { map[r.school_id] = { bytes: Number(r.bytes), files: Number(r.files) }; });
      setStorage(map);
    } catch {}
    try {
      const l = await loginFn();
      setLogins(l as any);
    } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const planById = useMemo(() => Object.fromEntries(plans.map(p => [p.id, p])), [plans]);
  const subBySchool = useMemo(() => Object.fromEntries(subs.map(s => [s.school_id, s])), [subs]);

  const totals = useMemo(() => {
    const totalStudents = Object.values(counts).reduce((a, b) => a + b.students, 0);
    const totalTeachers = Object.values(counts).reduce((a, b) => a + b.teachers, 0);
    const totalUsers = Object.values(counts).reduce((a, b) => a + b.users, 0);
    const totalRevenue = Object.values(counts).reduce((a, b) => a + b.revenue, 0);
    const activeSchools = schools.filter(s => s.status === "active").length;
    const suspendedSchools = schools.filter(s => s.status === "suspended").length;
    const freeSubs = subs.filter(s => s.status === "trial").length;
    const paidSubs = subs.filter(s => s.status === "active").length;
    const mrr = subs.filter(s => s.status === "active").reduce((a, s) => a + (planById[s.plan_id]?.price_monthly ?? 0), 0);
    const arr = mrr * 12;
    // Revenus mensuel (30j) et annuel (365j) sur paiements validés
    const now = Date.now();
    let monthly = 0, yearly = 0;
    (Object.values(counts)); // no-op
    return { totalStudents, totalTeachers, totalUsers, totalRevenue, activeSchools, suspendedSchools, freeSubs, paidSubs, mrr, arr, monthly, yearly };
  }, [counts, subs, planById, schools]);

  const revenues = useMemo(() => {
    // Recalcul depuis payments (déjà chargés dans counts.revenue). On refait avec dates.
    return { monthly: 0, yearly: 0 };
  }, []);

  // Réel: on recalcule depuis les paiements validés
  const [monthYear, setMonthYear] = useState({ monthly: 0, yearly: 0 });
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("payments").select("amount,validation_status,paid_at");
      const now = Date.now();
      let m = 0, y = 0;
      (data ?? []).forEach((r: any) => {
        if (r.validation_status !== "validé" || !r.paid_at) return;
        const t = new Date(r.paid_at).getTime();
        if (now - t <= 30 * 86400000) m += Number(r.amount || 0);
        if (now - t <= 365 * 86400000) y += Number(r.amount || 0);
      });
      setMonthYear({ monthly: m, yearly: y });
    })();
  }, [schools.length]);

  const statusData = useMemo(() => {
    const g: Record<string, number> = {};
    subs.forEach(s => { g[s.status] = (g[s.status] ?? 0) + 1; });
    return Object.entries(g).map(([name, value]) => ({ name, value }));
  }, [subs]);
  const planData = useMemo(() => {
    const g: Record<string, number> = {};
    subs.forEach(s => { const n = planById[s.plan_id]?.name ?? "—"; g[n] = (g[n] ?? 0) + 1; });
    return Object.entries(g).map(([name, value]) => ({ name, value }));
  }, [subs, planById]);
  const growthData = useMemo(() => {
    const g: Record<string, number> = {};
    schools.forEach(s => { const m = s.created_at.slice(0, 7); g[m] = (g[m] ?? 0) + 1; });
    return Object.entries(g).sort().slice(-6).map(([month, count]) => ({ month, count }));
  }, [schools]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return schools.filter(s => {
      const sub = subBySchool[s.id];
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (planFilter !== "all" && sub?.plan_id !== planFilter) return false;
      if (cityFilter && !(s.city ?? s.address ?? "").toLowerCase().includes(cityFilter.toLowerCase())) return false;
      if (codeFilter && !(s.code ?? "").toLowerCase().includes(codeFilter.toLowerCase())) return false;
      if (q && !(s.name.toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q) || (s.director_name ?? "").toLowerCase().includes(q))) return false;
      if (dateFrom && new Date(s.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(s.created_at) > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [schools, subBySchool, search, statusFilter, planFilter, cityFilter, codeFilter, dateFrom, dateTo]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const sa = subBySchool[a.id], sb = subBySchool[b.id];
      let va: any, vb: any;
      switch (sortKey) {
        case "name": va = a.name; vb = b.name; break;
        case "city": va = a.city ?? a.address ?? ""; vb = b.city ?? b.address ?? ""; break;
        case "code": va = a.code ?? ""; vb = b.code ?? ""; break;
        case "status": va = a.status; vb = b.status; break;
        case "plan": va = planById[sa?.plan_id ?? ""]?.name ?? ""; vb = planById[sb?.plan_id ?? ""]?.name ?? ""; break;
        case "expires": va = sa?.current_period_end ?? ""; vb = sb?.current_period_end ?? ""; break;
        default: va = a.created_at; vb = b.created_at;
      }
      const cmp = String(va).localeCompare(String(vb), "fr", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir, subBySchool, planById]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, cityFilter, codeFilter, statusFilter, planFilter, dateFrom, dateTo]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  async function logSA(action: string, school?: School, meta?: Record<string, any>) {
    try {
      await logActivity({ action: `super_admin.${action}`, entity_type: "school", entity_id: school?.id, entity_label: school?.name, metadata: meta });
    } catch {}
  }

  async function doStatus(school: School, status: "active" | "suspended" | "pending") {
    try {
      await updateSchool({ data: { schoolId: school.id, patch: { status } } });
      toast.success(`École ${status === "active" ? "activée" : status === "suspended" ? "suspendue" : "mise en attente"}`);
      logSA("status_change", school, { status });
      load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function doDelete(school: School) {
    try {
      await deleteSchool({ data: { schoolId: school.id } });
      toast.success("École supprimée");
      logSA("delete", school);
      load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function doResetPwd(school: School) {
    try {
      const r = await resetPwd({ data: { schoolId: school.id } });
      if (r.actionLink) await navigator.clipboard.writeText(r.actionLink).catch(() => {});
      toast.success(`Lien de réinitialisation généré pour ${r.email} (copié)`);
      logSA("reset_password", school, { email: r.email });
    } catch (e: any) { toast.error(e.message); }
  }
  async function doImpersonate(school: School) {
    try {
      const r = await impersonate({ data: { schoolId: school.id } });
      if (r.actionLink) {
        await navigator.clipboard.writeText(r.actionLink).catch(() => {});
        window.open(r.actionLink, "_blank");
      }
      toast.success(`Lien de connexion créé pour ${r.email}`);
      logSA("impersonate", school, { email: r.email });
    } catch (e: any) { toast.error(e.message); }
  }
  async function doAutoSuspend() {
    try { const r = await autoSuspend(); toast.success(`${r.suspended} école(s) suspendue(s)`); logSA("auto_suspend_expired", undefined, r); load(); }
    catch (e: any) { toast.error(e.message); }
  }

  async function extendTrial(sub: Sub, days: number) {
    const base = sub.trial_ends_at ? new Date(sub.trial_ends_at) : new Date();
    const target = new Date(Math.max(base.getTime(), Date.now()) + days * 86400000).toISOString();
    const { error } = await (supabase as any).from("school_subscriptions").update({
      trial_ends_at: target, current_period_end: target, status: "trial",
    }).eq("id", sub.id);
    if (error) return toast.error(error.message);
    toast.success(`Essai prolongé de ${days} jours`); load();
  }
  async function setSubStatus(sub: Sub, status: string) {
    const { error } = await (supabase as any).from("school_subscriptions").update({ status }).eq("id", sub.id);
    if (error) return toast.error(error.message);
    toast.success("Statut abonnement mis à jour"); load();
  }
  async function changePlan(sub: Sub, plan_id: string) {
    const { error } = await (supabase as any).from("school_subscriptions").update({ plan_id }).eq("id", sub.id);
    if (error) return toast.error(error.message);
    toast.success("Offre modifiée"); load();
  }

  const [discountFor, setDiscountFor] = useState<Sub | null>(null);
  const [discountForm, setDiscountForm] = useState({ type: "percent" as "percent" | "fixed", value: "", reason: "", expiresAt: "" });
  useEffect(() => {
    if (discountFor) {
      setDiscountForm({
        type: (discountFor.discount_type as "percent" | "fixed") ?? "percent",
        value: discountFor.discount_value != null ? String(discountFor.discount_value) : "",
        reason: discountFor.discount_reason ?? "",
        expiresAt: discountFor.discount_expires_at ? discountFor.discount_expires_at.slice(0, 10) : "",
      });
    }
  }, [discountFor]);

  async function saveDiscount() {
    if (!discountFor) return;
    const value = Number(discountForm.value);
    if (!value || value <= 0) return toast.error("Indiquez une valeur de remise valide.");
    const { error } = await (supabase as any).rpc("set_school_subscription_discount", {
      p_school_id: discountFor.school_id,
      p_discount_type: discountForm.type,
      p_discount_value: value,
      p_reason: discountForm.reason || null,
      p_expires_at: discountForm.expiresAt ? new Date(discountForm.expiresAt).toISOString() : null,
    });
    if (error) return toast.error(error.message);
    toast.success("Remise appliquée");
    logSA("subscription_discount_set", schools.find(s => s.id === discountFor.school_id), { type: discountForm.type, value });
    setDiscountFor(null);
    load();
  }

  async function removeDiscount(sub: Sub) {
    const { error } = await (supabase as any).rpc("set_school_subscription_discount", {
      p_school_id: sub.school_id, p_discount_type: null, p_discount_value: null, p_reason: null, p_expires_at: null,
    });
    if (error) return toast.error(error.message);
    toast.success("Remise retirée");
    logSA("subscription_discount_removed", schools.find(s => s.id === sub.school_id));
    load();
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelectPage() {
    const ids = pageRows.map(r => r.id);
    const all = ids.every(id => selected.has(id));
    setSelected(prev => { const n = new Set(prev); ids.forEach(id => all ? n.delete(id) : n.add(id)); return n; });
  }

  const fmtBytes = (b: number) => b < 1024 ? `${b} o` : b < 1048576 ? `${(b/1024).toFixed(1)} Ko` : b < 1073741824 ? `${(b/1048576).toFixed(1)} Mo` : `${(b/1073741824).toFixed(2)} Go`;

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-2">
            <ShieldCheck className="size-7 text-primary" /> Super Administrateur
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Contrôle global de la plateforme MBGEduGuinée</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="size-4 mr-2" />Actualiser</Button>
          <Button variant="outline" onClick={doAutoSuspend}><Ban className="size-4 mr-2" />Suspendre les expirés</Button>
          <Button asChild variant="outline"><Link to="/plans"><Package className="size-4 mr-2" />Offres</Link></Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi icon={<Building2 className="size-5" />} label="Établissements" value={schools.length} />
        <Kpi icon={<Power className="size-5 text-emerald-600" />} label="Actifs" value={totals.activeSchools} />
        <Kpi icon={<PowerOff className="size-5 text-rose-600" />} label="Suspendus" value={totals.suspendedSchools} />
        <Kpi icon={<Users className="size-5" />} label="Élèves" value={totals.totalStudents} />
        <Kpi icon={<GraduationCap className="size-5" />} label="Enseignants" value={totals.totalTeachers} />
        <Kpi icon={<Activity className="size-5" />} label="Utilisateurs" value={totals.totalUsers} />
        <Kpi icon={<Clock className="size-5 text-amber-600" />} label="Essais gratuits" value={totals.freeSubs} />
        <Kpi icon={<CreditCard className="size-5 text-emerald-600" />} label="Payants" value={totals.paidSubs} />
        <Kpi icon={<TrendingUp className="size-5" />} label="Revenus 30j (GNF)" value={monthYear.monthly.toLocaleString("fr-FR")} />
        <Kpi icon={<TrendingUp className="size-5" />} label="Revenus 12m (GNF)" value={monthYear.yearly.toLocaleString("fr-FR")} />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Abonnements par statut</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={80} label>
                  {statusData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Répartition par offre</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={planData}>
                <XAxis dataKey="name" fontSize={12} /><YAxis fontSize={12} /><Tooltip />
                <Bar dataKey="value" fill="#2a5a3e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Croissance (6 mois)</CardTitle></CardHeader>
          <CardContent style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={growthData}>
                <XAxis dataKey="month" fontSize={12} /><YAxis fontSize={12} /><Tooltip />
                <Bar dataKey="count" fill="#c8791f" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Table */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Établissements ({sorted.length})</CardTitle>
            <div className="flex gap-2 flex-wrap">
              {selected.size > 0 && (
                <Button size="sm" onClick={() => setNotify({ ids: Array.from(selected) })}>
                  <Send className="size-4 mr-2" />Notifier ({selected.size})
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
            <Input placeholder="Nom, e-mail, directeur…" value={search} onChange={e => setSearch(e.target.value)} />
            <Input placeholder="Ville" value={cityFilter} onChange={e => setCityFilter(e.target.value)} />
            <Input placeholder="Code" value={codeFilter} onChange={e => setCodeFilter(e.target.value)} />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="suspended">Suspendu</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger><SelectValue placeholder="Offre" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes offres</SelectItem>
                {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="Inscrit à partir de" />
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="Inscrit jusqu'au" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox checked={pageRows.length > 0 && pageRows.every(r => selected.has(r.id))} onCheckedChange={toggleSelectPage} />
                </TableHead>
                <TableHead>Logo</TableHead>
                <SortHead label="Nom" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHead label="Code" k="code" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHead label="Ville" k="city" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <TableHead>Directeur</TableHead>
                <TableHead>Contact</TableHead>
                <SortHead label="Offre" k="plan" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHead label="Inscription" k="created_at" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHead label="Expiration" k="expires" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortHead label="Statut" k="status" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <TableHead>Stockage</TableHead>
                <TableHead>Dernière connexion</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map(s => {
                const sub = subBySchool[s.id];
                const plan = sub ? planById[sub.plan_id] : null;
                const st = storage[s.id];
                const lg = logins[s.id];
                return (
                  <TableRow key={s.id}>
                    <TableCell><Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggleSelect(s.id)} /></TableCell>
                    <TableCell>
                      {s.logo_url ? <img src={s.logo_url} alt="" className="size-8 rounded object-cover border" /> : <div className="size-8 rounded bg-muted grid place-items-center text-xs text-muted-foreground">—</div>}
                    </TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-xs font-mono">{s.code ?? "—"}</TableCell>
                    <TableCell className="text-sm">{s.city ?? s.address ?? "—"}</TableCell>
                    <TableCell className="text-sm">{s.director_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      <div>{s.email ?? "—"}</div>
                      <div className="text-muted-foreground">{s.phone ?? "—"}</div>
                    </TableCell>
                    <TableCell>{plan?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(s.created_at).toLocaleDateString("fr-FR")}</TableCell>
                    <TableCell className="text-xs">
                      {sub ? (<>
                        <div>{new Date(sub.current_period_end).toLocaleDateString("fr-FR")}</div>
                        <Badge variant="outline" className={`text-[10px] ${SUB_COLORS[sub.status] ?? ""}`}>{sub.status}</Badge>
                      </>) : "—"}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_COLORS[s.status] ?? ""}>{s.status}</Badge></TableCell>
                    <TableCell className="text-xs"><div className="flex items-center gap-1"><HardDrive className="size-3" />{st ? fmtBytes(st.bytes) : "—"}</div></TableCell>
                    <TableCell className="text-xs">
                      {lg?.last ? new Date(lg.last).toLocaleDateString("fr-FR") : "—"}
                      {lg && <div className="text-muted-foreground">{lg.active30d}/{lg.total} actifs</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button size="sm" variant="ghost"><MoreVertical className="size-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel>{s.name}</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setDetails(s)}><Eye className="size-4 mr-2" />Voir les détails</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEdit(s)}><Pencil className="size-4 mr-2" />Modifier</DropdownMenuItem>
                          {sub && <DropdownMenuItem onClick={() => setManage({ school: s, sub })}><Package className="size-4 mr-2" />Gérer l'abonnement</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          {s.status !== "active" && <DropdownMenuItem onClick={() => setConfirm({ title: "Activer cette école ?", description: `L'école « ${s.name} » sera activée.`, action: () => doStatus(s, "active") })}><Power className="size-4 mr-2 text-emerald-600" />Activer</DropdownMenuItem>}
                          {s.status !== "suspended" && <DropdownMenuItem onClick={() => setConfirm({ title: "Suspendre cette école ?", description: `L'école « ${s.name} » ne pourra plus accéder à la plateforme.`, action: () => doStatus(s, "suspended") })}><PowerOff className="size-4 mr-2 text-rose-600" />Suspendre</DropdownMenuItem>}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setConfirm({ title: "Réinitialiser le mot de passe ?", description: "Un lien de réinitialisation sera généré pour l'administrateur.", action: () => doResetPwd(s) })}><KeyRound className="size-4 mr-2" />Réinitialiser mot de passe</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setConfirm({ title: "Se connecter en tant que ?", description: `Un lien de connexion sera créé pour l'administrateur de « ${s.name} » (support technique).`, action: () => doImpersonate(s) })}><LogIn className="size-4 mr-2" />Se connecter en tant que</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setNotify({ ids: [s.id] })}><Send className="size-4 mr-2" />Envoyer une notification</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setConfirm({ title: "Supprimer cette école ?", description: `Action IRRÉVERSIBLE. Toutes les données de « ${s.name} » seront supprimées.`, action: () => doDelete(s) })}><Trash2 className="size-4 mr-2" />Supprimer</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
              {pageRows.length === 0 && (
                <TableRow><TableCell colSpan={14} className="text-center text-muted-foreground py-8">Aucun établissement</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <div className="text-muted-foreground">Page {page} / {pageCount}</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</Button>
                <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity feed */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Activity className="size-4" />Journal d'audit (toutes écoles)</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {activity.map((a: any) => {
              const school = schools.find(s => s.id === a.school_id);
              return (
                <div key={a.id} className="flex items-center justify-between text-sm border-b last:border-0 py-2 gap-3">
                  <div className="min-w-0">
                    <span className="font-medium">{a.action}</span>
                    <span className="text-muted-foreground"> · {a.entity_type}{a.entity_label ? ` · ${a.entity_label}` : ""}</span>
                    <div className="text-xs text-muted-foreground truncate">
                      {a.actor_name ?? "—"} · {school?.name ?? "—"} {a.ip_address ? `· IP ${a.ip_address}` : ""}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{new Date(a.created_at).toLocaleString("fr-FR")}</span>
                </div>
              );
            })}
            {activity.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Aucune activité</p>}
          </div>
        </CardContent>
      </Card>

      {/* Manage subscription dialog */}
      <Dialog open={!!manage} onOpenChange={(o) => !o && setManage(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Abonnement — {manage?.school.name}</DialogTitle></DialogHeader>
          {manage?.sub && (
            <div className="space-y-4">
              <div>
                <Label className="mb-1 block">Offre</Label>
                <Select value={manage.sub.plan_id} onValueChange={(v) => changePlan(manage.sub!, v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — {p.price_monthly.toLocaleString("fr-FR")} GNF/mois</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block">Statut abonnement</Label>
                <div className="flex flex-wrap gap-2">
                  {["trial", "active", "past_due", "canceled", "expired"].map(st => (
                    <Button key={st} size="sm" variant={manage.sub!.status === st ? "default" : "outline"} onClick={() => setSubStatus(manage.sub!, st)}>{st}</Button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-1 block">Prolonger l'essai</Label>
                <div className="flex gap-2 flex-wrap">
                  {[7, 15, 30, 60, 90].map(d => (
                    <Button key={d} size="sm" variant="outline" onClick={() => extendTrial(manage.sub!, d)}>+{d} j</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2 border-t pt-3">
                <Label className="mb-1 block">Remise / bourse</Label>
                {manage.sub!.discount_type ? (
                  <div className="rounded-lg border bg-accent/10 p-3 text-sm space-y-1">
                    <div className="font-medium">
                      {manage.sub!.discount_type === "percent"
                        ? `${manage.sub!.discount_value}% de remise`
                        : `${Number(manage.sub!.discount_value).toLocaleString("fr-FR")} GNF de remise`}
                    </div>
                    {manage.sub!.discount_reason && <div className="text-muted-foreground">{manage.sub!.discount_reason}</div>}
                    <div className="text-xs text-muted-foreground">
                      {manage.sub!.discount_expires_at
                        ? `Expire le ${new Date(manage.sub!.discount_expires_at).toLocaleDateString("fr-FR")}`
                        : "Sans date d'expiration"}
                    </div>
                    <Button size="sm" variant="outline" className="mt-1" onClick={() => removeDiscount(manage.sub!)}>
                      Retirer la remise
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucune remise active.</p>
                )}
                <Button size="sm" variant="outline" onClick={() => setDiscountFor(manage.sub!)}>
                  {manage.sub!.discount_type ? "Modifier la remise" : "Accorder une remise"}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground border-t pt-3">
                Créé le {new Date(manage.school.created_at).toLocaleDateString("fr-FR")} · Fin période: {new Date(manage.sub.current_period_end).toLocaleDateString("fr-FR")}
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setManage(null)}>Fermer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount dialog */}
      <Dialog open={!!discountFor} onOpenChange={(o) => !o && setDiscountFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remise / bourse</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 block">Type</Label>
              <div className="flex gap-2">
                <Button size="sm" variant={discountForm.type === "percent" ? "default" : "outline"} onClick={() => setDiscountForm({ ...discountForm, type: "percent" })}>Pourcentage</Button>
                <Button size="sm" variant={discountForm.type === "fixed" ? "default" : "outline"} onClick={() => setDiscountForm({ ...discountForm, type: "fixed" })}>Montant fixe (GNF)</Button>
              </div>
            </div>
            <div>
              <Label className="mb-1 block">{discountForm.type === "percent" ? "Pourcentage de remise" : "Montant de la remise (GNF)"}</Label>
              <Input type="number" min={0} max={discountForm.type === "percent" ? 100 : undefined} value={discountForm.value} onChange={(e) => setDiscountForm({ ...discountForm, value: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1 block">Motif</Label>
              <Textarea rows={2} placeholder="Ex. bourse partenaire, difficulté financière, école pilote..." value={discountForm.reason} onChange={(e) => setDiscountForm({ ...discountForm, reason: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1 block">Expire le (optionnel)</Label>
              <Input type="date" value={discountForm.expiresAt} onChange={(e) => setDiscountForm({ ...discountForm, expiresAt: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Laissez vide pour une remise sans date d'expiration.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscountFor(null)}>Annuler</Button>
            <Button onClick={saveDiscount}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubscriptionPaymentRequests />

      {/* Edit school dialog */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier l'établissement</DialogTitle></DialogHeader>
          {edit && <EditSchoolForm school={edit} onSave={async (patch) => {
            try {
              await updateSchool({ data: { schoolId: edit.id, patch } });
              toast.success("École modifiée"); logSA("update", edit, patch); setEdit(null); load();
            } catch (e: any) { toast.error(e.message); }
          }} />}
        </DialogContent>
      </Dialog>

      {/* Details dialog */}
      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Détails — {details?.name}</DialogTitle></DialogHeader>
          {details && (() => {
            const sub = subBySchool[details.id];
            const plan = sub ? planById[sub.plan_id] : null;
            const cnt = counts[details.id] ?? { students: 0, teachers: 0, users: 0, revenue: 0 };
            const st = storage[details.id];
            const lg = logins[details.id];
            return (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Detail label="Code" value={details.code} />
                <Detail label="Statut" value={details.status} />
                <Detail label="Ville" value={details.city ?? details.address} />
                <Detail label="Directeur" value={details.director_name} />
                <Detail label="E-mail" value={details.email} />
                <Detail label="Téléphone" value={details.phone} />
                <Detail label="Année scolaire" value={details.academic_year} />
                <Detail label="Inscrit le" value={new Date(details.created_at).toLocaleDateString("fr-FR")} />
                <Detail label="Offre" value={plan?.name} />
                <Detail label="Fin d'abonnement" value={sub ? new Date(sub.current_period_end).toLocaleDateString("fr-FR") : "—"} />
                <Detail label="Élèves" value={cnt.students} />
                <Detail label="Enseignants" value={cnt.teachers} />
                <Detail label="Utilisateurs" value={cnt.users} />
                <Detail label="Recettes (GNF)" value={cnt.revenue.toLocaleString("fr-FR")} />
                <Detail label="Stockage" value={st ? `${fmtBytes(st.bytes)} · ${st.files} fichiers` : "—"} />
                <Detail label="Dernière connexion" value={lg?.last ? new Date(lg.last).toLocaleString("fr-FR") : "—"} />
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Notify dialog */}
      <Dialog open={!!notify} onOpenChange={(o) => !o && setNotify(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Envoyer une notification</DialogTitle>
            <DialogDescription>{notify?.ids.length} école(s) destinataire(s)</DialogDescription>
          </DialogHeader>
          <NotifyForm onSend={async ({ subject, body }) => {
            try {
              const r = await notifyFn({ data: { schoolIds: notify!.ids, subject, body } });
              toast.success(`${r.sent} notification(s) envoyée(s)`);
              logSA("notify", undefined, { count: r.sent, subject });
              setNotify(null); setSelected(new Set());
            } catch (e: any) { toast.error(e.message); }
          }} />
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { const a = confirm?.action; setConfirm(null); if (a) await a(); }}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">{icon}{label}</div>
      <div className="text-xl md:text-2xl font-bold font-display">{value}</div>
    </CardContent></Card>
  );
}

function SortHead({ label, k, sortKey, sortDir, onClick }: { label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc"; onClick: (k: SortKey) => void }) {
  const active = sortKey === k;
  return (
    <TableHead className="cursor-pointer select-none" onClick={() => onClick(k)}>
      <span className="inline-flex items-center gap-1">{label}{active && (sortDir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}</span>
    </TableHead>
  );
}

function Detail({ label, value }: { label: string; value: any }) {
  return (
    <div className="border rounded p-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{value ?? "—"}</div>
    </div>
  );
}

function EditSchoolForm({ school, onSave }: { school: any; onSave: (patch: any) => void }) {
  const [f, setF] = useState({
    name: school.name ?? "", code: school.code ?? "", city: school.city ?? "",
    address: school.address ?? "", phone: school.phone ?? "", email: school.email ?? "",
    director_name: school.director_name ?? "", status: school.status ?? "active",
  });
  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Nom</Label><Input value={f.name} onChange={e => set("name", e.target.value)} /></div>
        <div><Label>Code</Label><Input value={f.code} onChange={e => set("code", e.target.value)} /></div>
        <div><Label>Ville</Label><Input value={f.city} onChange={e => set("city", e.target.value)} /></div>
        <div><Label>Adresse</Label><Input value={f.address} onChange={e => set("address", e.target.value)} /></div>
        <div><Label>Téléphone</Label><Input value={f.phone} onChange={e => set("phone", e.target.value)} /></div>
        <div><Label>E-mail</Label><Input type="email" value={f.email} onChange={e => set("email", e.target.value)} /></div>
        <div><Label>Directeur</Label><Input value={f.director_name} onChange={e => set("director_name", e.target.value)} /></div>
        <div><Label>Statut</Label>
          <Select value={f.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Actif</SelectItem>
              <SelectItem value="suspended">Suspendu</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={() => onSave({
          name: f.name, code: f.code || null, city: f.city || null, address: f.address || null,
          phone: f.phone || null, email: f.email || null, director_name: f.director_name || null,
          status: f.status,
        })}>Enregistrer</Button>
      </DialogFooter>
    </div>
  );
}

function NotifyForm({ onSend }: { onSend: (v: { subject: string; body: string }) => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className="space-y-3">
      <div><Label>Sujet</Label><Input value={subject} onChange={e => setSubject(e.target.value)} /></div>
      <div><Label>Message</Label><Textarea rows={6} value={body} onChange={e => setBody(e.target.value)} /></div>
      <DialogFooter>
        <Button disabled={!subject || !body} onClick={() => onSend({ subject, body })}><Send className="size-4 mr-2" />Envoyer</Button>
      </DialogFooter>
    </div>
  );
}
