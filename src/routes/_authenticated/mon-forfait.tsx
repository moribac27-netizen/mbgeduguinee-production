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
import { useMyFlatOffer, MY_FLAT_OFFER_KEY } from "@/hooks/useMyFlatOffer";
import { formatPublicGNF } from "@/lib/public-offers";
import { flatPaymentErrorMessage, monthsOfAcademicYear } from "@/lib/flat-payments";

export const Route = createFileRoute("/_authenticated/mon-forfait")({
  head: () => ({ meta: [{ title: "Mon forfait — MBGEduGuinée" }] }),
  component: MonForfaitPage,
});

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "En attente de validation", cls: "bg-amber-100 text-amber-900" },
  VALIDATED: { label: "Validé", cls: "bg-emerald-100 text-emerald-900" },
  REJECTED: { label: "Rejeté", cls: "bg-red-100 text-red-900" },
};

function MonForfaitPage() {
  const qc = useQueryClient();
  const { flat, loading } = useMyFlatOffer();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Mon forfait établissement</h1>
        <p className="text-sm text-muted-foreground">{flat.offer_name} — année académique {flat.academic_year}</p>
      </div>
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="text-xs text-muted-foreground">Mensuel</div><div className="font-semibold">{formatPublicGNF(flat.monthly_price)}</div></div>
          <div><div className="text-xs text-muted-foreground">Annuel ({flat.free_months} mois offerts)</div><div className="font-semibold">{formatPublicGNF(flat.annual_price)}</div></div>
          <div><div className="text-xs text-muted-foreground">Effectif / tranche</div><div className="font-semibold">{flat.students_count} / {flat.min_students}–{flat.max_students}</div></div>
          <div><div className="text-xs text-muted-foreground">État</div><Badge className={flat.in_good_standing ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}>{flat.in_good_standing ? "En règle" : "Paiement en retard"}</Badge></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Déclarer un paiement</CardTitle>
          <CardDescription>Échéance mensuelle le 5 de chaque mois, 15 jours de tolérance. Le montant est calculé par la plateforme ; l'accès n'est activé qu'après validation par l'administration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Type de paiement</Label>
              <Select value={type} onValueChange={(v) => setType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensuel</SelectItem>
                  <SelectItem value="annual">Annuel ({flat.free_months} mois offerts)</SelectItem>
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
            <Button onClick={declare} disabled={busy}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Déclarer le paiement</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Mes paiements</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Référence</TableHead><TableHead>Période</TableHead><TableHead>Montant</TableHead><TableHead>Réf. paiement</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
            <TableBody>
              {(payments.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                  <TableCell>{p.period_type === "annual" ? "Année complète" : new Date(p.period_month + "T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</TableCell>
                  <TableCell>{formatPublicGNF(Number(p.amount))}</TableCell>
                  <TableCell>{p.payer_reference}</TableCell>
                  <TableCell><Badge className={STATUS[p.status]?.cls}>{STATUS[p.status]?.label ?? p.status}</Badge>{p.review_note ? <div className="mt-1 text-xs text-muted-foreground">{p.review_note}</div> : null}</TableCell>
                </TableRow>
              ))}
              {!(payments.data ?? []).length && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground">Aucun paiement déclaré.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
