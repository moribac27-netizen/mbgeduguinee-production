import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Check, Sparkles, Smartphone, Copy, Loader2, Clock, XCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/audit";
import { PerStudentPlanOffer } from "@/components/PerStudentPlanOffer";
import { ORANGE_MONEY, orangeMoneyUssdLink, formatGNF } from "@/lib/orange-money";

type Plan = {
  id: string; code: string; name: string; description: string | null;
  price_monthly: number; price_yearly: number; currency: string;
  student_limit: number | null; features: string[]; is_popular: boolean;
};
type Sub = {
  id: string; plan_id: string; status: string;
  trial_ends_at: string | null; current_period_start: string; current_period_end: string;
  billing_cycle: string; payment_provider: string | null;
  discount_type: "percent" | "fixed" | null; discount_value: number | null;
  discount_reason: string | null; discount_expires_at: string | null;
  plan: Plan | null;
};
type PayRequest = {
  id: string; plan_id: string; billing_cycle: string; amount: number;
  status: string; transaction_id: string | null; payer_phone: string | null;
  rejection_reason: string | null; created_at: string;
  plan: { name: string } | null;
};

export const Route = createFileRoute("/_authenticated/souscription")({
  validateSearch: (s: Record<string, unknown>): { plan?: string; cycle?: "monthly" | "yearly" } => ({
    ...(s.plan ? { plan: String(s.plan) } : {}),
    ...(s.cycle === "yearly" || s.cycle === "monthly" ? { cycle: s.cycle } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Abonnement école — MBGEduGuinée" },
      { name: "description", content: "Souscrivez à une offre MBGEduGuinée et réglez votre abonnement par Orange Money en quelques minutes." },
      { property: "og:title", content: "Abonnement école — MBGEduGuinée" },
      { property: "og:description", content: "Choisissez votre offre et payez par Orange Money." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubscriptionPage,
});

function fmt(v: number) { return new Intl.NumberFormat("fr-FR").format(v); }
function fdate(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function SubscriptionPage() {
  const { plan: planParam, cycle: cycleParam } = useSearch({ from: "/_authenticated/souscription" });
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Sub | null>(null);
  const [requests, setRequests] = useState<PayRequest[]>([]);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "yearly">(cycleParam ?? "monthly");
  const [loading, setLoading] = useState(true);

  // Dialogue de paiement Orange Money
  const [payPlan, setPayPlan] = useState<Plan | null>(null);
  const [payerPhone, setPayerPhone] = useState("");
  const [payerName, setPayerName] = useState("");
  const [txId, setTxId] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setLoading(false); return; }
    setUserId(u.user.id);
    const { data: prof } = await supabase.from("profiles").select("school_id").eq("id", u.user.id).maybeSingle();
    if (!prof?.school_id) { setLoading(false); return; }
    setSchoolId(prof.school_id);

    const { data: pl } = await (supabase as any)
      .from("subscription_plans").select("*").eq("is_active", true).order("display_order");
    setPlans((pl ?? [])
      .filter((p: any) => p.billing_model !== "per_student")
      .map((p: any) => ({ ...p, features: Array.isArray(p.features) ? p.features : [] })));

    const { data: s } = await (supabase as any)
      .from("school_subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("school_id", prof.school_id).maybeSingle();
    if (s?.plan) s.plan.features = Array.isArray(s.plan.features) ? s.plan.features : [];
    setSub(s ?? null);
    if (!cycleParam && s?.billing_cycle) setCycle(s.billing_cycle);

    const { data: reqs } = await (supabase as any)
      .from("subscription_payment_requests")
      .select("*, plan:subscription_plans(name)")
      .eq("school_id", prof.school_id)
      .order("created_at", { ascending: false })
      .limit(10);
    setRequests(reqs ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const selectedFromParam = useMemo(
    () => plans.find((p) => p.code === planParam) ?? null,
    [plans, planParam],
  );

  const pending = requests.find((r) => r.status === "pending") ?? null;

  const activeDiscount = useMemo(() => {
    if (!sub?.discount_type || !sub.discount_value) return null;
    if (sub.discount_expires_at && new Date(sub.discount_expires_at) <= new Date()) return null;
    return { type: sub.discount_type, value: sub.discount_value, reason: sub.discount_reason, expiresAt: sub.discount_expires_at };
  }, [sub]);

  const rawAmount = payPlan ? (cycle === "yearly" ? payPlan.price_yearly : payPlan.price_monthly) : 0;
  const amount = useMemo(() => {
    if (!activeDiscount) return rawAmount;
    if (activeDiscount.type === "percent") return Math.max(rawAmount * (1 - activeDiscount.value / 100), 0);
    return Math.max(rawAmount - activeDiscount.value, 0);
  }, [rawAmount, activeDiscount]);

  function openPayment(plan: Plan) {
    setPayPlan(plan);
    setTxId("");
    setPayerPhone("");
    setPayerName("");
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copié");
    } catch { toast.error("Copie impossible"); }
  }

  async function submitRequest() {
    if (!schoolId || !payPlan || !userId) return;
    if (!txId.trim()) return toast.error("Saisissez l'identifiant de la transaction Orange Money.");
    setSaving(true);
    const { error } = await (supabase as any).from("subscription_payment_requests").insert({
      school_id: schoolId,
      plan_id: payPlan.id,
      billing_cycle: cycle,
      amount,
      currency: payPlan.currency || "GNF",
      provider: "orange_money",
      payer_phone: payerPhone.trim() || null,
      payer_name: payerName.trim() || null,
      transaction_id: txId.trim(),
      status: "pending",
      requested_by: userId,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Paiement déclaré. Votre abonnement sera activé après vérification.");
    logActivity({
      action: "create", entity_type: "subscription_payment_request",
      entity_id: payPlan.id, entity_label: payPlan.name, metadata: { cycle, amount },
    });
    setPayPlan(null);
    load();
    navigate({ to: "/souscription", search: {} });
  }

  const currentPlan = sub?.plan ?? null;
  const isTrial = sub?.status === "trial";

  return (
    <div className="space-y-8 max-w-6xl">
      <div>
        <h1 className="font-display text-3xl font-bold">Abonnement de l'école</h1>
        <p className="text-muted-foreground mt-1">
          Choisissez votre offre et réglez par Orange Money. L'activation est faite après vérification du paiement.
        </p>
      </div>

      {activeDiscount && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-sm">
          <p className="font-medium text-emerald-700 dark:text-emerald-400">
            Votre école bénéficie d'une remise de {activeDiscount.type === "percent" ? `${activeDiscount.value}%` : formatGNF(activeDiscount.value)} sur son abonnement.
          </p>
          {activeDiscount.reason && <p className="text-muted-foreground mt-0.5">{activeDiscount.reason}</p>}
          {activeDiscount.expiresAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Valable jusqu'au {new Date(activeDiscount.expiresAt).toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>
      )}

      {/* Abonnement actuel */}
      <Card>
        <CardHeader>
          <CardTitle>Abonnement actuel</CardTitle>
          <CardDescription>Détails et statut de votre offre en cours.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-24 animate-pulse bg-muted rounded" />
          ) : sub ? (
            <div className="grid sm:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Offre</div>
                <div className="font-display font-semibold text-lg">{currentPlan?.name ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Statut</div>
                <Badge variant={isTrial ? "secondary" : sub.status === "active" ? "default" : "outline"} className="mt-1 capitalize">
                  {isTrial && <Sparkles className="size-3 mr-1" />}
                  {sub.status}
                </Badge>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{isTrial ? "Fin de l'essai" : "Prochaine échéance"}</div>
                <div className="font-medium">{fdate(isTrial ? sub.trial_ends_at : sub.current_period_end)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Cycle</div>
                <div className="font-medium capitalize">{sub.billing_cycle === "yearly" ? "Annuel" : "Mensuel"}</div>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">Aucun abonnement actif.</div>
          )}
        </CardContent>
      </Card>

      <PerStudentPlanOffer schoolId={schoolId} currentPlanId={currentPlan?.id ?? null} onChanged={load} />

      {/* Coordonnées Orange Money */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-5 text-primary" /> Paiement par Orange Money
          </CardTitle>
          <CardDescription>Tous les abonnements se règlent sur ce compte Orange Money.</CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Numéro</div>
            <div className="font-mono font-semibold text-lg flex items-center gap-2">
              {ORANGE_MONEY.number}
              <Button size="icon" variant="ghost" onClick={() => copy(ORANGE_MONEY.number)} aria-label="Copier le numéro">
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Nom du bénéficiaire</div>
            <div className="font-semibold text-lg">{ORANGE_MONEY.holder}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Code de transfert</div>
            <div className="font-semibold text-lg">
              <a href={orangeMoneyUssdLink()} className="underline">{ORANGE_MONEY.ussd}</a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Demande en cours */}
      {pending && (
        <Card className="border-amber-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-amber-600" /> Paiement en attente de vérification
            </CardTitle>
            <CardDescription>
              {pending.plan?.name} · {pending.billing_cycle === "yearly" ? "Annuel" : "Mensuel"} · {formatGNF(pending.amount)} ·
              {" "}Transaction {pending.transaction_id ?? "—"}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Cycle */}
      <Card>
        <CardHeader>
          <CardTitle>Cycle de facturation</CardTitle>
          <CardDescription>Le montant à envoyer dépend du cycle choisi.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-xs">
          <Select value={cycle} onValueChange={(v: any) => setCycle(v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensuel</SelectItem>
              <SelectItem value="yearly">Annuel (2 mois offerts)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Offres */}
      <div>
        <h2 className="font-display text-2xl font-bold mb-4">Choisir une offre</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((p) => {
            const isCurrent = currentPlan?.id === p.id;
            const highlight = selectedFromParam?.id === p.id;
            return (
              <div key={p.id} className={"p-6 rounded-2xl border bg-card relative " + (p.is_popular ? "border-primary ring-1 ring-primary/20 " : "") + (highlight ? "ring-2 ring-accent " : "")}>
                {p.is_popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">Recommandé</div>}
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl font-bold">{p.name}</h3>
                  {isCurrent && <Badge>Offre actuelle</Badge>}
                </div>
                {p.description && <p className="text-sm text-muted-foreground mt-1">{p.description}</p>}
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{fmt(cycle === "yearly" ? p.price_yearly : p.price_monthly)}</span>
                  <span className="text-muted-foreground text-sm">{p.currency}/{cycle === "yearly" ? "an" : "mois"}</span>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2"><Check className="size-4 text-primary mt-0.5 shrink-0" />{f}</li>
                  ))}
                </ul>
                <Button
                  className="w-full mt-5"
                  variant={p.is_popular ? "default" : "outline"}
                  disabled={!!pending}
                  onClick={() => openPayment(p)}
                >
                  <Smartphone className="size-4 mr-2" />
                  {pending ? "Paiement en cours de vérification" : isCurrent && !isTrial ? "Renouveler par Orange Money" : "Payer par Orange Money"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Historique des demandes */}
      {requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Mes paiements déclarés</CardTitle>
            <CardDescription>Suivi des règlements Orange Money envoyés.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {requests.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b last:border-0 py-2 text-sm">
                <div>
                  <div className="font-medium">{r.plan?.name ?? "—"} · {r.billing_cycle === "yearly" ? "Annuel" : "Mensuel"}</div>
                  <div className="text-muted-foreground text-xs">
                    {fdate(r.created_at)} · Transaction {r.transaction_id ?? "—"}
                    {r.rejection_reason ? ` · Motif : ${r.rejection_reason}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{formatGNF(r.amount)}</span>
                  {r.status === "validated" ? (
                    <Badge className="gap-1"><CheckCircle2 className="size-3" /> Validé</Badge>
                  ) : r.status === "rejected" ? (
                    <Badge variant="destructive" className="gap-1"><XCircle className="size-3" /> Rejeté</Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1"><Clock className="size-3" /> En attente</Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Dialogue de paiement */}
      <Dialog open={!!payPlan} onOpenChange={(o) => !o && setPayPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payer l'offre {payPlan?.name}</DialogTitle>
            <DialogDescription>
              Envoyez {formatGNF(amount)} par Orange Money, puis déclarez la transaction ci-dessous.
            </DialogDescription>
          </DialogHeader>

          {activeDiscount && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm">
              <p className="font-medium text-emerald-700 dark:text-emerald-400">
                Remise appliquée : {activeDiscount.type === "percent" ? `${activeDiscount.value}%` : `${formatGNF(activeDiscount.value)}`}
                {" "}— tarif normal {formatGNF(rawAmount)}, à payer {formatGNF(amount)}.
              </p>
              {activeDiscount.reason && <p className="text-muted-foreground mt-0.5">{activeDiscount.reason}</p>}
              {activeDiscount.expiresAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Valable jusqu'au {new Date(activeDiscount.expiresAt).toLocaleDateString("fr-FR")}
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border bg-muted/40 p-4 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Numéro à créditer</span><span className="font-mono font-semibold">{ORANGE_MONEY.number}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Bénéficiaire</span><span className="font-semibold">{ORANGE_MONEY.holder}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Montant</span><span className="font-semibold">{formatGNF(amount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cycle</span><span className="font-semibold">{cycle === "yearly" ? "Annuel" : "Mensuel"}</span></div>
            <p className="text-xs text-muted-foreground pt-2">
              Composez <a href={orangeMoneyUssdLink()} className="underline font-medium">{ORANGE_MONEY.ussd}</a> → Transfert d'argent → saisissez le numéro et le montant, puis validez avec votre code secret.
            </p>
          </div>

          <div className="grid gap-3">
            <div>
              <Label htmlFor="tx">Identifiant de la transaction *</Label>
              <Input id="tx" value={txId} onChange={(e) => setTxId(e.target.value)} placeholder="Ex : PP240612.1830.C12345" />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="phone">Votre numéro Orange Money</Label>
                <Input id="phone" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} placeholder="6XX XX XX XX" />
              </div>
              <div>
                <Label htmlFor="pname">Nom de l'expéditeur</Label>
                <Input id="pname" value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Nom complet" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayPlan(null)} disabled={saving}>Annuler</Button>
            <Button onClick={submitRequest} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
              J'ai payé, déclarer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
