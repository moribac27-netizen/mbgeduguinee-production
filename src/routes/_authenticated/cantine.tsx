import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CrudSection } from "@/components/CrudSection";
import { useStudentOptions } from "@/hooks/useOptions";
import { fmtDate, fmtMoney } from "@/lib/reports";
import { UtensilsCrossed } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cantine")({
  head: () => ({
    meta: [
      { title: "Cantine scolaire — MBGEduGuinée" },
      { name: "description", content: "Menus, abonnements, paiements et consommation des repas de la cantine scolaire." },
      { property: "og:title", content: "Cantine scolaire — MBGEduGuinée" },
      { property: "og:description", content: "Gérez les menus quotidiens, les abonnements, les paiements et la consommation des repas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Cantine,
});

const MEAL_TYPES = [
  { value: "petit_dejeuner", label: "Petit-déjeuner" },
  { value: "dejeuner", label: "Déjeuner" },
  { value: "gouter", label: "Goûter" },
  { value: "diner", label: "Dîner" },
];
const PLANS = [
  { value: "journalier", label: "Journalier" },
  { value: "hebdomadaire", label: "Hebdomadaire" },
  { value: "mensuel", label: "Mensuel" },
  { value: "trimestriel", label: "Trimestriel" },
  { value: "annuel", label: "Annuel" },
];
const STATUS = [
  { value: "actif", label: "Actif" },
  { value: "suspendu", label: "Suspendu" },
  { value: "inactif", label: "Inactif" },
];
const METHODS = [
  { value: "especes", label: "Espèces" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "virement", label: "Virement" },
  { value: "cheque", label: "Chèque" },
];

const label = (opts: { value: string; label: string }[], v: any) =>
  opts.find((o) => o.value === v)?.label ?? v ?? "—";
const studentName = (r: any) => r?.students?.full_name ?? "—";
const today = () => new Date().toISOString().slice(0, 10);

function Cantine() {
  const { options: studentOptions } = useStudentOptions();

  const { data: menus = [] } = useQuery({
    queryKey: ["opt-canteen-menus"],
    queryFn: async () => {
      const { data } = await supabase
        .from("canteen_menus")
        .select("id, menu_date, main_dish, meal_type")
        .order("menu_date", { ascending: false })
        .limit(200);
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });
  const menuOptions = useMemo(
    () => menus.map((m: any) => ({ value: m.id, label: `${fmtDate(m.menu_date)} — ${m.main_dish}` })),
    [menus],
  );

  const { data: subs = [] } = useQuery({
    queryKey: ["opt-canteen-subs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("canteen_subscriptions")
        .select("id, plan, students(full_name)")
        .order("start_date", { ascending: false })
        .limit(300);
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });
  const subOptions = useMemo(
    () => subs.map((s: any) => ({ value: s.id, label: `${s.students?.full_name ?? "—"} — ${label(PLANS, s.plan)}` })),
    [subs],
  );

  const { data: stats } = useQuery({
    queryKey: ["canteen-stats"],
    queryFn: async () => {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const [active, meals, pays] = await Promise.all([
        supabase.from("canteen_subscriptions").select("id", { count: "exact", head: true }).eq("status", "actif"),
        supabase.from("canteen_consumption").select("id", { count: "exact", head: true }).eq("date", today()).eq("consumed", true),
        supabase.from("canteen_payments").select("amount").gte("paid_at", monthStart),
      ]);
      return {
        active: active.count ?? 0,
        mealsToday: meals.count ?? 0,
        monthTotal: (pays.data ?? []).reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0),
      };
    },
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-xl bg-chart-3/10 text-chart-3 flex items-center justify-center">
          <UtensilsCrossed className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold">Cantine scolaire</h1>
          <p className="text-muted-foreground mt-1">Menus, abonnements, paiements et consommation.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Abonnements actifs</div>
          <div className="text-2xl font-bold mt-1">{stats?.active ?? "—"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Repas servis aujourd'hui</div>
          <div className="text-2xl font-bold mt-1">{stats?.mealsToday ?? "—"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Encaissé ce mois</div>
          <div className="text-2xl font-bold mt-1">{stats ? fmtMoney(stats.monthTotal) : "—"}</div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="menus">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="menus">Menus</TabsTrigger>
          <TabsTrigger value="abonnements">Abonnements</TabsTrigger>
          <TabsTrigger value="paiements">Paiements</TabsTrigger>
          <TabsTrigger value="consommation">Consommation</TabsTrigger>
        </TabsList>

        <TabsContent value="menus" className="mt-6">
          <CrudSection
            table="canteen_menus"
            title="Menus de la cantine"
            singular="Menu"
            queryKey={["canteen_menus"]}
            orderBy={{ column: "menu_date", ascending: false }}
            searchKeys={["main_dish", "starter", "dessert"]}
            fields={[
              { name: "menu_date", label: "Date", type: "date", required: true, default: today() },
              { name: "meal_type", label: "Type de repas", type: "select", options: MEAL_TYPES, required: true, default: "dejeuner" },
              { name: "starter", label: "Entrée" },
              { name: "main_dish", label: "Plat principal", required: true },
              { name: "dessert", label: "Dessert" },
              { name: "drink", label: "Boisson" },
              { name: "price", label: "Prix du repas (GNF)", type: "number", min: 0, required: true, default: 0 },
              { name: "notes", label: "Notes", type: "textarea" },
            ]}
            columns={[
              { key: "menu_date", label: "Date", render: (r) => fmtDate(r.menu_date), exportFormat: (r) => fmtDate(r.menu_date) },
              { key: "meal_type", label: "Repas", render: (r) => label(MEAL_TYPES, r.meal_type), exportFormat: (r) => label(MEAL_TYPES, r.meal_type) },
              { key: "starter", label: "Entrée" },
              { key: "main_dish", label: "Plat principal" },
              { key: "dessert", label: "Dessert" },
              { key: "price", label: "Prix", render: (r) => fmtMoney(r.price), exportFormat: (r) => Number(r.price ?? 0) },
            ]}
            emptyHint="Aucun menu enregistré. Ajoutez le menu du jour."
          />
        </TabsContent>

        <TabsContent value="abonnements" className="mt-6">
          <CrudSection
            table="canteen_subscriptions"
            title="Abonnements cantine"
            singular="Abonnement"
            queryKey={["canteen_subscriptions"]}
            select="*, students(full_name)"
            orderBy={{ column: "start_date", ascending: false }}
            searchKeys={["students.full_name"]}
            fields={[
              { name: "student_id", label: "Élève", type: "select", searchable: true, options: studentOptions, required: true },
              { name: "plan", label: "Formule", type: "select", options: PLANS, required: true, default: "mensuel" },
              { name: "amount", label: "Montant (GNF)", type: "number", min: 0, required: true, default: 0 },
              { name: "start_date", label: "Début", type: "date", required: true, default: today() },
              { name: "end_date", label: "Fin", type: "date" },
              { name: "status", label: "Statut", type: "select", options: STATUS, required: true, default: "actif" },
              { name: "notes", label: "Notes", type: "textarea" },
            ]}
            columns={[
              { key: "student", label: "Élève", render: studentName, exportFormat: studentName },
              { key: "plan", label: "Formule", render: (r) => label(PLANS, r.plan), exportFormat: (r) => label(PLANS, r.plan) },
              { key: "amount", label: "Montant", render: (r) => fmtMoney(r.amount), exportFormat: (r) => Number(r.amount ?? 0) },
              { key: "start_date", label: "Début", render: (r) => fmtDate(r.start_date), exportFormat: (r) => fmtDate(r.start_date) },
              { key: "end_date", label: "Fin", render: (r) => fmtDate(r.end_date) || "—", exportFormat: (r) => fmtDate(r.end_date) },
              {
                key: "status", label: "Statut",
                render: (r) => <Badge variant={r.status === "actif" ? "default" : "outline"}>{label(STATUS, r.status)}</Badge>,
                exportFormat: (r) => label(STATUS, r.status),
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="paiements" className="mt-6">
          <CrudSection
            table="canteen_payments"
            title="Paiements cantine"
            singular="Paiement"
            queryKey={["canteen_payments"]}
            select="*, students(full_name)"
            orderBy={{ column: "paid_at", ascending: false }}
            searchKeys={["students.full_name", "reference", "period"]}
            fields={[
              { name: "student_id", label: "Élève", type: "select", searchable: true, options: studentOptions, required: true },
              { name: "subscription_id", label: "Abonnement lié", type: "select", options: subOptions },
              { name: "amount", label: "Montant (GNF)", type: "number", min: 0, required: true, default: 0 },
              { name: "method", label: "Méthode", type: "select", options: METHODS, required: true, default: "especes" },
              { name: "paid_at", label: "Date de paiement", type: "date", required: true, default: today() },
              { name: "period", label: "Période couverte", placeholder: "Ex. Octobre 2026" },
              { name: "reference", label: "Référence" },
              { name: "notes", label: "Notes", type: "textarea" },
            ]}
            columns={[
              { key: "paid_at", label: "Date", render: (r) => fmtDate(r.paid_at), exportFormat: (r) => fmtDate(r.paid_at) },
              { key: "student", label: "Élève", render: studentName, exportFormat: studentName },
              { key: "period", label: "Période" },
              { key: "method", label: "Méthode", render: (r) => label(METHODS, r.method), exportFormat: (r) => label(METHODS, r.method) },
              { key: "reference", label: "Référence" },
              { key: "amount", label: "Montant", render: (r) => fmtMoney(r.amount), exportFormat: (r) => Number(r.amount ?? 0) },
            ]}
          />
        </TabsContent>

        <TabsContent value="consommation" className="mt-6">
          <CrudSection
            table="canteen_consumption"
            title="Consommation des repas"
            singular="Repas consommé"
            queryKey={["canteen_consumption"]}
            select="*, students(full_name), canteen_menus(main_dish, menu_date)"
            orderBy={{ column: "date", ascending: false }}
            searchKeys={["students.full_name"]}
            fields={[
              { name: "student_id", label: "Élève", type: "select", searchable: true, options: studentOptions, required: true },
              { name: "date", label: "Date", type: "date", required: true, default: today() },
              { name: "meal_type", label: "Type de repas", type: "select", options: MEAL_TYPES, required: true, default: "dejeuner" },
              { name: "menu_id", label: "Menu servi", type: "select", options: menuOptions },
              { name: "amount", label: "Montant facturé (GNF)", type: "number", min: 0, default: 0 },
              { name: "consumed", label: "Repas effectivement consommé", type: "checkbox", default: true },
            ]}
            columns={[
              { key: "date", label: "Date", render: (r) => fmtDate(r.date), exportFormat: (r) => fmtDate(r.date) },
              { key: "student", label: "Élève", render: studentName, exportFormat: studentName },
              { key: "meal_type", label: "Repas", render: (r) => label(MEAL_TYPES, r.meal_type), exportFormat: (r) => label(MEAL_TYPES, r.meal_type) },
              { key: "menu", label: "Menu", render: (r) => r.canteen_menus?.main_dish ?? "—", exportFormat: (r) => r.canteen_menus?.main_dish ?? "" },
              { key: "amount", label: "Montant", render: (r) => fmtMoney(r.amount), exportFormat: (r) => Number(r.amount ?? 0) },
              {
                key: "consumed", label: "Consommé",
                render: (r) => <Badge variant={r.consumed ? "default" : "outline"}>{r.consumed ? "Oui" : "Non"}</Badge>,
                exportFormat: (r) => (r.consumed ? "Oui" : "Non"),
              },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
