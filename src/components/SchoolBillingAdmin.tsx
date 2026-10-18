import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Save, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/audit";
import { useBillingConfig, BILLING_CONFIG_KEY } from "@/hooks/useBillingPlans";
import {
  BILLING_CYCLE_LABELS, BILLING_FIELD_LABELS, BILLING_STATUS_LABELS, billingErrorMessage, computeBilling, formatBillingGNF,
  isValidFreeMonths, planRanges, validateBillingConfig, type BillingCycle, type BillingPlan,
} from "@/lib/billing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const db = supabase as any;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString("fr-FR") : "—");
const ADMIN_KEY = ["school-billing-admin"];

/** Onglet Super Admin « Forfaits établissement » : configuration, paiements à valider, historique. */
export function SchoolBillingAdmin() {
  const qc = useQueryClient();
  const refresh = () => { void qc.invalidateQueries({ queryKey: ADMIN_KEY }); void qc.invalidateQueries({ queryKey: BILLING_CONFIG_KEY }); };

  const payments = useQuery({
    queryKey: [...ADMIN_KEY, "payments"], staleTime: 10_000,
    queryFn: async () => { const { data, error } = await db.from("school_billing_payments").select("*").order("created_at", { ascending: false }).limit(500); if (error) throw error; return data ?? []; },
  });
  const schools = useQuery({
    queryKey: [...ADMIN_KEY, "schools"], staleTime: 60_000,
    queryFn: async () => { const { data, error } = await db.from("schools").select("id,name"); if (error) throw error; return data ?? []; },
  });
  const history = useQuery({
    queryKey: [...ADMIN_KEY, "history"], staleTime: 10_000,
    queryFn: async () => { const { data, error } = await db.from("billing_plan_history").select("*").order("changed_at", { ascending: false }).limit(200); if (error) throw error; return data ?? []; },
  });
  const schoolName = useMemo(() => new Map<string, string>(((schools.data ?? []) as any[]).map((s) => [s.id, s.name])), [schools.data]);
  const pending = ((payments.data ?? []) as any[]).filter((p) => p.status === "PENDING");

  return (
    <div className="space-y-6">
      <ConfigEditor onDone={refresh} />
      <PendingBilling pending={pending} schoolName={schoolName} onDone={refresh} />
      <BillingHistory history={(history.data ?? []) as any[]} payments={(payments.data ?? []) as any[]} schoolName={schoolName} />
    </div>
  );
}

