import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Printer, Wallet, ArrowDownCircle, ArrowUpCircle, Scale, Download, ArrowLeftRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useSchool } from "@/hooks/useSchool";
import { getAcademicYearOptions, getCurrentAcademicYear } from "@/lib/academic-year";
import {
  ACCOUNT_CATALOG, ACCOUNT_LABELS, EXPENSE_LABELS, METHOD_LABELS, REVENUE_LABELS, accountingErrorMessage, budgetProgress, categoryLabel, isNegative,
  missingTemplates, periodRange, printEntryReceipt, selectableCategories, toCsv, validateCategoryInput,
  type AccountingCategory, type CsvColumn, type PeriodPreset,
} from "@/lib/accounting";

export const Route = createFileRoute("/_authenticated/comptabilite")({
  head: () => ({ meta: [{ title: "Comptabilité — MBGEduGuinée" }] }),
  component: AccountingPage,
});

const db = supabase as any;
const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n)).replace(/[  ]/g, " ");
const dateFr = (d: string) => new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("fr-FR");
const today = () => new Date().toISOString().slice(0, 10);
const ROW_LIMIT = 1000;

/** Lignes du compte de résultat : par catégorie du plan comptable si disponible, sinon par type historique. */
function byCat(cats: any, types: Record<string, number> | undefined, labels: Record<string, string>): Array<{ key: string; label: string; total: number }> {
  if (Array.isArray(cats) && cats.length) return cats.map((c: any, i: number) => ({ key: String(c.category_id ?? "none" + i), label: categoryLabel(c) || c.label, total: Number(c.total) }));
  return Object.keys(labels).map((t) => ({ key: t, label: labels[t], total: Number(types?.[t] ?? 0) }));
}

const ACCOUNT_TYPES = Object.keys(ACCOUNT_LABELS);
const METHODS = Object.keys(METHOD_LABELS);

