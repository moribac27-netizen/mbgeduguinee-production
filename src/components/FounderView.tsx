import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import * as XLSX from "xlsx";
import { Loader2, Lock, Printer, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPublicGNF } from "@/lib/public-offers";
import { formatDateFr } from "@/lib/flat-offers";
import { printWhenReady } from "@/lib/print-ready";
import {
  currentMonthConakry, fetchFounderOverview, fetchMyFounder, founderErrorMessage, logFounderExport, monthBounds, shiftMonth,
  type FounderOverview,
} from "@/lib/founder";

const PHASE: Record<string, string> = { trial: "Essai", active: "À jour", unpaid: "En retard", overdue: "Suspendue", none: "Sans forfait" };

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-xl border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div>{hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}</div>;
}

function Variation({ now, before }: { now: number; before: number }) {
  if (!before) return null;
  const pct = Math.round(((now - before) * 1000) / before) / 10;
  return <span className={pct >= 0 ? "text-emerald-700" : "text-red-700"}>{pct >= 0 ? "+" : ""}{pct} % vs période précédente</span>;
}

/** Vue Fondateur : consultation seule. Toutes les données viennent des fonctions SQL founder_overview (agrégats, aucune ligne individuelle). */
export function FounderView() {
  const me = useQuery({ queryKey: ["founder", "me"], retry: false, queryFn: fetchMyFounder });
  const schools = me.data?.schools ?? [];
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [month, setMonth] = useState(currentMonthConakry());
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    if (!schoolId && schools.length > 0) setSchoolId((me.data?.active_school_id && schools.some((s) => s.school_id === me.data!.active_school_id) ? me.data!.active_school_id : schools[0].school_id) as string);
  }, [schools, schoolId, me.data?.active_school_id]);

  const { from, to } = custom ?? monthBounds(month);
  const ov = useQuery({
    queryKey: ["founder", "overview", schoolId, from, to], enabled: !!schoolId, retry: false, staleTime: 60_000,
    queryFn: () => fetchFounderOverview(schoolId as string, from, to),
  });

  if (me.isLoading) return <div className="h-64 animate-pulse bg-muted rounded-xl" />;
  if (me.error) return <div className="p-6 text-sm text-red-700">Impossible de charger vos établissements. Réessayez.</div>;
  if (schools.length === 0) return <div className="p-6"><Card><CardHeader><CardTitle>Aucun établissement rattaché</CardTitle><CardDescription>Votre compte n'est lié à aucun établissement. Contactez l'administrateur de la plateforme.</CardDescription></CardHeader></Card></div>;

  const d = ov.data;

  async function exportXlsx(o: FounderOverview) {
    try {
      await logFounderExport(o.school.id, "xlsx", from, to);
    } catch { toast.error("Export refusé : la journalisation a échoué."); return; }
    const rows: Array<[string, string | number | null]> = [
      ["Établissement", o.school.name], ["Période", `${from} → ${to}`], ["Généré le", o.generated_at],
      ["Élèves actifs", o.headline?.students ?? null], ["Encaissements", o.headline?.collections ?? null], ["Dépenses", o.finance?.expense ?? null], ["Résultat", o.finance?.result ?? null],
      ["Impayés scolarité (montant)", o.headline?.unpaid_amount ?? null], ["Familles en retard", o.headline?.unpaid_families ?? null], ["Trésorerie", o.headline?.treasury_total ?? null],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Synthèse");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(o.finance?.months ?? []), "Evolution");
    XLSX.writeFile(wb, `vue-fondateur-${from}-${to}.xlsx`);
  }
  async function exportPdf(o: FounderOverview) {
    try { await logFounderExport(o.school.id, "pdf", from, to); } catch { toast.error("Export refusé : la journalisation a échoué."); return; }
    await printWhenReady();
  }

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in" id="founder-print">
      <style>{`@media print { body * { visibility: hidden } #founder-print, #founder-print * { visibility: visible } #founder-print { position: absolute; left: 0; top: 0; width: 100% } .no-print { display: none !important } }`}</style>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Vue Fondateur</h1>
          <p className="text-sm text-muted-foreground">Consultation seule · indicateurs agrégés · fuseau Conakry</p>
        </div>
        <div className="no-print flex flex-wrap items-end gap-2">
          {schools.length > 1 && (
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={schoolId ?? ""} onChange={(e) => setSchoolId(e.target.value)} aria-label="Établissement">
              {schools.map((s) => <option key={s.school_id} value={s.school_id}>{s.name}{s.suspended ? " (suspendu)" : ""}</option>)}
            </select>
          )}
          <Button variant="outline" size="sm" onClick={() => { setCustom(null); setMonth(shiftMonth(month, -1)); }}>←</Button>
          <Input type="month" className="w-40" value={custom ? "" : month} onChange={(e) => { if (e.target.value) { setCustom(null); setMonth(e.target.value); } }} />
          <Button variant="outline" size="sm" disabled={!custom && month >= currentMonthConakry()} onClick={() => { setCustom(null); setMonth(shiftMonth(month, 1)); }}>→</Button>
          <Input type="date" className="w-36" value={from} onChange={(e) => e.target.value && setCustom({ from: e.target.value, to: custom?.to ?? to })} aria-label="Du" />
          <Input type="date" className="w-36" value={to} onChange={(e) => e.target.value && setCustom({ from: custom?.from ?? from, to: e.target.value })} aria-label="Au" />
          {d && <><Button size="sm" variant="outline" onClick={() => void exportXlsx(d)}><FileSpreadsheet className="size-4 mr-1" />Excel</Button><Button size="sm" variant="outline" onClick={() => void exportPdf(d)}><Printer className="size-4 mr-1" />PDF</Button></>}
        </div>
      </div>

      {ov.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Chargement…</div>}
      {ov.error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{founderErrorMessage(ov.error)}</div>}

      {d && (
        <>
          <div className="text-sm text-muted-foreground">{d.school.name} · du {formatDateFr(d.period.from)} au {formatDateFr(d.period.to)} · généré le {new Date(d.generated_at).toLocaleString("fr-FR", { timeZone: "Africa/Conakry" })}</div>

          {d.suspended && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 flex gap-2"><Lock className="size-5 shrink-0" /><div><strong>Établissement suspendu.</strong> Seule la partie abonnement est consultable tant que le paiement n'est pas régularisé.</div></div>
          )}

          {!d.suspended && d.headline && d.finance && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Tile label="Élèves actifs" value={String(d.headline.students)} hint={d.headline.student_cap ? `Plafond de l'offre : ${d.headline.student_cap}` : undefined} />
                <Tile label="Encaissements" value={formatPublicGNF(d.headline.collections)} hint={d.headline.collections_variation_pct == null ? undefined : `${d.headline.collections_variation_pct >= 0 ? "+" : ""}${d.headline.collections_variation_pct} % vs période précédente`} />
                <Tile label="Impayés de scolarité" value={formatPublicGNF(d.headline.unpaid_amount ?? 0)} hint={`${d.headline.unpaid_families ?? 0} famille(s) concernée(s)`} />
                <Tile label="Trésorerie (comptes actifs)" value={formatPublicGNF(d.headline.treasury_total)} />
              </div>

              <Card>
                <CardHeader><CardTitle>Finances de la période</CardTitle><CardDescription>Écritures annulées exclues (même calcul que la Comptabilité).</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Tile label="Recettes" value={formatPublicGNF(d.finance.revenue)} hint={undefined} />
                    <Tile label="Dépenses" value={formatPublicGNF(d.finance.expense)} />
                    <Tile label="Résultat" value={formatPublicGNF(d.finance.result)} />
                  </div>
                  <div className="text-xs"><Variation now={d.finance.revenue} before={d.finance.previous.revenue} /></div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={d.finance.months}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)} M`} />
                        <Tooltip formatter={(v: any) => formatPublicGNF(Number(v))} />
                        <Bar dataKey="revenue" name="Recettes" fill="#2563eb" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="expense" name="Dépenses" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {d.recovery && (
                <Card>
                  <CardHeader><CardTitle>Recouvrement de la scolarité</CardTitle><CardDescription>Année {d.recovery.academic_year} · {d.recovery.basis}</CardDescription></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Tile label="Frais attendus" value={formatPublicGNF(d.recovery.fees_expected)} />
                      <Tile label="Frais encaissés" value={formatPublicGNF(d.recovery.fees_collected)} />
                      <Tile label="Reste à recouvrer" value={formatPublicGNF(d.recovery.amount_due)} hint={`${d.recovery.students_late} élève(s) · ${d.recovery.families_late} famille(s)`} />
                    </div>
                    {d.recovery.by_class.length > 0 && (
                      <Table><TableHeader><TableRow><TableHead>Classe (5 plus en retard)</TableHead><TableHead>Niveau</TableHead><TableHead className="text-right">Élèves</TableHead><TableHead className="text-right">Reste dû</TableHead></TableRow></TableHeader>
                        <TableBody>{d.recovery.by_class.map((c, i) => <TableRow key={i}><TableCell>{c.class ?? "—"}</TableCell><TableCell>{c.level ?? "—"}</TableCell><TableCell className="text-right">{c.students_late}</TableCell><TableCell className="text-right">{formatPublicGNF(c.amount_due)}</TableCell></TableRow>)}</TableBody></Table>
                    )}
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                {d.staff && (
                  <Card><CardHeader><CardTitle>Personnel</CardTitle><CardDescription>Totaux uniquement : aucun salaire individuel.</CardDescription></CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      <Tile label="Masse salariale (période)" value={formatPublicGNF(d.staff.payroll_total)} />
                      <Tile label="Bulletins de paie à régler" value={String(d.staff.payslips_unpaid)} />
                      <Tile label="Enseignants" value={String(d.staff.teachers)} />
                      <Tile label="Contrats du personnel actifs" value={String(d.staff.staff_contracts_active)} />
                    </CardContent></Card>
                )}
                {d.pedagogy && (
                  <Card><CardHeader><CardTitle>Présences par niveau</CardTitle><CardDescription>{d.pedagogy.attendance_rate_definition}. Les moyennes ne sont pas affichées ici (notes /10 en Primaire et /20 au Collège-Lycée ne se comparent pas).</CardDescription></CardHeader>
                    <CardContent>
                      <div className="mb-3 text-sm">Taux global : <strong>{d.pedagogy.attendance_rate == null ? "—" : `${d.pedagogy.attendance_rate} %`}</strong> ({d.pedagogy.attendance_records} présences enregistrées)</div>
                      <Table><TableHeader><TableRow><TableHead>Niveau</TableHead><TableHead className="text-right">Élèves</TableHead><TableHead className="text-right">Taux</TableHead></TableRow></TableHeader>
                        <TableBody>{d.pedagogy.by_level.length === 0 ? <TableRow><TableCell colSpan={3} className="text-muted-foreground">Aucune présence enregistrée sur la période.</TableCell></TableRow> : d.pedagogy.by_level.map((l) => <TableRow key={l.level}><TableCell>{l.level}</TableCell><TableCell className="text-right">{l.students}</TableCell><TableCell className="text-right">{l.attendance_rate == null ? "—" : `${l.attendance_rate} %`}</TableCell></TableRow>)}</TableBody></Table>
                    </CardContent></Card>
                )}
              </div>

              {d.alerts && d.alerts.voided_entries.count > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  {d.alerts.voided_entries.count} écriture(s) comptable(s) annulée(s) sur la période, pour {formatPublicGNF(d.alerts.voided_entries.amount)}.
                </div>
              )}
            </>
          )}

          <SubscriptionCard sub={d.subscription} />

          {d.unavailable && d.unavailable.length > 0 && !d.suspended && (
            <p className="text-xs text-muted-foreground">Non disponible : {d.unavailable.map((u) => u.reason).join(" · ")}.</p>
          )}
        </>
      )}
    </div>
  );
}

function SubscriptionCard({ sub }: { sub: Record<string, any> | null }) {
  if (!sub) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2">Abonnement {sub.phase && <Badge variant="outline">{PHASE[sub.phase] ?? sub.phase}</Badge>}</CardTitle>
        <CardDescription>{sub.available === false ? sub.reason : sub.offer_name ? `Formule ${sub.offer_name}` : undefined}{sub.note ? ` · ${sub.note}` : ""}</CardDescription></CardHeader>
      {sub.available !== false && sub.monthly_price != null && (
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Prix mensuel" value={formatPublicGNF(Number(sub.monthly_price))} />
          {sub.annual_commitment != null && <Tile label="Engagement annuel" value={formatPublicGNF(Number(sub.annual_commitment))} />}
          {sub.paid_amount != null && <Tile label="Déjà payé" value={formatPublicGNF(Number(sub.paid_amount))} />}
          {sub.balance != null && <Tile label="Solde restant" value={formatPublicGNF(Number(sub.balance))} />}
          {sub.overdue_amount != null && Number(sub.overdue_amount) > 0 && <Tile label="En retard" value={formatPublicGNF(Number(sub.overdue_amount))} />}
          {sub.next_due_date && <Tile label="Prochaine échéance" value={formatDateFr(sub.next_due_date)} hint={sub.next_installment_amount ? formatPublicGNF(Number(sub.next_installment_amount)) : undefined} />}
        </CardContent>
      )}
    </Card>
  );
}