/* ------------------------------ Configuration des forfaits ------------------------------ */
function ConfigEditor({ onDone }: { onDone: () => void }) {
  const cfg = useBillingConfig();
  const [rows, setRows] = useState<Array<{ code: string; name: string; price: string; max: string; active: boolean }>>([]);
  const [free, setFree] = useState("2");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Charge les valeurs en vigueur ; ne remplace pas une saisie en cours.
  useEffect(() => {
    if (!cfg.loaded || dirty) return;
    setRows(cfg.plans.map((p) => ({ code: p.code, name: p.name, price: String(p.monthly_price), max: String(p.max_students), active: p.is_active })));
    setFree(String(cfg.freeMonths));
  }, [cfg.loaded, cfg.plans, cfg.freeMonths, dirty]);

  const edit = (code: string, patch: Partial<{ price: string; max: string; active: boolean }>) => { setDirty(true); setRows((rs) => rs.map((r) => (r.code === code ? { ...r, ...patch } : r))); };

  const error = useMemo(() => validateBillingConfig({
    plans: rows.map((r) => ({ code: r.code, monthly_price: r.price, max_students: r.max, is_active: r.active })),
    free_months: free,
  }), [rows, free]);

  // Aperçu en direct, calculé avec la même formule que le serveur.
  const preview = useMemo(() => {
    if (error) return null;
    const plans: BillingPlan[] = rows.map((r, i) => ({ code: r.code, name: r.name, monthly_price: Number(r.price), max_students: Number(r.max), is_active: r.active, sort_order: i + 1 }));
    const f = Number(free);
    return planRanges(plans).map(({ plan, min, max }) => ({
      plan, min, max, monthly: computeBilling(plan.monthly_price, "monthly", f), yearly: computeBilling(plan.monthly_price, "yearly", f),
    }));
  }, [rows, free, error]);

  async function save() {
    if (error) return toast.error(error);
    setSaving(true);
    const { error: e } = await db.rpc("save_billing_config", {
      _plans: rows.map((r) => ({ code: r.code, monthly_price: Number(r.price), max_students: Number(r.max), is_active: r.active })),
      _free_months: Number(free),
    });
    setSaving(false);
    if (e) return toast.error(billingErrorMessage(e.message));
    void logActivity({ action: "update", entity_type: "billing_plans", entity_label: "Forfaits établissement", metadata: { plans: rows.map((r) => ({ code: r.code, price: Number(r.price), max: Number(r.max), active: r.active })), free_months: Number(free) } });
    setDirty(false);
    toast.success("Forfaits enregistrés. Les nouveaux tarifs s'appliquent aux prochaines déclarations de paiement ; les paiements déjà déclarés ou validés ne changent pas.");
    onDone();
  }

  if (cfg.isLoading) return <Card><CardContent className="py-10 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></CardContent></Card>;
  if (!cfg.loaded) return <Card><CardContent className="py-6 text-sm text-destructive">Impossible de lire la configuration des forfaits. Vérifiez que la migration « school_billing_plans » est appliquée.</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forfaits des établissements</CardTitle>
        <CardDescription>
          Deux forfaits selon l'effectif réel de l'établissement (élèves actifs). Le minimum d'un forfait est toujours le maximum du forfait actif précédent + 1 : les plages ne se chevauchent jamais.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((r, i) => (
            <div key={r.code} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{r.name} <span className="text-xs font-normal text-muted-foreground">({r.code})</span></div>
                <label className="flex items-center gap-2 text-sm"><Switch checked={r.active} onCheckedChange={(v) => edit(r.code, { active: v })} /> {r.active ? "Actif" : "Désactivé"}</label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor={`bp-${r.code}`}>Prix mensuel (GNF)</Label><Input id={`bp-${r.code}`} inputMode="numeric" value={r.price} onChange={(e) => edit(r.code, { price: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor={`bm-${r.code}`}>Effectif maximal (élèves)</Label><Input id={`bm-${r.code}`} inputMode="numeric" value={r.max} onChange={(e) => edit(r.code, { max: e.target.value })} /></div>
              </div>
              {i === 0 && <p className="text-xs text-muted-foreground">Un forfait désactivé n'est plus proposé ; son historique et les abonnements en cours sont conservés.</p>}
            </div>
          ))}
        </div>

        <div className="rounded-xl border p-4 max-w-md space-y-1">
          <Label htmlFor="bfree">Réduction annuelle (mois offerts, de 0 à 12)</Label>
          <Input id="bfree" inputMode="numeric" value={free} onChange={(e) => { setDirty(true); setFree(e.target.value); }} />
          <p className="text-xs text-muted-foreground">Paiement annuel = prix mensuel × (12 − {isValidFreeMonths(Number(free)) && free.trim() !== "" ? Number(free) : "…"}).</p>
        </div>

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : preview && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Forfait</TableHead><TableHead>Effectif couvert</TableHead><TableHead className="text-right">Mensuel</TableHead>
                <TableHead className="text-right">Annuel brut (×12)</TableHead><TableHead className="text-right">Réduction</TableHead><TableHead className="text-right">Annuel à payer</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {preview.map(({ plan, min, max, monthly, yearly }) => (
                  <TableRow key={plan.code}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>{min.toLocaleString("fr-FR")} à {max.toLocaleString("fr-FR")}</TableCell>
                    <TableCell className="text-right">{formatBillingGNF(monthly.amount)}</TableCell>
                    <TableCell className="text-right">{formatBillingGNF(yearly.gross)}</TableCell>
                    <TableCell className="text-right">− {formatBillingGNF(yearly.discount)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatBillingGNF(yearly.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={saving || !!error || !dirty}>{saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />} Enregistrer</Button>
          {dirty && <Button variant="outline" disabled={saving} onClick={() => setDirty(false)}>Annuler les modifications</Button>}
          <p className="text-xs text-muted-foreground">Nouveaux tarifs : appliqués aux nouvelles déclarations et aux renouvellements. Paiements validés et abonnements en cours : jamais modifiés.</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Paiements d'établissement à valider ------------------------------ */
function PendingBilling({ pending, schoolName, onDone }: { pending: any[]; schoolName: Map<string, string>; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<any | null>(null);
  const [refuse, setRefuse] = useState<any | null>(null);
  const [reason, setReason] = useState("");

  async function decide(p: any, approve: boolean, why?: string) {
    setBusy(p.id);
    const { error } = await db.rpc("review_school_billing_payment", { _payment_id: p.id, _approve: approve, _reason: why ?? null });
    setBusy(null);
    if (error) return toast.error(billingErrorMessage(error.message));
    void logActivity({ action: approve ? "payment.validate" : "payment.refuse", entity_type: "school_billing_payment", entity_id: p.id, metadata: { reference: p.reference, amount: p.amount, reason: why ?? null } });
    toast.success(approve ? "Paiement validé : période d'abonnement activée ou renouvelée." : "Paiement refusé : motif enregistré.");
    setConfirm(null); setRefuse(null); setReason("");
    onDone();
  }

  return (
    <Card>
      <CardHeader><CardTitle>Paiements de forfaits à valider</CardTitle><CardDescription>Vérifiez la référence et le montant (calculé par le serveur) avant de valider. Une confirmation Mobile Money ne remplace pas votre décision.</CardDescription></CardHeader>
      <CardContent>
        {pending.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Aucun paiement de forfait en attente.</p> : (
          <div className="overflow-x-auto"><Table><TableHeader><TableRow>
            <TableHead>Établissement</TableHead><TableHead>Forfait</TableHead><TableHead>Montant</TableHead><TableHead>Référence / téléphone</TableHead><TableHead>Déclaré le</TableHead><TableHead className="text-right">Décision</TableHead>
          </TableRow></TableHeader><TableBody>
            {pending.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{schoolName.get(p.school_id) ?? "—"}<div className="text-xs text-muted-foreground">{Number(p.students_count).toLocaleString("fr-FR")} élèves</div></TableCell>
                <TableCell>{p.plan_name}<div className="text-xs text-muted-foreground">{BILLING_CYCLE_LABELS[p.billing_cycle as BillingCycle] ?? p.billing_cycle}</div></TableCell>
                <TableCell>{formatBillingGNF(Number(p.amount))}{Number(p.discount_amount) > 0 && <div className="text-xs text-muted-foreground">Brut {formatBillingGNF(Number(p.gross_amount))} − réduction {formatBillingGNF(Number(p.discount_amount))}</div>}</TableCell>
                <TableCell>{p.reference}<div className="text-xs text-muted-foreground">{p.payer_phone ?? "—"}</div></TableCell>
                <TableCell className="text-xs">{fmtDate(p.declared_at)}</TableCell>
                <TableCell className="text-right"><div className="flex justify-end gap-2">
                  <Button size="sm" disabled={busy === p.id} onClick={() => setConfirm(p)}><CheckCircle2 className="size-4 mr-1" /> Accepter</Button>
                  <Button size="sm" variant="outline" disabled={busy === p.id} onClick={() => setRefuse(p)}><XCircle className="size-4 mr-1" /> Refuser</Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody></Table></div>
        )}
      </CardContent>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}><AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Valider ce paiement de forfait ?</AlertDialogTitle><AlertDialogDescription>
          {confirm && <>Référence <b>{confirm.reference}</b> · {schoolName.get(confirm.school_id) ?? "—"} · {confirm.plan_name} ({BILLING_CYCLE_LABELS[confirm.billing_cycle as BillingCycle]}) · <b>{formatBillingGNF(Number(confirm.amount))}</b>. La période d'abonnement sera activée ou prolongée.</>}
        </AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); if (confirm) void decide(confirm, true); }}>Valider</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent></AlertDialog>

      <Dialog open={!!refuse} onOpenChange={(o) => { if (!o) { setRefuse(null); setReason(""); } }}><DialogContent>
        <DialogHeader><DialogTitle>Refuser ce paiement</DialogTitle><DialogDescription>Le motif est obligatoire : il est conservé et visible par l'établissement.</DialogDescription></DialogHeader>
        <Textarea rows={4} placeholder="Motif du refus" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter><Button variant="outline" onClick={() => setRefuse(null)}>Annuler</Button><Button variant="destructive" disabled={!reason.trim() || !!busy} onClick={() => refuse && void decide(refuse, false, reason.trim())}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Refuser le paiement"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </Card>
  );
}

/* ------------------------------ Historique ------------------------------ */
function BillingHistory({ history, payments, schoolName }: { history: any[]; payments: any[]; schoolName: Map<string, string> }) {
  const fmtVal = (field: string, v: string | null) => {
    if (v == null) return "—";
    if (field === "monthly_price") return formatBillingGNF(Number(v));
    if (field === "is_active") return v === "true" ? "Actif" : "Désactivé";
    if (field === "annual_free_months") return `${v} mois`;
    return Number(v).toLocaleString("fr-FR");
  };
  const done = payments.filter((p) => p.status !== "PENDING").slice(0, 50);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Historique des changements de tarifs</CardTitle><CardDescription>Date, auteur, ancienne et nouvelle valeur.</CardDescription></CardHeader>
        <CardContent>
          {history.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Aucun changement enregistré.</p> : (
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Par</TableHead><TableHead>Paramètre</TableHead><TableHead>Avant</TableHead><TableHead>Après</TableHead></TableRow></TableHeader><TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="text-xs">{fmtDate(h.changed_at)}</TableCell>
                  <TableCell className="text-xs">{h.changed_by_email ?? "—"}</TableCell>
                  <TableCell className="text-sm">{h.plan_code ? `${h.plan_code} · ` : ""}{BILLING_FIELD_LABELS[h.field] ?? h.field}</TableCell>
                  <TableCell>{fmtVal(h.field, h.old_value)}</TableCell>
                  <TableCell className="font-medium">{fmtVal(h.field, h.new_value)}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table></div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Paiements de forfaits traités</CardTitle><CardDescription>Les montants sont figés à la déclaration.</CardDescription></CardHeader>
        <CardContent>
          {done.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Aucun paiement traité.</p> : (
            <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Établissement</TableHead><TableHead>Forfait</TableHead><TableHead>Montant</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader><TableBody>
              {done.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{schoolName.get(p.school_id) ?? "—"}<div className="text-xs text-muted-foreground">{fmtDate(p.validated_at ?? p.declared_at)}</div></TableCell>
                  <TableCell>{p.plan_name}<div className="text-xs text-muted-foreground">{BILLING_CYCLE_LABELS[p.billing_cycle as BillingCycle] ?? p.billing_cycle}</div></TableCell>
                  <TableCell>{formatBillingGNF(Number(p.amount))}</TableCell>
                  <TableCell><Badge variant={p.status === "VALIDATED" ? "default" : "destructive"}>{BILLING_STATUS_LABELS[p.status] ?? p.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody></Table></div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
