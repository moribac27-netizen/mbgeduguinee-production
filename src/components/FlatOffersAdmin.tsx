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
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FLAT_OFFERS_KEY } from "@/hooks/useFlatOffers";
import { FLAT_TEXTS_KEY } from "@/hooks/usePlatformSettings";
import { MY_FLAT_OFFER_KEY } from "@/hooks/useMyFlatOffer";
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
          <CardTitle className="text-base">Plans par établissement (offre exceptionnelle)</CardTitle>
          <CardDescription>Modifiables à tout moment. Une modification s'applique à la page publique et au choix à la création ; les établissements déjà inscrits gardent leurs conditions d'origine. Le prix annuel est calculé automatiquement.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-2">
          {(offers.data ?? []).map((o) => <FlatOfferCard key={`${o.id}-${o.updated_at}`} offer={o} onDone={refresh} />)}
          {offers.isLoading && <Loader2 className="size-5 animate-spin" />}
        </CardContent>
      </Card>

      <FlatSettingsAdmin />

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
            <TableHeader><TableRow><TableHead>Établissement</TableHead><TableHead>Offre</TableHead><TableHead>Effectif</TableHead><TableHead>Encaissé (validé)</TableHead><TableHead>En attente</TableHead><TableHead>Fin de validité</TableHead><TableHead>À migrer</TableHead><TableHead>État</TableHead></TableRow></TableHeader>
            <TableBody>
              {(overview.data ?? []).map((r) => (
                <TableRow key={r.school_id}>
                  <TableCell>{r.school_name}</TableCell>
                  <TableCell>{r.offer_name}</TableCell>
                  <TableCell>{r.students_count} / {r.max_students ?? "illimité"}{r.over_tranche && <Badge className="ml-2 bg-red-100 text-red-900">Tranche dépassée</Badge>}</TableCell>
                  <TableCell>{formatPublicGNF(Number(r.validated_total))}</TableCell>
                  <TableCell>{r.pending_count}</TableCell>
                  <TableCell>{r.valid_until}</TableCell>
                  <TableCell>{r.to_migrate ? <Badge className="bg-amber-100 text-amber-900">Plan par élève requis</Badge> : "—"}</TableCell>
                  <TableCell><Badge className={r.in_good_standing ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}>{r.in_good_standing ? "En règle" : "En retard"}</Badge></TableCell>
                </TableRow>
              ))}
              {!(overview.data ?? []).length && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">Aucun établissement sous forfait. Pour en attribuer un : onglet « Établissements ».</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function FlatOfferCard({ offer, onDone }: { offer: any; onDone: () => void }) {
  const [f, setF] = useState({
    name: String(offer.name ?? ""), min: String(offer.min_students ?? 0), max: offer.max_students === null || offer.max_students === undefined ? "" : String(offer.max_students),
    monthly: String(offer.monthly_price ?? 0), free: String(offer.free_months_annual ?? 0),
    from: String(offer.valid_from ?? ""), until: String(offer.valid_until ?? ""), active: !!offer.is_active,
    description: String(offer.description ?? ""),
  });
  const [busy, setBusy] = useState(false);
  const annual = flatAnnualPrice(Number(f.monthly), Number(f.free));
  const today = todayConakry();
  const visible = f.active && f.from <= today && today <= f.until;

  async function save() {
    const min = Number(f.min), max = f.max.trim() === "" ? null : Number(f.max), monthly = Number(f.monthly), free = Number(f.free);
    if (!f.name.trim()) return void toast.error("Le nom est obligatoire.");
    if (!(monthly > 0)) return void toast.error("Le prix mensuel doit être supérieur à 0.");
    if (!(Number.isInteger(min) && min >= 0 && (max === null || (Number.isInteger(max) && max >= min)))) return void toast.error("Capacité invalide (laissez le maximum vide pour « illimité » ; sinon il doit être au moins égal au minimum).");
    if (!(Number.isInteger(free) && free >= 0 && free <= 11)) return void toast.error("Les mois offerts doivent être compris entre 0 et 11.");
    if (!f.from || !f.until || f.until < f.from) return void toast.error("Période de validité invalide.");
    setBusy(true);
    const { error } = await db.from("subscription_offers").update({
      name: f.name.trim(), min_students: min, max_students: max, monthly_price: monthly, free_months_annual: free,
      valid_from: f.from, valid_until: f.until, is_active: f.active, description: f.description.trim() || null,
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
        <div className="space-y-1.5"><Label>Capacité max (vide = illimité)</Label><Input type="number" min={0} value={f.max} onChange={set("max")} /></div>
        <div className="space-y-1.5"><Label>Prix mensuel (GNF)</Label><Input type="number" min={0} value={f.monthly} onChange={set("monthly")} /></div>
        <div className="space-y-1.5"><Label>Mois offerts (paiement annuel)</Label><Input type="number" min={0} max={11} value={f.free} onChange={set("free")} /></div>
        <div className="space-y-1.5"><Label>Valable du</Label><Input type="date" value={f.from} onChange={set("from")} /></div>
        <div className="space-y-1.5"><Label>Jusqu'au</Label><Input type="date" value={f.until} onChange={set("until")} /></div>
      </div>
      <div className="space-y-1.5"><Label>Description (affichée sur la carte)</Label><Textarea rows={2} value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} /></div>
      <div className="rounded-lg bg-muted p-3 text-sm">Prix annuel calculé : <strong>{formatPublicGNF(annual)}</strong> ({12 - (Number(f.free) || 0)} mois facturés)</div>
      <div className="flex items-center justify-between">
        <Badge className={visible ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800"}>{visible ? "Visible sur le site" : "Non visible sur le site"}</Badge>
        <Button onClick={save} disabled={busy}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Enregistrer</Button>
      </div>
    </div>
  );
}


/** Paramètres modifiables sans redéploiement : textes de l'offre exceptionnelle, échéances, moyens de paiement. Chaque modification est historisée. */
function FlatSettingsAdmin() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["flat-admin", "settings"], queryFn: async () => {
    const { data, error } = await db.from("platform_settings").select("key,value");
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r: any) => [r.key, r.value])) as Record<string, any>;
  } });
  const history = useQuery({ queryKey: ["flat-admin", "settings-history"], queryFn: async () => {
    const { data, error } = await db.from("platform_settings_history").select("*").order("changed_at", { ascending: false }).limit(15);
    if (error) throw error; return (data ?? []) as any[];
  } });
  if (settings.isError) return <p className="text-sm text-destructive">Les paramètres ne sont pas disponibles (migration SQL « paramètres » non appliquée ?).</p>;
  if (!settings.data) return <Loader2 className="size-5 animate-spin" />;
  const v = settings.data;
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["flat-admin"] });
    void qc.invalidateQueries({ queryKey: FLAT_TEXTS_KEY });
    void qc.invalidateQueries({ queryKey: MY_FLAT_OFFER_KEY });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Paramètres de l'offre exceptionnelle et des paiements</CardTitle>
        <CardDescription>Les modifications s'appliquent immédiatement à la page publique, à la création et à la page de paiement. Elles sont historisées.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <TextsForm value={v["public.flat_offers_texts"] ?? {}} onDone={done} />
        <BillingForm value={v["billing.flat"] ?? { due_day: 5, grace_days: 15, expiry_grace_days: 30 }} onDone={done} />
        <MethodsForm value={(v["payment.methods"] ?? [])[0] ?? { code: "orange_money", label: "Orange Money Guinée", enabled: true }} all={v["payment.methods"] ?? []} onDone={done} />
        <div>
          <div className="mb-2 text-sm font-semibold">Dernières modifications</div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {(history.data ?? []).map((h) => <li key={h.id}>{new Date(h.changed_at).toLocaleString("fr-FR")} — <span className="font-mono">{h.key}</span> modifié ({h.old_value ? "ancienne valeur conservée" : "création"})</li>)}
            {!(history.data ?? []).length && <li>Aucune modification.</li>}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

