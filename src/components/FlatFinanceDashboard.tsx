import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as XLSX from "xlsx";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPublicGNF } from "@/lib/public-offers";
import { printWhenReady } from "@/lib/print-ready";

const db = supabase as any;

const PHASE: Record<string, { label: string; cls: string }> = {
  trial: { label: "Essai", cls: "bg-sky-100 text-sky-900" },
  active: { label: "À jour", cls: "bg-emerald-100 text-emerald-900" },
  unpaid: { label: "En retard", cls: "bg-amber-100 text-amber-900" },
  overdue: { label: "Suspendue", cls: "bg-red-100 text-red-900" },
  none: { label: "Sans forfait", cls: "bg-slate-200 text-slate-800" },
};
const MODE: Record<string, string> = { monthly: "Mensuel", annual: "Annuel", aucun: "Aucun paiement" };

type Row = { school_id: string; school_name: string; offer_name: string; phase: string; mode: string; paid: number; balance: number; overdue: number; next_due: string | null };
type SortKey = "school_name" | "paid" | "balance" | "overdue";

function Tile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div></div>;
}

/** Tableau de bord financier (Super Admin) : indicateurs, graphiques, liste filtrable des écoles, exports Excel et PDF. */
export function FlatFinanceDashboard() {
  const q = useQuery({ queryKey: ["flat-admin", "finance-dashboard"], retry: false, queryFn: async () => {
    const { data, error } = await db.rpc("flat_financial_dashboard");
    if (error) throw error;
    return data as any;
  } });
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState("all");
  const [mode, setMode] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "school_name", dir: 1 });

  const rows: Row[] = q.data?.schools ?? [];
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return rows
      .filter((r) => (phase === "all" || r.phase === phase) && (mode === "all" || r.mode === mode) && (!t || r.school_name.toLowerCase().includes(t)))
      .sort((a, b) => {
        const x = a[sort.key], y = b[sort.key];
        return (typeof x === "string" ? x.localeCompare(String(y), "fr") : Number(x) - Number(y)) * sort.dir;
      });
  }, [rows, search, phase, mode, sort]);

  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (q.isError || !q.data) return <p className="text-sm text-destructive">Tableau de bord indisponible (migration SQL non appliquée ?).</p>;

  const k = q.data.kpi;
  const count = (p: string) => rows.filter((r) => r.phase === p).length;
  const outstanding = rows.reduce((s, r) => s + Number(r.balance), 0);
  const overdueTotal = rows.reduce((s, r) => s + Number(r.overdue), 0);
  const gnf = (n: number) => formatPublicGNF(Number(n));
  const th = (key: SortKey, label: string) => (
    <TableHead className="cursor-pointer select-none" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
      {label}{sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
    </TableHead>
  );

  function exportXlsx() {
    const head = ["École", "Formule", "Mode", "Statut", "Encaissé (GNF)", "Reste à payer (GNF)", "Retard (GNF)", "Prochaine échéance"];
    const safe = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);
    const data = shown.map((r) => [safe(r.school_name), safe(r.offer_name), MODE[r.mode] ?? r.mode, PHASE[r.phase]?.label ?? r.phase, Number(r.paid), Number(r.balance), Number(r.overdue), r.next_due ?? ""]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...data]), "Écoles");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Mois", "Encaissé (GNF)"], ...(q.data.series as any[]).map((s) => [s.month, Number(s.amount)])]), "Encaissements");
    XLSX.writeFile(wb, `situation-financiere-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Fichier Excel créé.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tableau de bord financier</CardTitle>
        <CardDescription>Montants en francs guinéens. Seuls les paiements validés sont comptés comme encaissés. Mis à jour à {new Date(q.data.generated_at).toLocaleString("fr-FR")}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5" id="finance-print">
        <style>{`@media print { body * { visibility: hidden !important; } #finance-print, #finance-print * { visibility: visible !important; } #finance-print { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tile label="Écoles au forfait" value={String(rows.length)} />
          <Tile label="À jour" value={String(count("active"))} />
          <Tile label="En essai" value={String(count("trial"))} />
          <Tile label="En retard" value={String(count("unpaid"))} />
          <Tile label="Suspendues" value={String(count("overdue"))} />
          <Tile label="Encaissé aujourd'hui" value={gnf(k.today)} />
          <Tile label="Encaissé cette semaine" value={gnf(k.week)} />
          <Tile label="Encaissé ce mois" value={gnf(k.month)} />
          <Tile label="Encaissé cette année" value={gnf(k.year)} />
          <Tile label="Paiements à valider" value={String(k.pending_count)} />
          <Tile label="Reste à encaisser" value={gnf(outstanding)} />
          <Tile label="Dont en retard" value={gnf(overdueTotal)} />
          <Tile label="Total encaissé" value={gnf(k.total)} />
          <Tile label="Écoles en mensuel" value={String(rows.filter((r) => r.mode === "monthly").length)} />
          <Tile label="Écoles en annuel" value={String(rows.filter((r) => r.mode === "annual").length)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border p-3">
            <div className="mb-2 text-sm font-semibold">Encaissements des 12 derniers mois</div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={q.data.series}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => `${Math.round(Number(v) / 1000)} k`} />
                  <Tooltip formatter={(v: any) => gnf(Number(v))} />
                  <Bar dataKey="amount" name="Encaissé" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="mb-2 text-sm font-semibold">Répartition par formule</div>
            <Table>
              <TableHeader><TableRow><TableHead>Formule</TableHead><TableHead>Écoles</TableHead><TableHead>Encaissé</TableHead></TableRow></TableHeader>
              <TableBody>
                {(q.data.offers as any[]).map((o) => <TableRow key={o.offer_name}><TableCell>{o.offer_name}</TableCell><TableCell>{o.schools}</TableCell><TableCell>{gnf(o.collected)}</TableCell></TableRow>)}
                {!(q.data.offers as any[]).length && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">Aucune école.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Input className="max-w-xs" placeholder="Rechercher une école…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={phase} onChange={(e) => setPhase(e.target.value)}>
              <option value="all">Tous les statuts</option>
              {Object.entries(PHASE).map(([v, p]) => <option key={v} value={v}>{p.label}</option>)}
            </select>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="all">Tous les modes</option>
              {Object.entries(MODE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={exportXlsx}>Exporter Excel</Button>
              <Button size="sm" variant="outline" onClick={() => void printWhenReady()}>Exporter PDF</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>{th("school_name", "École")}<TableHead>Formule</TableHead><TableHead>Mode</TableHead><TableHead>Statut</TableHead>{th("paid", "Encaissé")}{th("balance", "Reste")}{th("overdue", "Retard")}<TableHead>Prochaine échéance</TableHead></TableRow></TableHeader>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.school_id}>
                    <TableCell>{r.school_name}</TableCell><TableCell>{r.offer_name}</TableCell><TableCell>{MODE[r.mode] ?? r.mode}</TableCell>
                    <TableCell><Badge className={PHASE[r.phase]?.cls}>{PHASE[r.phase]?.label ?? r.phase}</Badge></TableCell>
                    <TableCell>{gnf(r.paid)}</TableCell><TableCell>{gnf(r.balance)}</TableCell><TableCell>{gnf(r.overdue)}</TableCell>
                    <TableCell>{r.next_due ? new Date(r.next_due).toLocaleDateString("fr-FR") : "—"}</TableCell>
                  </TableRow>
                ))}
                {!shown.length && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Aucune école ne correspond.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