function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function AccountingPage() {
  const qc = useQueryClient();
  const [preset, setPreset] = useState<PeriodPreset>("school_year");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [accountId, setAccountId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const range = useMemo(() => periodRange(preset, today(), custom), [preset, custom]);
  const refreshAll = () => void qc.invalidateQueries({ queryKey: ["acc"] });

  const balances = useQuery({ queryKey: ["acc", "balances"], queryFn: async () => {
    const { data, error } = await db.rpc("accounting_balances"); if (error) throw error; return (data ?? []) as any[];
  } });
  const accounts = balances.data ?? [];
  const categoriesQ = useQuery({ queryKey: ["acc", "categories"], queryFn: async () => {
    const { data, error } = await db.from("accounting_categories").select("*").order("kind").order("sort_order"); if (error) throw error; return (data ?? []) as AccountingCategory[];
  } });
  const categories = categoriesQ.data ?? [];
  const summary = useQuery({ queryKey: ["acc", "summary", range, accountId], queryFn: async () => {
    const { data, error } = await db.rpc("accounting_summary", { _from: range.from, _to: range.to, _account_id: accountId === "all" ? null : accountId });
    if (error) throw error; return data as any;
  } });

  function useEntries(table: "revenues" | "expenses" | "account_transfers") {
    return useQuery({ queryKey: ["acc", table, range, accountId, showVoided], queryFn: async () => {
      let q = db.from(table).select(table === "account_transfers" ? "*, from:financial_accounts!account_transfers_from_account_id_fkey(name), to:financial_accounts!account_transfers_to_account_id_fkey(name)" : "*, financial_accounts(name), accounting_categories(code,label)").order("occurred_at", { ascending: false }).limit(ROW_LIMIT);
      if (range.from) q = q.gte("occurred_at", range.from);
      if (range.to) q = q.lte("occurred_at", range.to);
      if (accountId !== "all") q = table === "account_transfers" ? q.or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`) : q.eq("account_id", accountId);
      if (!showVoided) q = q.is("voided_at", null);
      const { data, error } = await q; if (error) throw error; return (data ?? []) as any[];
    } });
  }
  const revenuesQ = useEntries("revenues");
  const expensesQ = useEntries("expenses");
  const transfersQ = useEntries("account_transfers");
  const q = search.trim().toLowerCase();
  const match = (r: any) => !q || [r.description, r.reference, r.beneficiary, r.note, r.type].some((x) => String(x ?? "").toLowerCase().includes(q));
  const revenues = (revenuesQ.data ?? []).filter(match);
  const expenses = (expensesQ.data ?? []).filter(match);
  const transfers = (transfersQ.data ?? []).filter(match);

  const sum = summary.data ?? { revenue_total: 0, expense_total: 0, net: 0, revenue_by_type: {}, expense_by_type: {}, by_month: [] };
  const consolidated = accounts.reduce((s: number, a: any) => s + Number(a.balance), 0);
  const truncated = [revenuesQ.data, expensesQ.data, transfersQ.data].some((d) => (d?.length ?? 0) >= ROW_LIMIT);
  const activeAccounts = accounts.filter((a: any) => a.is_active);

  const journal = useMemo(() => [
    ...revenues.map((r) => ({ id: r.id, date: r.occurred_at, label: `Recette ${r.accounting_categories?.label ?? REVENUE_LABELS[r.type] ?? r.type}${r.description ? " — " + r.description : ""}`, account: r.financial_accounts?.name, reference: r.reference, debit: Number(r.amount), credit: 0, voided: !!r.voided_at })),
    ...expenses.map((e) => ({ id: e.id, date: e.occurred_at, label: `Dépense ${e.accounting_categories?.label ?? EXPENSE_LABELS[e.type] ?? e.type}${e.description ? " — " + e.description : ""}`, account: e.financial_accounts?.name, reference: e.reference, debit: 0, credit: Number(e.amount), voided: !!e.voided_at })),
    ...transfers.map((t) => ({ id: t.id, date: t.occurred_at, label: `Virement ${t.from?.name ?? ""} → ${t.to?.name ?? ""}${t.note ? " — " + t.note : ""}`, account: "—", reference: t.reference, debit: 0, credit: 0, voided: !!t.voided_at })),
  ].sort((a, b) => (a.date === b.date ? 0 : a.date > b.date ? -1 : 1)), [revenues, expenses, transfers]);

  const exportCsv = (name: string, rows: any[], cols: CsvColumn<any>[]) => rows.length ? downloadCsv(`${name}-${today()}.csv`, toCsv(rows, cols)) : toast.error("Rien à exporter.");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Comptabilité</h1>
          <p className="text-muted-foreground mt-1">Comptes, recettes, dépenses, virements et journaux financiers.</p>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="gap-2"><Printer className="size-4" />Imprimer</Button>
      </div>

      <Card className="print:hidden"><CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1.5"><Label>Période</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as PeriodPreset)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="month">Ce mois</SelectItem><SelectItem value="quarter">Ce trimestre</SelectItem>
              <SelectItem value="school_year">Année scolaire (sept. → août)</SelectItem><SelectItem value="year">Année civile</SelectItem>
              <SelectItem value="all">Tout</SelectItem><SelectItem value="custom">Personnalisée</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" ? (<>
          <div className="space-y-1.5"><Label>Du</Label><Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Au</Label><Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></div>
        </>) : (
          <div className="space-y-1.5 sm:col-span-2 text-sm text-muted-foreground flex items-end pb-2">{range.from ? `Du ${dateFr(range.from)} au ${dateFr(range.to!)}` : "Toutes les dates"}</div>
        )}
        <div className="space-y-1.5"><Label>Compte</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les comptes</SelectItem>{accounts.map((a: any) => <SelectItem key={a.account_id} value={a.account_id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Recherche</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Description, référence…" /></div>
      </CardContent></Card>

      {(balances.isError || summary.isError) && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">Les données comptables ne sont pas disponibles (migration SQL de la comptabilité non appliquée ou droits insuffisants).</p>
      )}
      {truncated && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Les listes affichent au plus {ROW_LIMIT} lignes : réduisez la période pour tout voir. Les totaux ci-dessous restent exacts.</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Recettes (période)" value={fmt(sum.revenue_total) + " GNF"} icon={ArrowDownCircle} color="text-success bg-success/10" />
        <StatCard label="Dépenses (période)" value={fmt(sum.expense_total) + " GNF"} icon={ArrowUpCircle} color="text-destructive bg-destructive/10" />
        <StatCard label="Résultat net (période)" value={fmt(sum.net) + " GNF"} icon={Scale} color={sum.net >= 0 ? "text-success bg-success/10" : "text-destructive bg-destructive/10"} />
        <StatCard label="Solde consolidé actuel" value={fmt(consolidated) + " GNF"} icon={Wallet} color="text-primary bg-primary/10" />
      </div>

      <ClosureCard onDone={refreshAll} />

      <Tabs defaultValue="accounts">
        <TabsList className="flex-wrap h-auto print:hidden">
          <TabsTrigger value="accounts">Comptes</TabsTrigger>
          <TabsTrigger value="revenues">Recettes</TabsTrigger>
          <TabsTrigger value="expenses">Dépenses</TabsTrigger>
          <TabsTrigger value="transfers">Virements</TabsTrigger>
          <TabsTrigger value="post">À comptabiliser</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="plan">Plan comptable</TabsTrigger>
          <TabsTrigger value="journal">Journal</TabsTrigger>
          <TabsTrigger value="report">Compte de résultat</TabsTrigger>
          <TabsTrigger value="audit">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts" className="space-y-4">
          <div className="flex flex-wrap justify-end gap-2">
            <SetupAccountsDialog existing={accounts.map((a: any) => a.name)} onSaved={refreshAll} />
            <AccountDialog existing={accounts.map((a: any) => a.name)} onSaved={refreshAll} />
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Nom</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Solde initial</TableHead><TableHead className="text-right">Recettes</TableHead><TableHead className="text-right">Dépenses</TableHead><TableHead className="text-right">Virements (net)</TableHead><TableHead className="text-right">Solde actuel</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {accounts.map((a: any) => (
                  <TableRow key={a.account_id} className={a.is_active ? "" : "opacity-60"}>
                    <TableCell className="font-medium">{a.name}{!a.is_active && <Badge variant="outline" className="ml-2">Archivé</Badge>}</TableCell>
                    <TableCell>{ACCOUNT_LABELS[a.type] ?? a.type}</TableCell>
                    <TableCell className="text-right">{fmt(Number(a.initial_balance))}</TableCell>
                    <TableCell className="text-right text-success">{fmt(Number(a.revenues))}</TableCell>
                    <TableCell className="text-right text-destructive">{fmt(Number(a.expenses))}</TableCell>
                    <TableCell className="text-right">{fmt(Number(a.transfers_in) - Number(a.transfers_out))}</TableCell>
                    <TableCell className={"text-right font-semibold " + (isNegative(a.balance) ? "text-destructive" : "")}>
                      {isNegative(a.balance) && <AlertTriangle className="mr-1 inline size-4" />}{fmt(Number(a.balance))} GNF
                    </TableCell>
                    <TableCell className="text-right"><ArchiveButton account={a} onDone={refreshAll} /></TableCell>
                  </TableRow>
                ))}
                {accounts.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Aucun compte. Créez votre caisse principale pour commencer.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
          <p className="text-xs text-muted-foreground">Un compte ne peut pas être supprimé : archivez-le. Son solde initial n'est plus modifiable dès qu'il contient des écritures.</p>
        </TabsContent>

        <TabsContent value="revenues" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> Afficher les écritures annulées</label>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={() => exportCsv("recettes", revenues, [
                { label: "Date", value: (r) => r.occurred_at }, { label: "Catégorie", value: (r) => categoryLabel(r.accounting_categories) || (REVENUE_LABELS[r.type] ?? r.type) }, { label: "Compte", value: (r) => r.financial_accounts?.name },
                { label: "Description", value: (r) => r.description }, { label: "Référence", value: (r) => r.reference }, { label: "Mode", value: (r) => METHOD_LABELS[r.method] ?? r.method },
                { label: "Montant", value: (r) => Number(r.amount) }, { label: "Statut", value: (r) => (r.voided_at ? "Annulée : " + (r.void_reason ?? "") : "Valide") },
              ])}><Download className="size-4" />CSV</Button>
              <TxDialog kind="revenue" accounts={activeAccounts} categories={categories} onSaved={refreshAll} />
            </div>
          </div>
          <EntryTable rows={revenues} kind="revenue" onChanged={refreshAll} loading={revenuesQ.isLoading} />
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} /> Afficher les écritures annulées</label>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={() => exportCsv("depenses", expenses, [
                { label: "Date", value: (r) => r.occurred_at }, { label: "Catégorie", value: (r) => categoryLabel(r.accounting_categories) || (EXPENSE_LABELS[r.type] ?? r.type) }, { label: "Compte", value: (r) => r.financial_accounts?.name },
                { label: "Bénéficiaire", value: (r) => r.beneficiary }, { label: "Description", value: (r) => r.description }, { label: "Référence", value: (r) => r.reference },
                { label: "Montant", value: (r) => Number(r.amount) }, { label: "Statut", value: (r) => (r.voided_at ? "Annulée : " + (r.void_reason ?? "") : "Valide") },
              ])}><Download className="size-4" />CSV</Button>
              <TxDialog kind="expense" accounts={activeAccounts} categories={categories} onSaved={refreshAll} />
            </div>
          </div>
          <EntryTable rows={expenses} kind="expense" onChanged={refreshAll} loading={expensesQ.isLoading} />
        </TabsContent>

        <TabsContent value="transfers" className="space-y-4">
          <div className="flex justify-end"><TransferDialog accounts={activeAccounts} onSaved={refreshAll} /></div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>De</TableHead><TableHead>Vers</TableHead><TableHead>Référence / note</TableHead><TableHead className="text-right">Montant</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {transfers.map((t) => (
                  <TableRow key={t.id} className={t.voided_at ? "opacity-50 line-through" : ""}>
                    <TableCell>{dateFr(t.occurred_at)}</TableCell><TableCell>{t.from?.name}</TableCell><TableCell>{t.to?.name}</TableCell>
                    <TableCell className="max-w-xs truncate">{[t.reference, t.note].filter(Boolean).join(" — ")}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(Number(t.amount))} GNF</TableCell>
                    <TableCell className="text-right print:hidden">{t.voided_at ? <Badge variant="outline">Annulé</Badge> : <VoidButton table="account_transfers" id={t.id} onDone={refreshAll} />}</TableCell>
                  </TableRow>
                ))}
                {transfers.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Aucun virement.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="post" className="space-y-4">
          <PostingPanel accounts={activeAccounts} onDone={refreshAll} />
        </TabsContent>

        <TabsContent value="budget"><BudgetPanel /></TabsContent>
        <TabsContent value="plan"><CategoriesPanel categories={categories} onChanged={refreshAll} /></TabsContent>

        <TabsContent value="journal">
          <div className="mb-3 flex justify-end print:hidden">
            <Button variant="outline" className="gap-2" onClick={() => exportCsv("journal", journal, [
              { label: "Date", value: (r) => r.date }, { label: "Libellé", value: (r) => r.label }, { label: "Compte", value: (r) => r.account },
              { label: "Référence", value: (r) => r.reference }, { label: "Débit", value: (r) => r.debit || "" }, { label: "Crédit", value: (r) => r.credit || "" },
            ])}><Download className="size-4" />CSV</Button>
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead>Compte</TableHead><TableHead>Réf.</TableHead><TableHead className="text-right">Entrée</TableHead><TableHead className="text-right">Sortie</TableHead></TableRow></TableHeader>
              <TableBody>
                {journal.map((row) => (
                  <TableRow key={row.id} className={row.voided ? "opacity-50 line-through" : ""}>
                    <TableCell>{dateFr(row.date)}</TableCell><TableCell className="max-w-md truncate">{row.label}</TableCell><TableCell>{row.account}</TableCell><TableCell>{row.reference}</TableCell>
                    <TableCell className="text-right text-success">{row.debit ? fmt(row.debit) : ""}</TableCell>
                    <TableCell className="text-right text-destructive">{row.credit ? fmt(row.credit) : ""}</TableCell>
                  </TableRow>
                ))}
                {journal.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Aucune écriture sur cette période.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="report">
          <Card>
            <CardHeader><CardTitle>Compte de résultat {range.from ? `— du ${dateFr(range.from)} au ${dateFr(range.to!)}` : ""}</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-semibold mb-2">Recettes par catégorie</h3>
                {byCat(sum.revenue_by_category, sum.revenue_by_type, REVENUE_LABELS).map((l) => <div key={l.key} className="flex justify-between py-1 border-b text-sm"><span>{l.label}</span><span className="text-success">{fmt(l.total)} GNF</span></div>)}
                <div className="flex justify-between py-2 font-bold"><span>Total recettes</span><span className="text-success">{fmt(sum.revenue_total)} GNF</span></div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Dépenses par catégorie</h3>
                {byCat(sum.expense_by_category, sum.expense_by_type, EXPENSE_LABELS).map((l) => <div key={l.key} className="flex justify-between py-1 border-b text-sm"><span>{l.label}</span><span className="text-destructive">{fmt(l.total)} GNF</span></div>)}
                <div className="flex justify-between py-2 font-bold"><span>Total dépenses</span><span className="text-destructive">{fmt(sum.expense_total)} GNF</span></div>
              </div>
              <div className="flex justify-between py-3 border-t-2 border-primary font-bold text-lg">
                <span>Résultat net</span><span className={sum.net >= 0 ? "text-success" : "text-destructive"}>{fmt(sum.net)} GNF</span>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Évolution mensuelle</h3>
                <Table>
                  <TableHeader><TableRow><TableHead>Mois</TableHead><TableHead className="text-right">Recettes</TableHead><TableHead className="text-right">Dépenses</TableHead><TableHead className="text-right">Résultat</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(sum.by_month as any[]).map((m) => (
                      <TableRow key={m.month}><TableCell>{m.month}</TableCell><TableCell className="text-right">{fmt(Number(m.revenue))}</TableCell><TableCell className="text-right">{fmt(Number(m.expense))}</TableCell>
                        <TableCell className={"text-right font-medium " + (Number(m.revenue) - Number(m.expense) < 0 ? "text-destructive" : "text-success")}>{fmt(Number(m.revenue) - Number(m.expense))}</TableCell></TableRow>
                    ))}
                    {!(sum.by_month as any[]).length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Aucune donnée.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit"><AuditPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <Card><CardContent className="p-5">
      <div className={"size-10 rounded-lg flex items-center justify-center mb-3 " + color}><Icon className="size-5" /></div>
      <div className="text-2xl font-bold font-display">{value}</div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </CardContent></Card>
  );
}

function EntryTable({ rows, kind, onChanged, loading }: { rows: any[]; kind: "revenue" | "expense"; onChanged: () => void; loading: boolean }) {
  const table = kind === "revenue" ? "revenues" : "expenses";
  const labels = kind === "revenue" ? REVENUE_LABELS : EXPENSE_LABELS;
  const { school } = useSchool();
  const typeOf = (r: any) => categoryLabel(r.accounting_categories) || labels[r.type] || r.type;
  const receipt = (r: any) => printEntryReceipt({
    kind, id: r.id, date: r.occurred_at, amount: Number(r.amount), typeLabel: typeOf(r), accountName: r.financial_accounts?.name,
    methodLabel: METHOD_LABELS[r.method] ?? r.method, reference: r.reference, description: r.description, beneficiary: r.beneficiary, voidReason: r.void_reason,
    school: { name: (school as any)?.name, address: [(school as any)?.address, (school as any)?.city].filter(Boolean).join(", "), phone: (school as any)?.phone },
  });
  return (
    <Card><CardContent className="p-0 overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Date</TableHead><TableHead>Catégorie</TableHead><TableHead>Compte</TableHead>{kind === "expense" && <TableHead>Bénéficiaire</TableHead>}<TableHead>Description</TableHead><TableHead>Réf.</TableHead><TableHead>Mode</TableHead><TableHead className="text-right">Montant</TableHead><TableHead />
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className={r.voided_at ? "opacity-50" : ""}>
              <TableCell>{dateFr(r.occurred_at)}</TableCell>
              <TableCell className="max-w-[16rem]">{typeOf(r)}</TableCell>
              <TableCell>{r.financial_accounts?.name}</TableCell>
              {kind === "expense" && <TableCell>{r.beneficiary}</TableCell>}
              <TableCell className="max-w-xs truncate">{r.description}{r.voided_at && <div className="text-xs text-destructive">Annulée : {r.void_reason}</div>}</TableCell>
              <TableCell>{r.reference}</TableCell>
              <TableCell>{METHOD_LABELS[r.method] ?? r.method}</TableCell>
              <TableCell className={"text-right font-medium " + (r.voided_at ? "line-through" : kind === "revenue" ? "text-success" : "text-destructive")}>{kind === "revenue" ? "+" : "-"}{fmt(Number(r.amount))} GNF</TableCell>
              <TableCell className="text-right whitespace-nowrap print:hidden">
                <Button size="sm" variant="ghost" className="gap-1" onClick={() => receipt(r)}><Printer className="size-3.5" />{kind === "revenue" ? "Reçu" : "Bon"}</Button>
                {r.voided_at ? <Badge variant="outline">Annulée</Badge> : (<>
                  <EditNoteButton table={table} row={r} onDone={onChanged} />
                  <VoidButton table={table} id={r.id} onDone={onChanged} />
                </>)}
              </TableCell>
            </TableRow>
          ))}
          {!loading && rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">{kind === "revenue" ? "Aucune recette sur cette période." : "Aucune dépense sur cette période."}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

/** Annulation motivée : l'écriture reste visible (barrée) et n'entre plus dans les soldes. Jamais de suppression. */
function VoidButton({ table, id, onDone }: { table: string; id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    if (reason.trim().length < 3) return void toast.error("Saisissez le motif de l'annulation (3 caractères minimum).");
    setBusy(true);
    const { error } = await db.from(table).update({ voided_at: new Date().toISOString(), void_reason: reason.trim() }).eq("id", id);
    setBusy(false);
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success("Écriture annulée."); setOpen(false); setReason(""); onDone();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost" className="text-destructive">Annuler</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Annuler cette écriture</DialogTitle><DialogDescription>L'écriture ne sera pas supprimée : elle restera visible avec son motif, mais n'entrera plus dans les soldes. Pour corriger un montant, annulez puis saisissez une nouvelle écriture.</DialogDescription></DialogHeader>
        <div><Label>Motif (obligatoire)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. erreur de saisie" /></div>
        <DialogFooter><Button variant="destructive" onClick={run} disabled={busy}>Confirmer l'annulation</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Seuls la description et la référence restent modifiables ; le montant, le compte, la date et le type sont figés. */
function EditNoteButton({ table, row, onDone }: { table: string; row: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ description: row.description ?? "", reference: row.reference ?? "" });
  async function run() {
    const { error } = await db.from(table).update({ description: f.description.trim() || null, reference: f.reference.trim() || null }).eq("id", row.id);
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success("Enregistré."); setOpen(false); onDone();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost">Modifier</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Modifier la description</DialogTitle><DialogDescription>Le montant, le compte, la date et le type ne sont pas modifiables (traçabilité).</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label>Description</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div><Label>Référence (n° de reçu, de facture…)</Label><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={run}>Enregistrer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveButton({ account, onDone }: { account: any; onDone: () => void }) {
  async function toggle() {
    if (account.is_active && !window.confirm(`Archiver le compte « ${account.name} » ? Il ne pourra plus recevoir d'écritures (son historique est conservé).`)) return;
    const { error } = await db.from("financial_accounts").update({ is_active: !account.is_active }).eq("id", account.account_id);
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success(account.is_active ? "Compte archivé." : "Compte réactivé."); onDone();
  }
  return <Button size="sm" variant="ghost" onClick={toggle}>{account.is_active ? "Archiver" : "Réactiver"}</Button>;
}

function AccountDialog({ existing, onSaved }: { existing: string[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", type: "caisse", initial_balance: "0" });
  const templates = missingTemplates(existing);
  function pick(name: string) {
    const t = ACCOUNT_CATALOG.find((x) => x.name === name);
    if (t) setForm((f) => ({ ...f, name: t.name, type: t.type }));
  }
  async function save() {
    if (!form.name.trim()) return void toast.error("Le nom du compte est obligatoire.");
    if (existing.some((n) => n.trim().toLowerCase() === form.name.trim().toLowerCase())) return void toast.error("Un compte porte déjà ce nom.");
    const { error } = await db.from("financial_accounts").insert({ name: form.name.trim(), type: form.type, initial_balance: Number(form.initial_balance) || 0 });
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success("Compte créé"); setOpen(false); setForm({ name: "", type: "caisse", initial_balance: "0" }); onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-2"><Plus className="size-4" />Nouveau compte</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau compte financier</DialogTitle><DialogDescription>Un compte est un endroit où l'argent est gardé (caisse, banque, Orange Money…). Choisissez un modèle ou saisissez le vôtre.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          {templates.length > 0 && (
            <div><Label>Modèle de compte</Label>
              <Select onValueChange={pick}>
                <SelectTrigger><SelectValue placeholder="Choisir un modèle (facultatif)" /></SelectTrigger>
                <SelectContent>{templates.map((t) => <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
              {form.name && ACCOUNT_CATALOG.find((t) => t.name === form.name) && <p className="mt-1 text-xs text-muted-foreground">{ACCOUNT_CATALOG.find((t) => t.name === form.name)!.description}</p>}
            </div>
          )}
          <div><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Caisse principale" /></div>
          <div><Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{ACCOUNT_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Solde initial (GNF)</Label><Input type="number" value={form.initial_balance} onChange={(e) => setForm({ ...form, initial_balance: e.target.value })} />
            <p className="mt-1 text-xs text-muted-foreground">Ce qu'il y a dans le compte le jour où vous commencez. Il ne sera plus modifiable dès la première écriture.</p></div>
        </div>
        <DialogFooter><Button onClick={save}>Créer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Crée d'un coup plusieurs comptes usuels (solde initial 0) en cochant dans le catalogue. */
function SetupAccountsDialog({ existing, onSaved }: { existing: string[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const templates = missingTemplates(existing);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const isOn = (t: { name: string; base?: boolean }) => checked[t.name] ?? !!t.base;
  async function create() {
    const rows = templates.filter(isOn).map((t) => ({ name: t.name, type: t.type, initial_balance: 0 }));
    if (!rows.length) return void toast.error("Cochez au moins un compte.");
    setBusy(true);
    const { error } = await db.from("financial_accounts").insert(rows);
    setBusy(false);
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success(`${rows.length} compte(s) créé(s). Vous pourrez saisir leur solde de départ en créant une recette d'ouverture si besoin.`); setOpen(false); setChecked({}); onSaved();
  }
  if (!templates.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="gap-2"><Plus className="size-4" />Comptes usuels</Button></DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Créer les comptes usuels</DialogTitle><DialogDescription>Cochez les comptes que votre établissement tient réellement. Les comptes de base sont déjà cochés ; ils sont créés avec un solde de 0 GNF.</DialogDescription></DialogHeader>
        <div className="space-y-2">
          {templates.map((t) => (
            <label key={t.name} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
              <input type="checkbox" className="mt-1" checked={isOn(t)} onChange={(e) => setChecked({ ...checked, [t.name]: e.target.checked })} />
              <span><span className="font-medium">{t.name}</span> <Badge variant="outline" className="ml-1">{ACCOUNT_LABELS[t.type]}</Badge><span className="block text-xs text-muted-foreground">{t.description}</span></span>
            </label>
          ))}
        </div>
        <DialogFooter><Button onClick={create} disabled={busy}>Créer les comptes cochés</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TxDialog({ kind, accounts, categories, onSaved }: { kind: "revenue" | "expense"; accounts: any[]; categories: AccountingCategory[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const cats = selectableCategories(categories, kind === "revenue" ? "recette" : "depense");
  const blank = () => ({ account_id: "", category_id: "", amount: "", method: "especes", description: "", reference: "", beneficiary: "", occurred_at: today() });
  const [form, setForm] = useState<any>(blank);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    if (!form.account_id) return void toast.error("Choisissez un compte.");
    if (cats.length && !form.category_id) return void toast.error("Choisissez une catégorie.");
    const amount = Number(form.amount);
    if (!(amount > 0)) return void toast.error("Le montant doit être supérieur à 0.");
    if (form.occurred_at > today()) return void toast.error("La date ne peut pas être dans le futur.");
    // Le type historique est déduit automatiquement de la catégorie par la base ; « autres » n'est qu'une valeur de repli.
    const payload: any = { account_id: form.account_id, type: "autres", amount, method: form.method, description: form.description.trim() || null, reference: form.reference.trim() || null, occurred_at: form.occurred_at };
    if (form.category_id) payload.category_id = form.category_id;
    if (kind === "expense") payload.beneficiary = form.beneficiary.trim() || null;
    setBusy(true);
    const { error } = await db.from(kind === "revenue" ? "revenues" : "expenses").insert(payload);
    setBusy(false);
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success("Enregistré"); setOpen(false); setForm(blank()); onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-2"><Plus className="size-4" />{kind === "revenue" ? "Nouvelle recette" : "Nouvelle dépense"}</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{kind === "revenue" ? "Nouvelle recette" : "Nouvelle dépense"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Compte</Label>
            <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
              <SelectTrigger><SelectValue placeholder={accounts.length ? "Sélectionner" : "Créez d'abord un compte"} /></SelectTrigger>
              <SelectContent>{accounts.map((a: any) => <SelectItem key={a.account_id} value={a.account_id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Catégorie</Label>
            <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="Sélectionner la catégorie" /></SelectTrigger>
              <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{categoryLabel(c)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Mode de paiement</Label>
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((t) => <SelectItem key={t} value={t}>{METHOD_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Montant (GNF)</Label><Input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
            <div><Label>Date</Label><Input type="date" max={today()} value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} /></div>
          </div>
          {kind === "expense" && <div><Label>Bénéficiaire</Label><Input value={form.beneficiary} onChange={(e) => setForm({ ...form, beneficiary: e.target.value })} /></div>}
          <div><Label>Référence (n° de reçu, facture…)</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
          <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <p className="text-xs text-muted-foreground">Une fois enregistrée, l'écriture ne peut plus être supprimée ni son montant modifié : on l'annule avec un motif.</p>
        </div>
        <DialogFooter><Button onClick={save} disabled={busy}>Enregistrer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ accounts, onSaved }: { accounts: any[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ from: "", to: "", amount: "", reference: "", note: "", occurred_at: today() });
  async function save() {
    if (!f.from || !f.to) return void toast.error("Choisissez les deux comptes.");
    if (f.from === f.to) return void toast.error("Les deux comptes doivent être différents.");
    const amount = Number(f.amount);
    if (!(amount > 0)) return void toast.error("Le montant doit être supérieur à 0.");
    const src = accounts.find((a) => a.account_id === f.from);
    if (src && Number(src.balance) < amount && !window.confirm(`Le solde de « ${src.name} » (${fmt(Number(src.balance))} GNF) est inférieur au montant. Continuer ?`)) return;
    const { error } = await db.from("account_transfers").insert({ from_account_id: f.from, to_account_id: f.to, amount, reference: f.reference.trim() || null, note: f.note.trim() || null, occurred_at: f.occurred_at });
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success("Virement enregistré"); setOpen(false); setF({ from: "", to: "", amount: "", reference: "", note: "", occurred_at: today() }); onSaved();
  }
  const pick = (k: "from" | "to") => (
    <Select value={f[k]} onValueChange={(v) => setF({ ...f, [k]: v })}>
      <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
      <SelectContent>{accounts.map((a: any) => <SelectItem key={a.account_id} value={a.account_id}>{a.name} ({fmt(Number(a.balance))})</SelectItem>)}</SelectContent>
    </Select>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-2"><ArrowLeftRight className="size-4" />Nouveau virement</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Virement entre comptes</DialogTitle><DialogDescription>Déplace de l'argent d'un compte à un autre sans modifier le résultat (ni recette, ni dépense).</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label>Depuis</Label>{pick("from")}</div>
          <div><Label>Vers</Label>{pick("to")}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Montant (GNF)</Label><Input type="number" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></div>
            <div><Label>Date</Label><Input type="date" max={today()} value={f.occurred_at} onChange={(e) => setF({ ...f, occurred_at: e.target.value })} /></div>
          </div>
          <div><Label>Référence</Label><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></div>
          <div><Label>Note</Label><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
        </div>
        <DialogFooter><Button onClick={save}>Enregistrer</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Paiements d'élèves validés et salaires payés qui ne sont pas encore dans la comptabilité (une seule fois chacun, jamais en double). */
function PostingPanel({ accounts, onDone }: { accounts: any[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const pay = useQuery({ queryKey: ["acc", "unposted-pay"], queryFn: async () => { const { data, error } = await db.rpc("unposted_payments"); if (error) throw error; return (data ?? []) as any[]; } });
  const slips = useQuery({ queryKey: ["acc", "unposted-slips"], queryFn: async () => { const { data, error } = await db.rpc("unposted_payslips"); if (error) throw error; return (data ?? []) as any[]; } });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["acc"] }); onDone(); };
  async function run(rpc: string, args: Record<string, unknown>, okMsg: (n: any) => string) {
    if (!accountId) return void toast.error("Choisissez le compte à créditer / débiter.");
    if (busy) return;
    setBusy(true);
    const { data, error } = await db.rpc(rpc, { _account_id: accountId, ...args });
    setBusy(false);
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success(okMsg(data)); refresh();
  }
  const totalPay = (pay.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const totalSlips = (slips.data ?? []).reduce((s, p) => s + Number(p.net_pay), 0);
  return (
    <div className="space-y-4">
      <AutoPostCard accounts={accounts} onDone={refresh} />
      <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_2fr] sm:items-end">
        <div className="space-y-1.5"><Label>Compte à utiliser</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Choisir un compte" /></SelectTrigger>
            <SelectContent>{accounts.map((a: any) => <SelectItem key={a.account_id} value={a.account_id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">Les paiements d'élèves validés ne sont pas ajoutés automatiquement à la comptabilité : vous choisissez le compte (caisse, banque, Orange Money…) puis vous les comptabilisez. Chaque paiement ne peut l'être qu'une seule fois.</p>
      </CardContent></Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Paiements d'élèves validés non comptabilisés ({(pay.data ?? []).length} — {fmt(totalPay)} GNF)</CardTitle>
          <Button size="sm" disabled={busy || !(pay.data ?? []).length} onClick={() => run("post_all_payments", {}, (n) => `${n} paiement(s) comptabilisé(s).`)}>Tout comptabiliser</Button></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Élève</TableHead><TableHead>Type</TableHead><TableHead>Reçu</TableHead><TableHead className="text-right">Montant</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(pay.data ?? []).map((p) => (
                <TableRow key={p.id}><TableCell>{dateFr(p.paid_at)}</TableCell><TableCell>{p.student_name}</TableCell><TableCell className="capitalize">{p.payment_type}</TableCell><TableCell>{p.receipt_number}</TableCell>
                  <TableCell className="text-right">{fmt(Number(p.amount))} GNF</TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline" disabled={busy} onClick={() => run("post_payment_to_revenue", { _payment_id: p.id }, () => "Paiement comptabilisé.")}>Comptabiliser</Button></TableCell></TableRow>
              ))}
              {!(pay.data ?? []).length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Tous les paiements validés sont comptabilisés.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Salaires payés non comptabilisés ({(slips.data ?? []).length} — {fmt(totalSlips)} GNF)</CardTitle>
          <Button size="sm" disabled={busy || !(slips.data ?? []).length} onClick={() => run("post_all_payslips", {}, (n) => `${n} salaire(s) comptabilisé(s).`)}>Tout comptabiliser</Button></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Période</TableHead><TableHead>Employé</TableHead><TableHead className="text-right">Net payé</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(slips.data ?? []).map((p) => (
                <TableRow key={p.id}><TableCell>{String(p.period_month).padStart(2, "0")}/{p.period_year}</TableCell><TableCell>{p.employee}</TableCell><TableCell className="text-right">{fmt(Number(p.net_pay))} GNF</TableCell>
                  <TableCell className="text-right"><Button size="sm" variant="outline" disabled={busy} onClick={() => run("post_payslip_to_expense", { _payslip_id: p.id }, () => "Salaire comptabilisé.")}>Comptabiliser</Button></TableCell></TableRow>
              ))}
              {!(slips.data ?? []).length && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Tous les salaires payés sont comptabilisés.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = { INSERT: "Création", UPDATE: "Modification", VOID: "Annulation", DELETE: "Suppression" };
const TABLE_LABEL: Record<string, string> = { revenues: "Recette", expenses: "Dépense", account_transfers: "Virement", financial_accounts: "Compte" };

function AuditPanel() {
  const audit = useQuery({ queryKey: ["acc", "audit"], queryFn: async () => {
    const { data, error } = await db.from("accounting_audit").select("*").order("at", { ascending: false }).limit(200);
    if (error) throw error; return (data ?? []) as any[];
  } });
  const actors = useQuery({ queryKey: ["acc", "audit-actors", (audit.data ?? []).length], enabled: !!audit.data?.length, queryFn: async () => {
    const ids = Array.from(new Set((audit.data ?? []).map((a) => a.actor).filter(Boolean)));
    const { data } = await db.from("profiles").select("id, full_name").in("id", ids);
    return new Map<string, string>((data ?? []).map((p: any) => [p.id, p.full_name]));
  } });
  return (
    <Card><CardHeader><CardTitle className="text-base">Historique des opérations comptables (200 dernières)</CardTitle></CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Opération</TableHead><TableHead>Objet</TableHead><TableHead>Détail</TableHead><TableHead>Par</TableHead></TableRow></TableHeader>
          <TableBody>
            {(audit.data ?? []).map((a) => {
              const row = a.new_row ?? a.old_row ?? {};
              return (
                <TableRow key={a.id}>
                  <TableCell>{new Date(a.at).toLocaleString("fr-FR")}</TableCell>
                  <TableCell><Badge variant={a.action === "VOID" || a.action === "DELETE" ? "destructive" : "outline"}>{ACTION_LABEL[a.action] ?? a.action}</Badge></TableCell>
                  <TableCell>{TABLE_LABEL[a.table_name] ?? a.table_name}</TableCell>
                  <TableCell className="max-w-md truncate">{row.name ?? row.description ?? ""}{row.amount ? ` — ${fmt(Number(row.amount))} GNF` : ""}{a.action === "VOID" && row.void_reason ? ` — motif : ${row.void_reason}` : ""}</TableCell>
                  <TableCell>{actors.data?.get(a.actor) ?? (a.actor ? "—" : "Système")}</TableCell>
                </TableRow>
              );
            })}
            {!(audit.data ?? []).length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Aucune opération enregistrée.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Budget prévisionnel par catégorie et par année scolaire, comparé au réalisé (écritures non annulées). */
function BudgetPanel() {
  const qc = useQueryClient();
  const [year, setYear] = useState(getCurrentAcademicYear());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["acc", "budget", year], queryFn: async () => {
    const { data, error } = await db.rpc("accounting_budget_status", { _year: year }); if (error) throw error;
    return (data ?? []) as Array<{ category_id: string; kind: "recette" | "depense"; code: string; label: string; budget: number; actual: number }>;
  } });
  const rows = q.data ?? [];
  const dirty = Object.keys(edits).filter((id) => Number(edits[id] || 0) !== Number(rows.find((r) => r.category_id === id)?.budget ?? 0));
  async function save() {
    for (const id of dirty) { const n = Number(edits[id] || 0); if (!(n >= 0) || !Number.isFinite(n)) return void toast.error("Montant de budget invalide."); }
    setBusy(true);
    const { data: me } = await db.rpc("current_school_id");
    const payload = dirty.map((id) => ({ school_id: me, academic_year: year, category_id: id, amount: Number(edits[id] || 0) }));
    const { error } = await db.from("accounting_budgets").upsert(payload, { onConflict: "school_id,academic_year,category_id" });
    setBusy(false);
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success("Budget enregistré"); setEdits({}); void qc.invalidateQueries({ queryKey: ["acc", "budget"] });
  }
  const section = (kind: "recette" | "depense", title: string) => {
    const list = rows.filter((r) => r.kind === kind);
    const tb = list.reduce((s, r) => s + Number(r.budget), 0), ta = list.reduce((s, r) => s + Number(r.actual), 0);
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">{title} <span className="ml-2 text-sm font-normal text-muted-foreground">Prévu {fmt(tb)} · Réalisé {fmt(ta)} GNF</span></CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Catégorie</TableHead><TableHead className="w-44 text-right">Budget (GNF)</TableHead><TableHead className="text-right">Réalisé</TableHead><TableHead className="w-48">Avancement</TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map((r) => {
                const budget = Number(edits[r.category_id] ?? r.budget);
                const p = budgetProgress(budget, Number(r.actual), kind === "recette" ? "revenue" : "expense");
                const color = p.state === "over" ? "bg-destructive" : p.state === "warn" ? "bg-amber-500" : "bg-primary";
                return (
                  <TableRow key={r.category_id}>
                    <TableCell>{categoryLabel(r)}</TableCell>
                    <TableCell className="text-right"><Input type="number" min={0} className="h-8 text-right" value={edits[r.category_id] ?? String(r.budget)} onChange={(e) => setEdits({ ...edits, [r.category_id]: e.target.value })} /></TableCell>
                    <TableCell className="text-right">{fmt(Number(r.actual))}</TableCell>
                    <TableCell>
                      {p.percent === null ? <span className="text-xs text-muted-foreground">Pas de budget</span> : (
                        <div><div className="h-2 w-full rounded bg-muted"><div className={"h-2 rounded " + color} style={{ width: Math.min(100, p.percent) + "%" }} /></div>
                          <span className={"text-xs " + (p.state === "over" ? "text-destructive" : "text-muted-foreground")}>{p.percent} %{p.state === "over" ? " — dépassé" : p.state === "warn" ? " — bientôt atteint" : ""}</span></div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!q.isLoading && list.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Aucune catégorie.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><Label>Année scolaire</Label>
          <Select value={year} onValueChange={(v) => { setYear(v); setEdits({}); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{getAcademicYearOptions().map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Button onClick={save} disabled={busy || dirty.length === 0}>Enregistrer le budget{dirty.length ? ` (${dirty.length})` : ""}</Button>
        <p className="text-xs text-muted-foreground">Saisissez ce que vous prévoyez de recevoir ou de dépenser. Le « réalisé » se met à jour tout seul à chaque écriture.</p>
      </div>
      {section("recette", "Recettes prévues")}
      {section("depense", "Dépenses prévues")}
    </div>
  );
}

/** Plan comptable : catégories de recettes et de dépenses proposées aux comptables. */
function CategoriesPanel({ categories, onChanged }: { categories: AccountingCategory[]; onChanged: () => void }) {
  const [form, setForm] = useState({ kind: "depense" as "recette" | "depense", code: "", label: "" });
  const [busy, setBusy] = useState(false);
  const codes = categories.filter((c) => c.kind === form.kind).map((c) => c.code);
  async function add() {
    const err = validateCategoryInput(form.code, form.label, codes);
    if (err) return void toast.error(err);
    setBusy(true);
    const { error } = await db.from("accounting_categories").insert({ kind: form.kind, code: form.code.trim(), label: form.label.trim(), sort_order: 1000 });
    setBusy(false);
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success("Catégorie ajoutée"); setForm({ ...form, code: "", label: "" }); onChanged();
  }
  async function toggle(c: AccountingCategory) {
    const { error } = await db.from("accounting_categories").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) return void toast.error(accountingErrorMessage(error.message));
    onChanged();
  }
  async function rename(c: AccountingCategory) {
    const label = window.prompt("Nouveau libellé", c.label)?.trim();
    if (!label || label === c.label) return;
    if (label.length < 2 || label.length > 120) return void toast.error("Le libellé doit faire entre 2 et 120 caractères.");
    const { error } = await db.from("accounting_categories").update({ label }).eq("id", c.id);
    if (error) return void toast.error(accountingErrorMessage(error.message));
    onChanged();
  }
  async function restore() {
    const { error } = await db.rpc("restore_default_accounting_categories");
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success("Catégories par défaut restaurées"); onChanged();
  }
  const list = (kind: "recette" | "depense", title: string) => (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Catégorie</TableHead><TableHead>Origine</TableHead><TableHead className="text-right" /></TableRow></TableHeader>
          <TableBody>
            {categories.filter((c) => c.kind === kind).sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)).map((c) => (
              <TableRow key={c.id} className={c.is_active ? "" : "opacity-50"}>
                <TableCell>{categoryLabel(c)}</TableCell>
                <TableCell><Badge variant="outline">{c.is_system ? "Standard" : "Personnalisée"}</Badge>{!c.is_active && <Badge variant="secondary" className="ml-1">Désactivée</Badge>}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {!c.is_system && <Button size="sm" variant="ghost" onClick={() => rename(c)}>Renommer</Button>}
                  <Button size="sm" variant="ghost" onClick={() => toggle(c)}>{c.is_active ? "Désactiver" : "Réactiver"}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
  return (
    <div className="space-y-4">
      <Card><CardContent className="flex flex-wrap items-end gap-3 p-4">
        <div><Label>Type</Label>
          <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as "recette" | "depense" })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="recette">Recette</SelectItem><SelectItem value="depense">Dépense</SelectItem></SelectContent>
          </Select>
        </div>
        <div><Label>Code</Label><Input className="w-28" value={form.code} maxLength={12} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ex. 7090" /></div>
        <div className="min-w-56 flex-1"><Label>Libellé</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="ex. Location de salle" /></div>
        <Button onClick={add} disabled={busy} className="gap-2"><Plus className="size-4" />Ajouter</Button>
        <Button variant="outline" onClick={restore}>Restaurer les catégories par défaut</Button>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Les catégories standard ne peuvent pas être supprimées : désactivez celles dont vous n'avez pas besoin, elles disparaîtront des listes de saisie sans toucher à l'historique.</p>
      {list("recette", "Catégories de recettes")}
      {list("depense", "Catégories de dépenses")}
    </div>
  );
}


/** Clôture de période : plus aucune écriture (création, modification, annulation) jusqu'à la date clôturée. */
function ClosureCard({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data: closedUntil } = useQuery({
    queryKey: ["acc", "closure"],
    queryFn: async () => {
      const { data, error } = await db.from("accounting_settings").select("closed_until").maybeSingle();
      if (error) throw error;
      return (data?.closed_until ?? null) as string | null;
    },
  });
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState(today());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(value: string | null) {
    if (busy) return;
    setBusy(true);
    const { error } = await db.rpc("set_accounting_closure", { _until: value, _note: note.trim() || null });
    setBusy(false);
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success(value ? `Période clôturée jusqu'au ${dateFr(value)}.` : "Clôture levée.");
    setOpen(false); setNote("");
    void qc.invalidateQueries({ queryKey: ["acc"] });
    onDone();
  }
  return (
    <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="text-sm">
        {closedUntil
          ? <><Badge variant="secondary" className="mr-2">Clôturée</Badge>Période clôturée jusqu'au <b>{dateFr(closedUntil)}</b> : aucune écriture ne peut plus y être créée, modifiée ou annulée.</>
          : <span className="text-muted-foreground">Aucune période clôturée. Clôturez les mois terminés pour figer vos comptes.</span>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="outline" size="sm">{closedUntil ? "Modifier la clôture" : "Clôturer une période"}</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clôture de période</DialogTitle>
            <DialogDescription>Les écritures datées jusqu'à cette date (incluse) seront figées. Avancer la clôture est libre ; la reculer (rouvrir) est réservé à la direction et demande un motif.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Clôturer jusqu'au (inclus)</Label><Input type="date" max={today()} value={until} onChange={(e) => setUntil(e.target.value)} /></div>
            <div><Label>Motif (obligatoire pour rouvrir)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. Correction d'une erreur de saisie" /></div>
          </div>
          <DialogFooter className="gap-2">
            {closedUntil && <Button variant="outline" disabled={busy} onClick={() => void save(null)}>Lever la clôture</Button>}
            <Button disabled={busy || !until} onClick={() => void save(until)}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
}


/** Comptabilisation automatique : chaque paiement élève validé / salaire payé est enregistré seul sur le compte choisi. */
function AutoPostCard({ accounts, onDone }: { accounts: any[]; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: current } = useQuery({
    queryKey: ["acc", "auto-post"],
    queryFn: async () => {
      const { data, error } = await db.from("accounting_settings").select("auto_post_account_id").maybeSingle();
      if (error) throw error;
      return (data?.auto_post_account_id ?? null) as string | null;
    },
  });
  const [busy, setBusy] = useState(false);
  async function save(id: string | null) {
    if (busy) return;
    setBusy(true);
    const { error } = await db.rpc("set_accounting_auto_post", { _account_id: id });
    setBusy(false);
    if (error) return void toast.error(accountingErrorMessage(error.message));
    toast.success(id ? "Comptabilisation automatique activée." : "Comptabilisation automatique désactivée.");
    void qc.invalidateQueries({ queryKey: ["acc"] });
    onDone();
  }
  return (
    <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-[2fr_1fr] sm:items-end">
      <div className="space-y-1.5">
        <Label>Comptabilisation automatique</Label>
        <Select value={current ?? "none"} onValueChange={(v) => void save(v === "none" ? null : v)} disabled={busy}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Désactivée (comptabiliser à la main)</SelectItem>
            {accounts.map((a: any) => <SelectItem key={a.account_id} value={a.account_id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">Les paiements validés et salaires payés à partir de maintenant sont enregistrés seuls sur ce compte. Les anciens restent à comptabiliser ci-dessous. Si l'écriture est impossible (période clôturée, compte archivé), ils restent ici.</p>
    </CardContent></Card>
  );
}