async function saveSetting(key: string, value: unknown, done: () => void) {
  const { error } = await db.from("platform_settings").upsert({ key, value }, { onConflict: "key" });
  if (error) { toast.error("Enregistrement impossible : " + error.message); return; }
  toast.success("Paramètre enregistré.");
  done();
}

function TextsForm({ value, onDone }: { value: any; onDone: () => void }) {
  const [t, setT] = useState({ title: String(value.title ?? ""), subtitle: String(value.subtitle ?? ""), message: String(value.message ?? "") });
  return (
    <div className="space-y-2 rounded-xl border p-4">
      <div className="text-sm font-semibold">Textes de la catégorie « Plans par établissement »</div>
      <div className="space-y-1.5"><Label>Titre</Label><Input value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Sous-titre</Label><Input value={t.subtitle} onChange={(e) => setT({ ...t, subtitle: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>Message explicatif</Label><Textarea rows={3} value={t.message} onChange={(e) => setT({ ...t, message: e.target.value })} /></div>
      <Button size="sm" onClick={() => saveSetting("public.flat_offers_texts", t, onDone)}>Enregistrer les textes</Button>
    </div>
  );
}

function BillingForm({ value, onDone }: { value: any; onDone: () => void }) {
  const [b, setB] = useState({ due: String(value.due_day ?? 5), grace: String(value.grace_days ?? 15), exp: String(value.expiry_grace_days ?? 30) });
  function save() {
    const due = Number(b.due), grace = Number(b.grace), exp = Number(b.exp);
    if (!(Number.isInteger(due) && due >= 1 && due <= 28)) return void toast.error("Le jour d'échéance doit être entre 1 et 28.");
    if (!(Number.isInteger(grace) && grace >= 0 && grace <= 90) || !(Number.isInteger(exp) && exp >= 0 && exp <= 180)) return void toast.error("Délais invalides.");
    void saveSetting("billing.flat", { due_day: due, grace_days: grace, expiry_grace_days: exp }, onDone);
  }
  return (
    <div className="space-y-2 rounded-xl border p-4">
      <div className="text-sm font-semibold">Échéances et tolérance</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5"><Label>Jour d'échéance mensuelle</Label><Input type="number" value={b.due} onChange={(e) => setB({ ...b, due: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Jours de tolérance après échéance</Label><Input type="number" value={b.grace} onChange={(e) => setB({ ...b, grace: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Jours de grâce après fin de l'offre</Label><Input type="number" value={b.exp} onChange={(e) => setB({ ...b, exp: e.target.value })} /></div>
      </div>
      <Button size="sm" onClick={save}>Enregistrer les délais</Button>
    </div>
  );
}

function MethodsForm({ value, all, onDone }: { value: any; all: any[]; onDone: () => void }) {
  const [m, setM] = useState({
    enabled: value.enabled !== false, label: String(value.label ?? ""), number: String(value.number ?? ""), local: String(value.local ?? ""),
    holder: String(value.holder ?? ""), ussd: String(value.ussd ?? ""), instructions: (value.instructions ?? []).join("\n"),
  });
  function save() {
    if (!m.label.trim()) return void toast.error("Le libellé est obligatoire.");
    const next = { ...value, code: value.code ?? "orange_money", label: m.label.trim(), enabled: m.enabled, number: m.number.trim(), local: m.local.trim(), holder: m.holder.trim(), ussd: m.ussd.trim(),
      instructions: m.instructions.split("\n").map((x: string) => x.trim()).filter(Boolean) };
    void saveSetting("payment.methods", [next, ...all.slice(1)], onDone);
  }
  return (
    <div className="space-y-2 rounded-xl border p-4">
      <div className="flex items-center justify-between"><div className="text-sm font-semibold">Moyen de paiement : {value.label ?? "Orange Money"}</div>
        <div className="flex items-center gap-2 text-sm"><Switch checked={m.enabled} onCheckedChange={(x) => setM({ ...m, enabled: x })} />{m.enabled ? "Disponible" : "Désactivé"}</div></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Libellé</Label><Input value={m.label} onChange={(e) => setM({ ...m, label: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Titulaire</Label><Input value={m.holder} onChange={(e) => setM({ ...m, holder: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Numéro (format international)</Label><Input value={m.number} onChange={(e) => setM({ ...m, number: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Numéro affiché</Label><Input value={m.local} onChange={(e) => setM({ ...m, local: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Code USSD</Label><Input value={m.ussd} onChange={(e) => setM({ ...m, ussd: e.target.value })} /></div>
      </div>
      <div className="space-y-1.5"><Label>Instructions (une par ligne)</Label><Textarea rows={4} value={m.instructions} onChange={(e) => setM({ ...m, instructions: e.target.value })} /></div>
      <Button size="sm" onClick={save}>Enregistrer le moyen de paiement</Button>
    </div>
  );
}
