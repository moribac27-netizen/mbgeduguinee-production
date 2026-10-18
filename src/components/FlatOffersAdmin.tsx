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
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FLAT_OFFERS_KEY } from "@/hooks/useFlatOffers";
import { flatAnnualPrice, todayConakry } from "@/lib/flat-offers";
import { flatPaymentErrorMessage } from "@/lib/flat-payments";
import { formatPublicGNF } from "@/lib/public-offers";

const db = supabase as any;

/** Espace Super Admin : offres par établissement (modifiables), vue d'ensemble des écoles et validation des paiements. */
export function FlatOffersAdmin() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["flat-admin"] });
    void qc.invalidateQueries({ queryKey: FLAT_OFFERS_KEY });
    void qc.invalidateQueries({ queryKey: ["public-offers"] });
  };
  const offers = useQuery({ queryKey: ["flat-admin", "offers"], queryFn: async () => {
    const { data, error } = await db.from("subscription_offers").select("*").eq("offer_type", "per_school").order("sort_order");
    if (error) throw error; return (data ?? []) as any[];
  } });
  const overview = useQuery({ queryKey: ["flat-admin", "overview"], queryFn: async () => {
    const { data, error } = await db.rpc("flat_offers_overview"); if (error) throw error; return (data ?? []) as any[];
  } });
  const payments = useQuery({ queryKey: ["flat-admin", "payments"], queryFn: async () => {
    const { data, error } = await db.from("school_flat_payments").select("*").order("declared_at", { ascending: false }).limit(200);
    if (error) throw error; return (data ?? []) as any[];
  } });
  const schools = useQuery({ queryKey: ["flat-admin", "schools"], queryFn: async () => {
    const { data, error } = await db.from("schools").select("id,name"); if (error) throw error; return (data ?? []) as any[];
  } });
  const schoolName = new Map<string, string>((schools.data ?? []).map((s) => [s.id, s.name]));

  if (offers.isError) return <p className="text-sm text-destructive">Les offres établissement ne sont pas disponibles (migration SQL non appliquée ?).</p>;
  const pending = (payments.data ?? []).filter((p) => p.status === "PENDING");

  async function review(p: any, approve: boolean) {
    const note = approve ? undefined : window.prompt("Motif du rejet (visible par l'établissement) :") ?? undefined;
    if (!approve && note === undefined) return;
    const { error } = await db.rpc("review_flat_payment", { _payment_id: p.id, _approve: approve, _note: note ?? null });
    if (error) { toast.error(flatPaymentErrorMessage(error.message)); return; }
    toast.success(approve ? "Paiement validé." : "Paiement rejeté.");
    refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Offres par établissement (temporaires)</CardTitle>
          <CardDescription>Modifiables à tout moment. Une modification s'applique à la page publique et au choix à la création ; les établissements déjà inscrits gardent leurs conditions d'origine. Le prix annuel est calculé automatiquement.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {(offers.data ?? []).map((o) => <FlatOfferCard key={`${o.id}-${o.updated_at}`} offer={o} onDone={refresh} />)}
          {offers.isLoading && <Loader2 className="size-5 animate-spin" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Paiements de forfait à valider {pending.length ? `(${pending.length})` : ""}</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Référence</TableHead><TableHead>Établissement</TableHead><TableHead>Période</TableHead><TableHead>Montant</TableHead><TableHead>Réf. paiement</TableHead><TableHead>Déclaré le</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {pending.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                  <TableCell>{schoolName.get(p.school_id) ?? p.school_id}</TableCell>
                  <TableCell>{p.period_type === "annual" ? `Année ${p.academic_year}` : new Date(p.period_month + "T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</TableCell>
                  <TableCell>{formatPublicGNF(Number(p.amount))}</TableCell>
                  <TableCell>{p.payer_reference}</TableCell>
                  <TableCell>{new Date(p.declared_at).toLocaleString("fr-FR")}</TableCell>
                  <TableCell className="space-x-2 whitespace-nowrap">
                    <Button size="sm" onClick={() => review(p, true)}>Valider</Button>
                    <Button size="sm" variant="outline" onClick={() => review(p, false)}>Rejeter</Button>
                  </TableCell>
                </TableRow>
              ))}
              {!pending.length && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Aucun paiement en attente.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Établissements sous forfait</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Établissement</TableHead><TableHead>Offre</TableHead><TableHead>Effectif</TableHead><TableHead>Encaissé (validé)</TableHead><TableHead>En attente</TableHead><TableHead>Fin de validité</TableHead><TableHead>État</TableHead></TableRow></TableHeader>
            <TableBody>
              {(overview.data ?? []).map((r) => (
                <TableRow key={r.school_id}>
                  <TableCell>{r.school_name}</TableCell>
                  <TableCell>{r.offer_name}</TableCell>
                  <TableCell>{r.students_count} / {r.max_students}{r.over_tranche && <Badge className="ml-2 bg-red-100 text-red-900">Tranche dépassée</Badge>}</TableCell>
                  <TableCell>{formatPublicGNF(Number(r.validated_total))}</TableCell>
                  <TableCell>{r.pending_count}</TableCell>
                  <TableCell>{r.valid_until}</TableCell>
                  <TableCell><Badge className={r.in_good_standing ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}>{r.in_good_standing ? "En règle" : "En retard"}</Badge></TableCell>
                </TableRow>
              ))}
              {!(overview.data ?? []).length && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground">Aucun établissement sous forfait. Pour en attribuer un : onglet « Établissements ».</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FlatOfferCard({ offer, onDone }: { offer: any; onDone: () => void }) {
  const [f, setF] = useState({
    name: String(offer.name ?? ""), min: String(offer.min_students ?? 0), max: String(offer.max_students ?? 0),
    monthly: String(offer.monthly_price ?? 0), free: String(offer.free_months_annual ?? 0),
    from: String(offer.valid_from ?? ""), until: String(offer.valid_until ?? ""), active: !!offer.is_active,
  });
  const [busy, setBusy] = useState(false);
  const annual = flatAnnualPrice(Number(f.monthly), Number(f.free));
  const today = todayConakry();
  const visible = f.active && f.from <= today && today <= f.until;

  async function save() {
    const min = Number(f.min), max = Number(f.max), monthly = Number(f.monthly), free = Number(f.free);
    if (!f.name.trim()) return void toast.error("Le nom est obligatoire.");
    if (!(monthly > 0)) return void toast.error("Le prix mensuel doit être supérieur à 0.");
    if (!(Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= min)) return void toast.error("Tranche d'élèves invalide (le maximum doit être au moins égal au minimum).");
    if (!(Number.isInteger(free) && free >= 0 && free <= 11)) return void toast.error("Les mois offerts doivent être compris entre 0 et 11.");
    if (!f.from || !f.until || f.until < f.from) return void toast.error("Période de validité invalide.");
    setBusy(true);
    const { error } = await db.from("subscription_offers").update({
      name: f.name.trim(), min_students: min, max_students: max, monthly_price: monthly, free_months_annual: free,
      valid_from: f.from, valid_until: f.until, is_active: f.active,
    }).eq("id", offer.id);
    setBusy(false);
    if (error) { toast.error("Enregistrement impossible : " + error.message); return; }
    toast.success("Offre enregistrée : la page publique et le choix à la création sont à jour.");
    onDone();
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{offer.code}</div>
        <div className="flex items-center gap-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => setF((p) => ({ ...p, active: v }))} />{f.active ? "Active" : "Désactivée"}</div>
      </div>
      <div className="space-y-1.5"><Label>Nom</Label><Input value={f.name} onChange={set("name")} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Élèves (min)</Label><Input type="number" min={0} value={f.min} onChange={set("min")} /></div>
        <div className="space-y-1.5"><Label>Élèves (max)</Label><Input type="number" min={0} value={f.max} onChange={set("max")} /></div>
        <div className="space-y-1.5"><Label>Prix mensuel (GNF)</Label><Input type="number" min={0} value={f.monthly} onChange={set("monthly")} /></div>
        <div className="space-y-1.5"><Label>Mois offerts (paiement annuel)</Label><Input type="number" min={0} max={11} value={f.free} onChange={set("free")} /></div>
        <div className="space-y-1.5"><Label>Valable du</Label><Input type="date" value={f.from} onChange={set("from")} /></div>
        <div className="space-y-1.5"><Label>Jusqu'au</Label><Input type="date" value={f.until} onChange={set("until")} /></div>
      </div>
      <div className="rounded-lg bg-muted p-3 text-sm">Prix annuel calculé : <strong>{formatPublicGNF(annual)}</strong> ({12 - (Number(f.free) || 0)} mois facturés)</div>
      <div className="flex items-center justify-between">
        <Badge className={visible ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"}>{visible ? "Visible sur le site" : "Non visible sur le site"}</Badge>
        <Button onClick={save} disabled={busy}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Enregistrer</Button>
      </div>
    </div>
  );
}
