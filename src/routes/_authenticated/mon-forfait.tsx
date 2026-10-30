import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMyFlatOffer, MY_FLAT_OFFER_KEY, type MyFlatOffer, type PaymentMethod } from "@/hooks/useMyFlatOffer";
import { usePublicOffers } from "@/hooks/usePublicOffers";
import { formatDateFr } from "@/lib/flat-offers";
import { formatPublicGNF } from "@/lib/public-offers";
import { flatPaymentErrorMessage, monthsOfAcademicYear, PAYMENT_STATUS_LABEL, printFlatReceipt } from "@/lib/flat-payments";
import { useSchool } from "@/hooks/useSchool";

export const Route = createFileRoute("/_authenticated/mon-forfait")({
  head: () => ({ meta: [{ title: "Mon forfait — MBGEduGuinée" }] }),
  validateSearch: (s: Record<string, unknown>): { finaliser?: string } => ({ finaliser: typeof s.finaliser === "string" ? s.finaliser : undefined }),
  component: MonForfaitPage,
});

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "En attente de validation", cls: "bg-amber-100 text-amber-900" },
  VALIDATED: { label: "Validé", cls: "bg-emerald-100 text-emerald-900" },
  REJECTED: { label: "Rejeté", cls: "bg-red-100 text-red-900" },
  CANCELLED: { label: "Annulé", cls: "bg-slate-200 text-slate-800" },
};

/** Moyens de paiement réellement activés par le Super Admin. Aucun code PIN n'est jamais demandé. */
function PaymentMethods({ methods, amount }: { methods: PaymentMethod[]; amount: number }) {
  if (!methods.length) return <p className="text-sm text-muted-foreground">Aucun moyen de paiement n'est disponible pour le moment. Contactez l'administration de la plateforme.</p>;
  return (
    <div className="space-y-4">
      {methods.map((m) => (
        <div key={m.code} className="rounded-xl border p-4 text-sm">
          <div className="font-semibold">{m.label}</div>
          {m.number && <div className="mt-2">Numéro : <strong>{m.local ?? m.number}</strong>{m.holder ? <> — au nom de <strong>{m.holder}</strong></> : null}</div>}
          <div className="mt-1">Montant à envoyer : <strong>{formatPublicGNF(amount)}</strong></div>
          {m.ussd && <a className="mt-2 inline-block text-[#0B1F3A] underline" href={`tel:${encodeURIComponent(m.ussd)}`}>Ouvrir le menu {m.ussd}</a>}
          {m.instructions?.length ? <ol className="mt-3 list-decimal space-y-1 pl-5 text-muted-foreground">{m.instructions.map((i) => <li key={i}>{i}</li>)}</ol> : null}
        </div>
      ))}
      <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">MBGEduGuinée ne vous demandera jamais votre code PIN. Déclarer un paiement ne l'active pas : il est vérifié puis validé par l'administration.</p>
    </div>
  );
}

