import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSchool } from "@/hooks/useSchool";
import { usePdfMeta } from "@/hooks/usePdfMeta";
import { useBillingConfig } from "@/hooks/useBillingPlans";
import { logActivity } from "@/lib/audit";
import { ORANGE_MONEY, orangeMoneyUssdLink } from "@/lib/orange-money";
import { BILLING_CYCLE_LABELS, BILLING_STATUS_LABELS, billingErrorMessage, formatBillingGNF, type BillingCycle } from "@/lib/billing";
import { printBillingReceipt } from "@/lib/billing-print";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/facturation")({
  head: () => ({ meta: [
    { title: "Forfait & facturation — MBGEduGuinée" },
    { name: "description", content: "Forfait de l'établissement selon l'effectif, paiement mensuel ou annuel avec réduction." },
  ] }),
  component: FacturationPage,
});

const db = supabase as any;
const day = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

function FacturationPage() {
  const { school } = useSchool();
  const schoolId = school?.id ?? null;
  const meta = usePdfMeta("Forfait & facturation");
  const cfg = useBillingConfig();
  const qc = useQueryClient();
  const [cycle, setCycle] = useState<BillingCycle>("yearly");
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Devis calculé par le SERVEUR (effectif réel + forfait applicable + réduction). Relu si la configuration change.
  const quotes = useQuery({
    queryKey: ["billing-quotes", schoolId, cfg.plans.map((p) => `${p.code}:${p.monthly_price}:${p.max_students}:${p.is_active}`).join("|"), cfg.freeMonths],
    enabled: !!schoolId && cfg.loaded,
    staleTime: 10_000,
    queryFn: async () => {
      const [m, y] = await Promise.all([
        db.rpc("billing_quote", { _school_id: schoolId, _cycle: "monthly" }),
        db.rpc("billing_quote", { _school_id: schoolId, _cycle: "yearly" }),
      ]);
      if (m.error) throw m.error;
      if (y.error) throw y.error;
      return { monthly: m.data as any, yearly: y.data as any };
    },
  });
  const sub = useQuery({
    queryKey: ["billing-subscription", schoolId], enabled: !!schoolId, staleTime: 10_000,
    queryFn: async () => { const { data, error } = await db.from("school_billing_subscriptions").select("*").eq("school_id", schoolId).maybeSingle(); if (error) throw error; return data; },
  });
  const payments = useQuery({
    queryKey: ["billing-payments", schoolId], enabled: !!schoolId, staleTime: 10_000,
    queryFn: async () => { const { data, error } = await db.from("school_billing_payments").select("*").eq("school_id", schoolId).order("created_at", { ascending: false }); if (error) throw error; return data ?? []; },
  });

  const rows = (payments.data ?? []) as any[];
  const hasPending = rows.some((p) => p.status === "PENDING");
  const quote = quotes.data ? (cycle === "yearly" ? quotes.data.yearly : quotes.data.monthly) : null;
  const active = sub.data && new Date(sub.data.period_end) > new Date();

  async function declare() {
    if (!schoolId || !quote) return;
    setSaving(true);
    const { data, error } = await db.rpc("declare_school_billing_payment", { _school_id: schoolId, _cycle: cycle, _reference: reference.trim(), _payer_phone: phone.trim() || null });
    setSaving(false);
    if (error) return toast.error(billingErrorMessage(error.message));
    void logActivity({ action: "create", entity_type: "school_billing_payment", entity_id: data?.id, metadata: { reference: reference.trim(), cycle, amount: data?.amount } });
    toast.success("Paiement déclaré : il sera vérifié et validé par l'administration de la plateforme.");
    setConfirm(false); setReference(""); setPhone("");
    void qc.invalidateQueries({ queryKey: ["billing-payments", schoolId] });
  }

  if (!schoolId) return <p className="text-muted-foreground">Aucun établissement associé à ce compte.</p>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2"><CreditCard className="size-7 text-primary" /> Forfait & facturation</h1>
        <p className="text-muted-foreground mt-1">Le forfait est déterminé par l'effectif réel de votre établissement. Les montants sont calculés par la plateforme.</p>
      </div>

      {active && (
        <Card><CardContent className="py-4 text-sm flex flex-wrap items-center gap-x-6 gap-y-1">
          <Badge>Abonnement actif</Badge>
          <span><b>{sub.data.plan_name}</b> · {BILLING_CYCLE_LABELS[sub.data.billing_cycle as BillingCycle]}</span>
          <span>Période : {day(sub.data.period_start)} au {day(sub.data.period_end)}</span>
        </CardContent></Card>
      )}

      <Card>
        <CardHeader><CardTitle>Choisir le mode de paiement</CardTitle><CardDescription>
          {quote ? <>Effectif actuel : <b>{Number(quote.students_count).toLocaleString("fr-FR")} élèves</b> · forfait applicable : <b>{quote.plan_name}</b>.</> : "Calcul de votre forfait…"}
        </CardDescription></CardHeader>
        <CardContent className="space-y-5">
          {quotes.isLoading && <Loader2 className="size-5 animate-spin" />}
          {quotes.error && <p className="text-sm text-destructive">{billingErrorMessage((quotes.error as any)?.message)}</p>}
          {quotes.data && (
            <div className="grid gap-4 sm:grid-cols-2">
              {(["monthly", "yearly"] as BillingCycle[]).map((c) => {
                const q = c === "yearly" ? quotes.data.yearly : quotes.data.monthly;
                const selected = cycle === c;
                return (
                  <button key={c} type="button" onClick={() => setCycle(c)} aria-pressed={selected}
                    className={`text-left rounded-xl border p-4 transition ${selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/50"}`}>
                    <div className="flex items-center justify-between"><span className="font-semibold">{BILLING_CYCLE_LABELS[c]}</span>
                      {c === "yearly" && Number(q.discount_amount) > 0 && <Badge variant="secondary">{q.free_months} mois offerts</Badge>}</div>
                    <div className="mt-2 text-2xl font-bold">{formatBillingGNF(Number(q.amount))}</div>
                    <div className="text-xs text-muted-foreground">{c === "yearly" ? "par an" : "par mois"}</div>
                  </button>
                );
              })}
            </div>
          )}

          {quote && (
            <div className="rounded-xl bg-muted/50 p-4 text-sm space-y-1" aria-label="Récapitulatif avant validation">
              <div className="flex justify-between"><span>Prix mensuel de référence</span><b>{formatBillingGNF(Number(quote.monthly_price))}</b></div>
              {cycle === "yearly" && <>
                <div className="flex justify-between"><span>Montant annuel brut (× 12)</span><b>{formatBillingGNF(Number(quote.gross_amount))}</b></div>
                <div className="flex justify-between"><span>Réduction accordée ({quote.free_months} mois offerts)</span><b>− {formatBillingGNF(Number(quote.discount_amount))}</b></div>
              </>}
              <div className="flex justify-between border-t pt-2 text-base"><span>Montant à payer</span><b>{formatBillingGNF(Number(quote.amount))}</b></div>
            </div>
          )}

          <div className="rounded-xl border p-4 space-y-3">
            <p className="text-sm">Payez par <b>{ORANGE_MONEY.label}</b> au <b>{ORANGE_MONEY.local}</b> (titulaire : {ORANGE_MONEY.holder}) — <a className="underline" href={orangeMoneyUssdLink()}>{ORANGE_MONEY.ussd}</a>. Saisissez ensuite la référence de la transaction.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="bref">Référence de transaction</Label><Input id="bref" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="bphone">Téléphone du payeur (facultatif)</Label><Input id="bphone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            </div>
            {hasPending && <p className="text-sm text-amber-700">Un paiement est déjà en attente de validation pour votre établissement.</p>}
            <Button disabled={!quote || !reference.trim() || hasPending || saving} onClick={() => setConfirm(true)}>Déclarer mon paiement</Button>
            <p className="text-xs text-muted-foreground">La référence n'est qu'une déclaration : le paiement n'est effectif qu'après vérification et validation par l'administration de la plateforme.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mes paiements de forfait</CardTitle></CardHeader>
        <CardContent>
          {rows.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Aucun paiement déclaré.</p> : (
            <div className="overflow-x-auto"><Table><TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Forfait</TableHead><TableHead>Montant</TableHead><TableHead>Référence</TableHead><TableHead>Statut</TableHead><TableHead />
            </TableRow></TableHeader><TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">{day(p.declared_at)}</TableCell>
                  <TableCell>{p.plan_name}<div className="text-xs text-muted-foreground">{BILLING_CYCLE_LABELS[p.billing_cycle as BillingCycle]} · {Number(p.students_count).toLocaleString("fr-FR")} élèves</div></TableCell>
                  <TableCell>{formatBillingGNF(Number(p.amount))}{Number(p.discount_amount) > 0 && <div className="text-xs text-muted-foreground">Brut {formatBillingGNF(Number(p.gross_amount))} − {formatBillingGNF(Number(p.discount_amount))}</div>}</TableCell>
                  <TableCell>{p.reference}</TableCell>
                  <TableCell><Badge variant={p.status === "VALIDATED" ? "default" : p.status === "REJECTED" ? "destructive" : "secondary"}>{BILLING_STATUS_LABELS[p.status] ?? p.status}</Badge>
                    {p.status === "REJECTED" && p.rejection_reason && <div className="text-xs text-muted-foreground mt-1">{p.rejection_reason}</div>}</TableCell>
                  <TableCell className="text-right">{p.status === "VALIDATED" && (
                    <Button size="sm" variant="outline" onClick={() => printBillingReceipt(meta, {
                      receiptNumber: p.receipt_number, planName: p.plan_name, cycle: p.billing_cycle, studentsCount: Number(p.students_count), monthlyPrice: Number(p.monthly_price),
                      grossAmount: Number(p.gross_amount), discountAmount: Number(p.discount_amount), amount: Number(p.amount), reference: p.reference,
                      validatedAt: p.validated_at, periodStart: p.period_start, periodEnd: p.period_end,
                    })}><Printer className="size-4 mr-1" /> Reçu</Button>
                  )}</TableCell>
                </TableRow>
              ))}
            </TableBody></Table></div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Confirmer la déclaration ?</AlertDialogTitle><AlertDialogDescription>
          {quote && <>{quote.plan_name} · {BILLING_CYCLE_LABELS[cycle]} · <b>{formatBillingGNF(Number(quote.amount))}</b>{cycle === "yearly" && <> (brut {formatBillingGNF(Number(quote.gross_amount))}, réduction {formatBillingGNF(Number(quote.discount_amount))})</>} · référence <b>{reference.trim()}</b>. Le montant définitif est recalculé par la plateforme.</>}
        </AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); void declare(); }}>{saving ? <Loader2 className="size-4 animate-spin" /> : "Confirmer"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent></AlertDialog>
    </div>
  );
}
