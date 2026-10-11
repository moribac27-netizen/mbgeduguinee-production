import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Tags, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/audit";
import { formatGNF } from "@/lib/orange-money";
import {
  ALL_PAYER_ROLES, MODULE_LABELS, PAYMENT_STATUS_LABELS, aggregateFinance, isPendingStatus, paymentErrorMessage,
  summarizeCommissions, validateOfferForm, type OfferModule,
} from "@/lib/offers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/offres")({
  head: () => ({ meta: [{ title: "Offres & paiements — MBGEduGuinée" }, { name: "description", content: "Offres d'abonnement, validation des paiements et commissions" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: sa } = await supabase.from("super_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
    if (!sa) throw redirect({ to: "/dashboard" });
  },
  component: OffresPage,
});

const db = supabase as any;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString("fr-FR") : "—");

function useTable<T = any>(key: string, fn: () => Promise<T[]>) {
  const { data = [], isLoading, refetch } = useQuery({ queryKey: ["offres", key], queryFn: fn, staleTime: 10_000 });
  return { rows: data as T[], isLoading, refetch };
}

function OffresPage() {
  const qc = useQueryClient();
  const refreshAll = () => qc.invalidateQueries({ queryKey: ["offres"] });

  const offers = useTable("offers", async () => { const { data, error } = await db.from("subscription_offers").select("*").order("sort_order"); if (error) throw error; return data ?? []; });
  const schools = useTable("schools", async () => {
    const [sc, subs] = await Promise.all([
      db.from("schools").select("id,name,city,status").order("name"),
      db.from("school_offer_subscriptions").select("school_id,offer_id,offer_code,offer_name,academic_year,status,annual_price_per_student,school_commission_per_student,created_at").eq("status", "active"),
    ]);
    if (sc.error) throw sc.error;
    if (subs.error) throw subs.error;
    const bySchool = new Map<string, any[]>();
    for (const x of subs.data ?? []) bySchool.set(x.school_id, [...(bySchool.get(x.school_id) ?? []), x]);
    return (sc.data ?? []).map((s: any) => ({ ...s, subscriptions: bySchool.get(s.id) ?? [] }));
  });
  const payments = useTable("payments", async () => { const { data, error } = await db.from("student_plan_payments").select("*").order("created_at", { ascending: false }).limit(1000); if (error) throw error; return data ?? []; });
  const commissions = useTable("commissions", async () => { const { data, error } = await db.from("school_commissions").select("*").order("created_at", { ascending: false }).limit(2000); if (error) throw error; return data ?? []; });
  const payouts = useTable("payouts", async () => { const { data, error } = await db.from("commission_payouts").select("*").order("created_at", { ascending: false }).limit(500); if (error) throw error; return data ?? []; });
  const history = useTable("history", async () => {
    const [h, a, sb] = await Promise.all([
      db.from("subscription_offer_history").select("*").order("changed_at", { ascending: false }).limit(100),
      db.from("cotisation_payment_audit").select("*").order("created_at", { ascending: false }).limit(150),
      db.from("school_offer_subscriptions").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (h.error) throw h.error;
    if (a.error) throw a.error;
    if (sb.error) throw sb.error;
    return [
      ...(h.data ?? []).map((x: any) => ({ at: x.changed_at, kind: "Offre modifiée", detail: x })),
      ...(sb.data ?? []).map((x: any) => ({ at: x.created_at, kind: "Offre d'un établissement", detail: x })),
      ...(a.data ?? []).map((x: any) => ({ at: x.created_at, kind: `Paiement ${x.action}`, detail: x })),
    ].sort((p, q) => String(q.at).localeCompare(String(p.at)));
  });
  const students = useTable("students", async () => { const { data, error } = await db.from("students").select("id,full_name,matricule"); if (error) throw error; return data ?? []; });

  const schoolName = useMemo(() => new Map((schools.rows as any[]).map((s) => [s.id, s.name])), [schools.rows]);
  const studentOf = useMemo(() => new Map((students.rows as any[]).map((s) => [s.id, s])), [students.rows]);
  const offerById = useMemo(() => new Map((offers.rows as any[]).map((o) => [o.id, o])), [offers.rows]);
  const pending = (payments.rows as any[]).filter((p) => isPendingStatus(p.status));

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Tags className="size-7 text-primary" /> Offres & paiements</h1>
        <p className="text-muted-foreground mt-1">Configuration des offres, validation finale des paiements, commissions et reversements. Réservé au Super Admin.</p>
      </div>
      <Tabs defaultValue="paiements">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="paiements">Paiements à valider{pending.length ? ` (${pending.length})` : ""}</TabsTrigger>
          <TabsTrigger value="offres">Offres</TabsTrigger>
          <TabsTrigger value="ecoles">Établissements</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="stats">Statistiques</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="paiements" className="mt-4"><PendingPayments pending={pending} schoolName={schoolName} studentOf={studentOf} onDone={refreshAll} /></TabsContent>
        <TabsContent value="offres" className="mt-4"><OffersEditor offers={offers.rows as any[]} onDone={refreshAll} /></TabsContent>
        <TabsContent value="ecoles" className="mt-4"><SchoolsTab schools={schools.rows as any[]} offers={offers.rows as any[]} offerById={offerById} payments={payments.rows as any[]} commissions={commissions.rows as any[]} onDone={refreshAll} /></TabsContent>
        <TabsContent value="commissions" className="mt-4"><CommissionsTab commissions={commissions.rows as any[]} payouts={payouts.rows as any[]} schoolName={schoolName} studentOf={studentOf} onDone={refreshAll} /></TabsContent>
        <TabsContent value="stats" className="mt-4"><StatsTab payments={payments.rows as any[]} commissions={commissions.rows as any[]} schoolName={schoolName} /></TabsContent>
        <TabsContent value="historique" className="mt-4"><HistoryTab rows={history.rows as any[]} schoolName={schoolName} /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------ Paiements à valider ------------------------------ */
function PendingPayments({ pending, schoolName, studentOf, onDone }: { pending: any[]; schoolName: Map<string, string>; studentOf: Map<string, any>; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<any | null>(null);
  const [refuse, setRefuse] = useState<any | null>(null);
  const [reason, setReason] = useState("");

  // Un lot (paiement groupé) = une seule décision : la fonction serveur traite tout le lot.
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of pending) { const k = p.payment_group_id ?? p.id; m.set(k, [...(m.get(k) ?? []), p]); }
    return [...m.values()];
  }, [pending]);

  async function decide(first: any, approve: boolean, why?: string) {
    setBusy(first.id);
    const { error } = await db.rpc("review_cotisation_payment", { _payment_id: first.id, _approve: approve, _reason: why ?? null });
    setBusy(null);
    if (error) return toast.error(paymentErrorMessage(error.message));
    void logActivity({ action: approve ? "payment.validate" : "payment.refuse", entity_type: "student_plan_payment", entity_id: first.id, metadata: { reference: first.reference, reason: why ?? null } });
    toast.success(approve ? "Paiement validé : abonnement activé et commission calculée." : "Paiement refusé : motif enregistré.");
    setConfirm(null); setRefuse(null); setReason("");
    onDone();
  }

  return (
    <Card>
      <CardHeader><CardTitle>En attente de validation</CardTitle><CardDescription>Une confirmation Mobile Money ne remplace jamais votre décision : vérifiez la référence, le montant et l'élève avant de valider.</CardDescription></CardHeader>
      <CardContent>
        {groups.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">Aucun paiement en attente.</p> : (
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Établissement</TableHead><TableHead>Élève(s)</TableHead><TableHead>Offre</TableHead><TableHead>Montant</TableHead><TableHead>Référence / téléphone</TableHead><TableHead>Déclaré le</TableHead><TableHead className="text-right">Décision</TableHead></TableRow></TableHeader><TableBody>
            {groups.map((g) => {
              const first = g[0];
              const total = g.reduce((a, p) => a + Number(p.amount || 0), 0);
              return (
                <TableRow key={first.payment_group_id ?? first.id}>
                  <TableCell className="font-medium">{schoolName.get(first.school_id) ?? "—"}<div className="text-xs text-muted-foreground">{first.academic_year}</div></TableCell>
                  <TableCell>{g.map((p) => studentOf.get(p.student_id)?.full_name ?? "—").join(", ")}{g.length > 1 && <Badge variant="outline" className="ml-2">Lot de {g.length}</Badge>}</TableCell>
                  <TableCell><Badge variant="secondary">{first.offer_code ?? "—"}</Badge></TableCell>
                  <TableCell>{formatGNF(total)}<div className="text-xs text-muted-foreground">Commission : {formatGNF(g.reduce((a, p) => a + Number(p.school_share || 0), 0))}</div></TableCell>
                  <TableCell>{first.reference}<div className="text-xs text-muted-foreground">{first.payer_phone ?? "—"}</div></TableCell>
                  <TableCell className="text-xs">{fmtDate(first.declared_at)}</TableCell>
                  <TableCell className="text-right"><div className="flex justify-end gap-2">
                    <Button size="sm" disabled={busy === first.id} onClick={() => setConfirm(g)}><CheckCircle2 className="size-4 mr-1" /> Accepter</Button>
                    <Button size="sm" variant="outline" disabled={busy === first.id} onClick={() => setRefuse(g)}><XCircle className="size-4 mr-1" /> Refuser</Button>
                  </div></TableCell>
                </TableRow>
              );
            })}
          </TableBody></Table></div>
        )}
      </CardContent>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}><AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Valider ce paiement ?</AlertDialogTitle><AlertDialogDescription>
          {confirm && <>Référence <b>{confirm[0].reference}</b> · {confirm.length} élève(s) · {formatGNF(confirm.reduce((a: number, p: any) => a + Number(p.amount || 0), 0))}. L'abonnement sera activé ou renouvelé et la commission de l'établissement sera calculée.</>}
        </AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction onClick={(e) => { e.preventDefault(); if (confirm) void decide(confirm[0], true); }}>Valider</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent></AlertDialog>

      <Dialog open={!!refuse} onOpenChange={(o) => { if (!o) { setRefuse(null); setReason(""); } }}><DialogContent>
        <DialogHeader><DialogTitle>Refuser ce paiement</DialogTitle><DialogDescription>Le motif est obligatoire : il est conservé dans l'historique et visible par l'établissement.</DialogDescription></DialogHeader>
        <Textarea rows={4} placeholder="Motif du refus" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DialogFooter><Button variant="outline" onClick={() => setRefuse(null)}>Annuler</Button><Button variant="destructive" disabled={!reason.trim() || !!busy} onClick={() => refuse && void decide(refuse[0], false, reason.trim())}>{busy ? <Loader2 className="size-4 animate-spin" /> : "Refuser le paiement"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </Card>
  );
}

/* ------------------------------ Édition des offres ------------------------------ */
function OffersEditor({ offers, onDone }: { offers: any[]; onDone: () => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {offers.map((o) => <OfferCard key={`${o.id}-${o.updated_at}`} offer={o} onDone={onDone} />)}
    </div>
  );
}

function OfferCard({ offer, onDone }: { offer: any; onDone: () => void }) {
  const [f, setF] = useState({
    name: offer.name as string, annual_price: String(offer.annual_price_per_student), school_commission: String(offer.school_commission_per_student),
    active: !!offer.is_active, parent_login: !!offer.parent_login_allowed, student_login: !!offer.student_login_allowed,
    modules: { cantine: offer.features?.cantine !== false, infirmerie: offer.features?.infirmerie !== false, bibliotheque: offer.features?.bibliotheque !== false } as Record<OfferModule, boolean>,
    payer_roles: new Set<string>(offer.payer_roles ?? []),
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    const err = validateOfferForm(f);
    if (err) return toast.error(err);
    setSaving(true);
    const { data, error } = await db.from("subscription_offers").update({
      name: f.name.trim(), annual_price_per_student: Number(f.annual_price), school_commission_per_student: Number(f.school_commission), is_active: f.active,
      parent_login_allowed: f.parent_login, student_login_allowed: f.student_login, features: f.modules, payer_roles: [...f.payer_roles],
    }).eq("id", offer.id).select("id");
    setSaving(false);
    if (error || !(data ?? []).length) return toast.error(error?.message ?? "Modification refusée.");
    void logActivity({ action: "offer.update", entity_type: "subscription_offer", entity_id: offer.id, entity_label: f.name });
    toast.success("Offre enregistrée. Les paiements déjà déclarés ou validés ne sont pas modifiés.");
    onDone();
  }

  const toggleRole = (r: string, on: boolean) => setF((p) => { const n = new Set(p.payer_roles); on ? n.add(r) : n.delete(r); return { ...p, payer_roles: n }; });

  return (
    <Card className={f.active ? undefined : "opacity-70"}>
      <CardHeader className="pb-3"><div className="flex items-center justify-between gap-2"><CardTitle className="capitalize">{offer.code}</CardTitle><div className="flex items-center gap-2 text-sm"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /> {f.active ? "Active" : "Désactivée"}</div></div></CardHeader>
      <CardContent className="space-y-3">
        <div><Label>Nom</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Tarif annuel (GNF / élève)</Label><Input type="number" min={0} value={f.annual_price} onChange={(e) => setF({ ...f, annual_price: e.target.value })} /></div>
          <div><Label>Commission école (GNF)</Label><Input type="number" min={0} value={f.school_commission} onChange={(e) => setF({ ...f, school_commission: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label>Fonctionnalités</Label>
          {(Object.keys(MODULE_LABELS) as OfferModule[]).map((m) => <label key={m} className="flex items-center justify-between text-sm"><span>{MODULE_LABELS[m]}</span><Switch checked={f.modules[m]} onCheckedChange={(v) => setF({ ...f, modules: { ...f.modules, [m]: v } })} /></label>)}
        </div>
        <div className="space-y-1.5"><Label>Connexions</Label>
          <label className="flex items-center justify-between text-sm"><span>Parents</span><Switch checked={f.parent_login} onCheckedChange={(v) => setF({ ...f, parent_login: v })} /></label>
          <label className="flex items-center justify-between text-sm"><span>Élèves</span><Switch checked={f.student_login} onCheckedChange={(v) => setF({ ...f, student_login: v })} /></label>
        </div>
        <div className="space-y-1.5"><Label>Rôles autorisés à initier un paiement</Label>
          <div className="grid grid-cols-2 gap-1">{ALL_PAYER_ROLES.map((r) => <label key={r.value} className="flex items-center gap-2 text-sm"><Checkbox checked={f.payer_roles.has(r.value)} onCheckedChange={(v) => toggleRole(r.value, !!v)} />{r.label}</label>)}</div>
          <p className="text-xs text-muted-foreground">Le Super Admin peut toujours payer. La validation finale lui reste réservée.</p>
        </div>
        <Button className="w-full" onClick={() => void save()} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer l'offre"}</Button>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Établissements abonnés ------------------------------ */
function SchoolsTab({ schools, offers, offerById, payments, commissions, onDone }: { schools: any[]; offers: any[]; offerById: Map<string, any>; payments: any[]; commissions: any[]; onDone: () => void }) {
  const [change, setChange] = useState<{ school: any; offerId: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function apply() {
    if (!change) return;
    setSaving(true);
    const { error } = await db.rpc("assign_school_offer", { _school_id: change.school.id, _offer_id: change.offerId, _academic_year: null });
    setSaving(false);
    if (error) return toast.error(paymentErrorMessage(error.message));
    void logActivity({ action: "school_offer.assign", entity_type: "school", entity_id: change.school.id, entity_label: change.school.name, metadata: { offer: offerById.get(change.offerId)?.code } });
    toast.success("Offre mise à jour : accès, modules et connexions recalculés. Aucun compte ni aucune donnée n'est supprimé.");
    setChange(null);
    onDone();
  }

  return (
    <Card>
      <CardHeader><CardTitle>Établissements abonnés</CardTitle><CardDescription>Changer l'offre applique immédiatement ses règles à l'établissement, sans supprimer de comptes ni de données.</CardDescription></CardHeader>
      <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Établissement</TableHead><TableHead>Offre</TableHead><TableHead>Cotisations validées</TableHead><TableHead>Encaissé</TableHead><TableHead>Commissions (due / reversée)</TableHead></TableRow></TableHeader><TableBody>
        {schools.map((s) => {
          const offerId = s.subscriptions?.[0]?.offer_id ?? "";
          const mine = payments.filter((p) => p.school_id === s.id && p.status === "VALIDATED");
          const c = summarizeCommissions(commissions.filter((x) => x.school_id === s.id));
          return (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}<div className="text-xs text-muted-foreground">{s.city ?? "—"} · {s.status}</div></TableCell>
              <TableCell className="min-w-44">
                <Select value={offerId} onValueChange={(v) => v !== offerId && setChange({ school: s, offerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Conditions actuelles (Premium par défaut)" /></SelectTrigger>
                  <SelectContent>{offers.map((o) => <SelectItem key={o.id} value={o.id} disabled={!o.is_active && o.id !== offerId}>{o.name}{o.is_active ? "" : " (désactivée)"}</SelectItem>)}</SelectContent>
                </Select>
              </TableCell>
              <TableCell>{mine.length}</TableCell>
              <TableCell>{formatGNF(mine.reduce((a, p) => a + Number(p.amount || 0), 0))}</TableCell>
              <TableCell>{formatGNF(c.pending)} / {formatGNF(c.paid)}</TableCell>
            </TableRow>
          );
        })}
        {schools.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Aucun établissement</TableCell></TableRow>}
      </TableBody></Table></div></CardContent>
      <AlertDialog open={!!change} onOpenChange={(o) => !o && setChange(null)}><AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Changer l'offre de {change?.school.name} ?</AlertDialogTitle><AlertDialogDescription>
          Nouvelle offre : <b>{change ? offerById.get(change.offerId)?.name : ""}</b>. Les connexions Parents/Élèves, les modules et les prix des futurs paiements suivent cette offre. Les paiements déjà déclarés ou validés gardent leurs conditions.
        </AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); void apply(); }}>{saving ? "Application…" : "Appliquer"}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent></AlertDialog>
    </Card>
  );
}

/* ------------------------------ Commissions et reversements ------------------------------ */
function CommissionsTab({ commissions, payouts, schoolName, studentOf, onDone }: { commissions: any[]; payouts: any[]; schoolName: Map<string, string>; studentOf: Map<string, any>; onDone: () => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const due = commissions.filter((c) => c.status === "pending");
  const totals = summarizeCommissions(commissions);
  const selected = due.filter((c) => sel.has(c.id));
  const schoolsInSel = new Set(selected.map((c) => c.school_id));
  const selTotal = selected.reduce((a, c) => a + Number(c.amount || 0), 0);

  function toggle(c: any) { setSel((p) => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; }); }

  async function pay() {
    setBusy(true);
    const { error } = await db.rpc("record_commission_payout", { _school_id: [...schoolsInSel][0], _reference: reference.trim(), _commission_ids: [...sel], _notes: note.trim() || null });
    setBusy(false);
    if (error) return toast.error(paymentErrorMessage(error.message));
    void logActivity({ action: "commission.payout", entity_type: "commission_payout", entity_label: reference.trim(), metadata: { count: sel.size, total: selTotal } });
    toast.success(`Reversement enregistré : ${formatGNF(selTotal)}.`);
    setOpen(false); setSel(new Set()); setReference(""); setNote("");
    onDone();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Commissions générées</div><div className="text-2xl font-bold">{formatGNF(totals.total)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">En attente de reversement</div><div className="text-2xl font-bold">{formatGNF(totals.pending)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Déjà reversées</div><div className="text-2xl font-bold">{formatGNF(totals.paid)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>À reverser</CardTitle><CardDescription>Commissions issues de paiements validés. Un reversement concerne un seul établissement.</CardDescription></div>
          <Button disabled={selected.length === 0 || schoolsInSel.size !== 1} onClick={() => setOpen(true)}>Enregistrer un reversement{selected.length ? ` (${formatGNF(selTotal)})` : ""}</Button></CardHeader>
        <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-10" /><TableHead>Établissement</TableHead><TableHead>Élève</TableHead><TableHead>Offre</TableHead><TableHead>Année</TableHead><TableHead>Montant</TableHead></TableRow></TableHeader><TableBody>
          {due.map((c) => <TableRow key={c.id}><TableCell><Checkbox checked={sel.has(c.id)} onCheckedChange={() => toggle(c)} /></TableCell><TableCell>{schoolName.get(c.school_id) ?? "—"}</TableCell><TableCell>{studentOf.get(c.student_id)?.full_name ?? "—"}</TableCell><TableCell><Badge variant="secondary">{c.offer_code}</Badge></TableCell><TableCell>{c.academic_year}</TableCell><TableCell>{formatGNF(Number(c.amount))}</TableCell></TableRow>)}
          {due.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Aucune commission en attente.</TableCell></TableRow>}
        </TableBody></Table></div>
        {schoolsInSel.size > 1 && <p className="mt-2 text-sm text-destructive">Sélectionnez les commissions d'un seul établissement.</p>}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Reversements effectués</CardTitle></CardHeader>
        <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Établissement</TableHead><TableHead>Référence</TableHead><TableHead>Montant</TableHead><TableHead>Statut</TableHead><TableHead>Note</TableHead></TableRow></TableHeader><TableBody>
          {payouts.map((p) => <TableRow key={p.id}><TableCell className="text-xs">{fmtDate(p.paid_at)}</TableCell><TableCell>{schoolName.get(p.school_id) ?? "—"}</TableCell><TableCell>{p.reference}</TableCell><TableCell>{formatGNF(Number(p.amount))}</TableCell><TableCell><Badge>{p.status === "completed" ? "Effectué" : "Annulé"}</Badge></TableCell><TableCell className="text-xs">{p.notes ?? "—"}</TableCell></TableRow>)}
          {payouts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Aucun reversement.</TableCell></TableRow>}
        </TableBody></Table></div></CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent>
        <DialogHeader><DialogTitle>Enregistrer un reversement</DialogTitle><DialogDescription>{selected.length} commission(s) · montant calculé par le serveur : {formatGNF(selTotal)}.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label>Référence du reversement *</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Référence unique" /></div>
          <p className="text-xs text-muted-foreground">La date du reversement est celle de l'enregistrement.</p>
          <div><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button><Button disabled={busy || !reference.trim()} onClick={() => void pay()}>{busy ? "Enregistrement…" : "Enregistrer"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}

/* ------------------------------ Statistiques & historique ------------------------------ */
function StatsTab({ payments, commissions, schoolName }: { payments: any[]; commissions: any[]; schoolName: Map<string, string> }) {
  const rows = useMemo(() => aggregateFinance(payments, commissions), [payments, commissions]);
  return (
    <Card>
      <CardHeader><CardTitle>Statistiques financières</CardTitle><CardDescription>Par établissement et par année scolaire. Seuls les paiements validés sont comptés.</CardDescription></CardHeader>
      <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Établissement</TableHead><TableHead>Année</TableHead><TableHead>Validés</TableHead><TableHead>En attente</TableHead><TableHead>Refusés</TableHead><TableHead>Encaissé</TableHead><TableHead>Commission due</TableHead><TableHead>Reversée</TableHead></TableRow></TableHeader><TableBody>
        {rows.map((r) => <TableRow key={`${r.schoolId}|${r.academicYear}`}><TableCell className="font-medium">{schoolName.get(r.schoolId) ?? "—"}</TableCell><TableCell>{r.academicYear}</TableCell><TableCell>{r.validated}</TableCell><TableCell>{r.pending}</TableCell><TableCell>{r.refused}</TableCell><TableCell>{formatGNF(r.revenue)}</TableCell><TableCell>{formatGNF(r.commissionDue)}</TableCell><TableCell>{formatGNF(r.commissionPaid)}</TableCell></TableRow>)}
        {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Aucune donnée.</TableCell></TableRow>}
      </TableBody></Table></div></CardContent>
    </Card>
  );
}

function HistoryTab({ rows, schoolName }: { rows: any[]; schoolName: Map<string, string> }) {
  return (
    <Card>
      <CardHeader><CardTitle>Historique des opérations</CardTitle><CardDescription>Décisions sur les paiements et changements d'offres. Cet historique ne peut être ni modifié ni supprimé.</CardDescription></CardHeader>
      <CardContent><div className="space-y-2 max-h-[32rem] overflow-y-auto">
        {rows.map((r, i) => {
          const d = r.detail;
          const school = schoolName.get(d.school_id) ?? "";
          const text = r.kind.startsWith("Paiement")
            ? `${school} · réf. ${d.reference ?? "—"} · ${formatGNF(Number(d.amount || 0))}${d.metadata?.reason ? ` · motif : ${d.metadata.reason}` : ""}`
            : r.kind === "Offre modifiée"
              ? `${d.new_values?.name ?? "—"} : ${formatGNF(Number(d.new_values?.annual_price_per_student))} / commission ${formatGNF(Number(d.new_values?.school_commission_per_student))}`
              : `${school} → ${d.offer_name ?? d.offer_code ?? "—"} (${d.academic_year}, ${formatGNF(Number(d.annual_price_per_student))}) · ${d.status === "active" ? "active" : "remplacée"}`;
          return <div key={i} className="flex justify-between gap-3 border-b py-2 text-sm last:border-0"><div><span className="font-medium">{PAYMENT_STATUS_LABELS[r.kind] ?? r.kind}</span><span className="text-muted-foreground"> · {text}</span></div><span className="shrink-0 text-xs text-muted-foreground">{fmtDate(r.at)}</span></div>;
        })}
        {rows.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">Aucune opération.</p>}
      </div></CardContent>
    </Card>
  );
}