/** Après l'expiration du forfait : l'établissement choisit lui-même un plan par élève (aucune donnée supprimée). */
function ChoosePerStudentPlan({ flat }: { flat: MyFlatOffer }) {
  const qc = useQueryClient();
  const offers = usePublicOffers();
  const [busy, setBusy] = useState<string | null>(null);
  async function choose(code: string) {
    if (busy) return;
    setBusy(code);
    const { error } = await (supabase as any).rpc("choose_school_offer", { _offer_code: code });
    setBusy(null);
    if (error) { toast.error(flatPaymentErrorMessage(error.message)); return; }
    toast.success("Plan par élève enregistré.");
    void qc.invalidateQueries();
  }
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">Mon forfait établissement</h1>
      <p className="text-sm">L'offre exceptionnelle « {flat.offer_name} » ({flat.academic_year}) est terminée. Pour continuer, choisissez l'un des plans par élève ci-dessous. Vos données et l'historique de vos paiements sont conservés.</p>
      <div className="grid gap-4 md:grid-cols-3">
        {offers.map((o) => (
          <Card key={o.code}><CardContent className="space-y-2 p-5">
            <div className="font-semibold">Plan {o.name}</div>
            <div className="text-2xl font-bold">{formatPublicGNF(o.price)}</div>
            <div className="text-xs text-muted-foreground">par élève / an</div>
            <Button className="w-full" onClick={() => choose(o.code)} disabled={!!busy}>{busy === o.code && <Loader2 className="mr-2 size-4 animate-spin" />}Choisir ce plan</Button>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}

function MonForfaitPage() {
  const qc = useQueryClient();
  const { flat, loading } = useMyFlatOffer();
  const { finaliser } = Route.useSearch();
  const { school } = useSchool();
  const [type, setType] = useState<"monthly" | "annual">("monthly");
  const [month, setMonth] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  const payments = useQuery({
    queryKey: ["my-flat-payments"],
    enabled: !!flat,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("school_flat_payments").select("*").order("declared_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  if (loading) return <Loader2 className="size-5 animate-spin" />;
  if (!flat) return <p className="text-sm text-muted-foreground">Votre établissement n'est pas sous une offre établissement.</p>;
  if (flat.expired) return <ChoosePerStudentPlan flat={flat} />;

  const months = monthsOfAcademicYear(flat.academic_year);
  const amount = type === "annual" ? flat.annual_price : flat.monthly_price;

  async function declare() {
    if (busy) return;
    if (type === "monthly" && !month) { toast.error("Choisissez le mois payé."); return; }
    if (ref.trim().length < 4) { toast.error("Saisissez la référence du paiement (au moins 4 caractères)."); return; }
    setBusy(true);
    const { error } = await (supabase as any).rpc("declare_flat_payment", {
      _period_type: type, _period_month: type === "monthly" ? month : null, _payer_reference: ref.trim(),
    });
    setBusy(false);
    if (error) { toast.error(flatPaymentErrorMessage(error.message)); return; }
    toast.success("Paiement déclaré. Il sera activé après validation par l'administration.");
    setRef("");
    void qc.invalidateQueries({ queryKey: ["my-flat-payments"] });
    void qc.invalidateQueries({ queryKey: MY_FLAT_OFFER_KEY });
  }

  const pst = PAYMENT_STATUS_LABEL[flat.payment_status ?? (flat.in_good_standing ? "active" : "overdue")];
  const methods = flat.payment_methods ?? [];
  const finalising = finaliser === "1";
  async function cancelPayment(id: string) {
    if (!window.confirm("Annuler cette déclaration de paiement ?")) return;
    const { error } = await (supabase as any).rpc("cancel_flat_payment", { _payment_id: id });
    if (error) { toast.error(flatPaymentErrorMessage(error.message)); return; }
    toast.success("Déclaration annulée.");
    void qc.invalidateQueries({ queryKey: ["my-flat-payments"] });
    void qc.invalidateQueries({ queryKey: MY_FLAT_OFFER_KEY });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">{finalising ? "FINALISEZ VOTRE ABONNEMENT MBGEDUGUINÉE" : "Mon forfait établissement"}</h1>
        <p className="text-sm text-muted-foreground">{finalising ? "Votre établissement est créé. Il ne reste qu'à régler votre abonnement : voici le récapitulatif." : `${flat.offer_name} — année académique ${flat.academic_year}`}</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Récapitulatif de l'abonnement</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><div className="text-xs text-muted-foreground">Établissement</div><div className="font-semibold">{(school as any)?.name ?? "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Type d'abonnement</div><div className="font-semibold">Plan par établissement</div></div>
          <div><div className="text-xs text-muted-foreground">Plan</div><div className="font-semibold">{flat.offer_name}</div></div>
          <div><div className="text-xs text-muted-foreground">Montant mensuel</div><div className="font-semibold">{formatPublicGNF(flat.monthly_price)}</div></div>
          <div><div className="text-xs text-muted-foreground">Paiement annuel{flat.free_months > 0 ? ` (${flat.free_months} mois offerts)` : ""}</div><div className="font-semibold">{formatPublicGNF(flat.annual_price)}</div></div>
          <div><div className="text-xs text-muted-foreground">Périodicité</div><div className="font-semibold">Mensuelle (ou annuelle)</div></div>
          <div><div className="text-xs text-muted-foreground">Capacité</div><div className="font-semibold">{flat.max_students === null ? "Illimitée" : `${flat.max_students} élèves`} — {flat.students_count} inscrit(s){flat.remaining_capacity != null ? `, ${flat.remaining_capacity} place(s) restante(s)` : ""}</div></div>
          <div><div className="text-xs text-muted-foreground">Année scolaire</div><div className="font-semibold">{flat.academic_year} (jusqu'au {formatDateFr(flat.valid_until)})</div></div>
          <div><div className="text-xs text-muted-foreground">Date de souscription</div><div className="font-semibold">{flat.subscribed_at ? new Date(flat.subscribed_at).toLocaleDateString("fr-FR") : "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Statut du paiement</div><Badge className={pst?.cls}>{pst?.label}</Badge></div>
          {flat.phase === "trial" && flat.trial_end_date && (
            <div className="sm:col-span-2 lg:col-span-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Période d'essai jusqu'au {formatDateFr(flat.trial_end_date)} ({Math.max(flat.trial_days_left ?? 0, 0)} jour(s) restant(s)), limitée à {flat.trial_max_students ?? 10} élèves. Les notes, bulletins et examens sont activés après validation de votre premier paiement.</div>
          )}
          {flat.next_due_date && !flat.annual_paid && (
            <div className="sm:col-span-2"><div className="text-xs text-muted-foreground">Prochaine échéance</div>
              <div className="font-semibold">{formatDateFr(flat.next_due_date)}{flat.grace_end_date ? ` — tolérance jusqu'au ${formatDateFr(flat.grace_end_date)}` : ""}{typeof flat.grace_days_left === "number" ? (flat.grace_days_left >= 0 ? ` (${flat.grace_days_left} jour(s) restant(s))` : " (délai dépassé)") : ""}</div></div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Moyens de paiement disponibles</CardTitle></CardHeader>
        <CardContent><PaymentMethods methods={methods} amount={amount} /></CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Déclarer un paiement</CardTitle>
          <CardDescription>Après avoir effectué le transfert, saisissez ci-dessous la référence reçue. Le montant est calculé par la plateforme ; l'abonnement n'est confirmé qu'après vérification et validation par l'administration (cliquer sur « Déclarer » ne confirme jamais un paiement).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Type de paiement</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensuel</SelectItem>
                  <SelectItem value="annual">Annuel{flat.free_months > 0 ? ` (${flat.free_months} mois offerts)` : ""}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === "monthly" && (
              <div className="space-y-1.5">
                <Label>Mois payé</Label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{months.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Référence du paiement</Label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="N° de transaction Orange Money / reçu" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">Montant à payer : <strong>{formatPublicGNF(amount)}</strong></div>
            <Button onClick={declare} disabled={busy}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}J'ai effectué le paiement — déclarer</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Mes paiements</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Référence</TableHead><TableHead>Période</TableHead><TableHead>Montant</TableHead><TableHead>Réf. paiement</TableHead><TableHead>Statut</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {(payments.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                  <TableCell>{p.period_type === "annual" ? "Année complète" : new Date(p.period_month + "T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</TableCell>
                  <TableCell>{formatPublicGNF(Number(p.amount))}</TableCell>
                  <TableCell>{p.payer_reference}</TableCell>
                  <TableCell><Badge className={STATUS[p.status]?.cls}>{STATUS[p.status]?.label ?? p.status}</Badge>{p.review_note ? <div className="mt-1 text-xs text-muted-foreground">{p.review_note}</div> : null}</TableCell>
                  <TableCell>{p.status === "VALIDATED" ? <Button size="sm" variant="outline" onClick={() => printFlatReceipt(p, (school as any)?.name ?? "", flat.offer_name)}>Reçu</Button> : null}{p.status === "PENDING" ? <Button size="sm" variant="ghost" onClick={() => cancelPayment(p.id)}>Annuler</Button> : null}</TableCell>
                </TableRow>
              ))}
              {!(payments.data ?? []).length && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">Aucun paiement déclaré.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
