import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Printer, AlertTriangle, CheckCircle2, XCircle, Clock, Search, FileSpreadsheet, FileText, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/paiements")({
  head: () => ({ meta: [{ title: "Paiements — MBGEduGuinée" }] }),
  component: PaymentsPage,
});

const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(n);
const METHODS = ["espèces", "Orange Money", "MTN MoMo", "PayPal", "Stripe", "virement", "chèque"] as const;
const METHOD_NEEDS_REF = new Set(["Orange Money", "MTN MoMo", "PayPal", "Stripe", "virement"]);

type PaymentRow = any;

function PaymentsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"pending" | "validated" | "late">("pending");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());


  const { data: payments = [] } = useQuery({
    queryKey: ["payments"],
    queryFn: async () =>
      (await supabase
        .from("payments")
        .select("*, students(full_name, matricule, class_id, classes(name, annual_fee))")
        .order("paid_at", { ascending: false })).data ?? [],
  });
  const { data: students = [] } = useQuery({
    queryKey: ["students-payments"],
    queryFn: async () =>
      (await supabase.from("students").select("id, full_name, matricule, classes(name, annual_fee), payments(amount, validation_status)")).data ?? [],
  });
  const { data: school } = useQuery({
    queryKey: ["current-school-full"],
    queryFn: async () => {
      const { data: uid } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("school_id").eq("id", uid.user!.id).maybeSingle();
      if (!profile?.school_id) return null;
      return (await supabase.from("schools").select("*").eq("id", profile.school_id).maybeSingle()).data;
    },
  });

  // Liaison avec la Comptabilité (réservée à l'administration/direction/comptabilité : en cas d'erreur d'accès, la colonne est masquée).
  const { data: postedIds, isError: noAccounting } = useQuery({
    queryKey: ["payments-posted"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("revenues").select("payment_id").not("payment_id", "is", null).is("voided_at", null);
      if (error) throw error;
      return new Set<string>((data ?? []).map((r: any) => r.payment_id));
    },
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["payments-accounts"],
    retry: false,
    enabled: !noAccounting,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("accounting_balances");
      if (error) throw error;
      return (data ?? []) as Array<{ account_id: string; name: string; type: string; is_active?: boolean }>;
    },
  });
  const [postTarget, setPostTarget] = useState<PaymentRow | null>(null);
  const showAccounting = !noAccounting && !!postedIds;
  const isPosted = (id: string) => !!postedIds?.has(id);

  const pending = payments.filter((p: PaymentRow) => p.validation_status === "en_attente");
  const validated = payments.filter((p: PaymentRow) => p.validation_status === "validé");
  const totalRevenue = validated.reduce((s: number, p: PaymentRow) => s + Number(p.amount), 0);
  const toPost = validated.filter((p: PaymentRow) => Number(p.amount) > 0 && !isPosted(p.id));
  const toPostTotal = toPost.reduce((s: number, p: PaymentRow) => s + Number(p.amount), 0);
  const pendingTotal = pending.reduce((s: number, p: PaymentRow) => s + Number(p.amount), 0);

  const lateStudents = useMemo(
    () =>
      students
        .map((s: any) => {
          const paid = (s.payments ?? []).filter((p: any) => p.validation_status === "validé").reduce((sum: number, p: any) => sum + Number(p.amount), 0);
          const due = Number(s.classes?.annual_fee ?? 0);
          return { ...s, paid, due, remaining: due - paid, pct: due > 0 ? (paid / due) * 100 : 0 };
        })
        .filter((s: any) => s.due > 0 && s.pct < 50),
    [students],
  );

  const rows = (tab === "pending" ? pending : validated).filter((p: PaymentRow) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (p.receipt_number ?? "").toLowerCase().includes(q) ||
      (p.students?.full_name ?? "").toLowerCase().includes(q) ||
      (p.transaction_reference ?? "").toLowerCase().includes(q)
    );
  });

  async function validatePayment(p: PaymentRow) {
    const { data: uid } = await supabase.auth.getUser();
    const patch: any = { validation_status: "validé", validated_by: uid.user?.id, validated_at: new Date().toISOString() };
    if (!p.receipt_number) {
      const { data: rn, error: rnErr } = await supabase.rpc("next_receipt_number", { _school_id: p.school_id });
      if (rnErr) return toast.error(rnErr.message);
      patch.receipt_number = rn;
    }
    const { error } = await supabase.from("payments").update(patch).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Paiement validé", showAccounting ? { action: { label: "Comptabiliser", onClick: () => setPostTarget({ ...p, ...patch }) } } : undefined);
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["students-payments"] });
  }

  async function rejectPayment(p: PaymentRow) {
    const reason = window.prompt("Motif du rejet ?");
    if (!reason) return;
    const { data: uid } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("payments")
      .update({ validation_status: "rejeté", rejection_reason: reason, validated_by: uid.user?.id, validated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Paiement rejeté");
    qc.invalidateQueries({ queryKey: ["payments"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Paiements</h1>
          <p className="text-muted-foreground mt-1">
            Revenus validés : <span className="font-semibold text-foreground">{fmt(totalRevenue)} GNF</span>
            {pending.length > 0 && (
              <span className="ml-3 text-amber-600">
                • En attente : <span className="font-semibold">{fmt(pendingTotal)} GNF</span> ({pending.length})
              </span>
            )}
            {showAccounting && toPost.length > 0 && (
              <span className="ml-3 text-sky-700">
                • À comptabiliser : <span className="font-semibold">{fmt(toPostTotal)} GNF</span> ({toPost.length}){" "}
                <Link to="/comptabilite" className="underline">Ouvrir la comptabilité</Link>
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selected.size > 0 && (
            <>
              <Badge variant="secondary" className="self-center">{selected.size} sélectionné(s)</Badge>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Effacer</Button>
              {tab === "validated" && (
                <Button variant="outline" className="gap-2" onClick={() => printSelectedReceipts(rows.filter((p: PaymentRow) => selected.has(p.id)), school)}>
                  <Printer className="size-4" /> Imprimer reçus
                </Button>
              )}
            </>
          )}
          <Button variant="outline" className="gap-2" onClick={() => {
            const src = tab === "late" ? lateStudents : rows;
            const subset = selected.size > 0 ? src.filter((r: any) => selected.has(r.id)) : src;
            exportExcel(subset, tab);
          }} disabled={(tab === "late" ? lateStudents.length : rows.length) === 0}>
            <FileSpreadsheet className="size-4" /> Excel{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => {
            const subset = selected.size > 0 ? rows.filter((p: PaymentRow) => selected.has(p.id)) : rows;
            const lateSubset = selected.size > 0 ? lateStudents.filter((s: any) => selected.has(s.id)) : lateStudents;
            exportPdf(subset, tab, school, lateSubset);
          }} disabled={(tab === "late" ? lateStudents.length : rows.length) === 0}>
            <FileText className="size-4" /> PDF{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="size-4" />
                Nouveau paiement
              </Button>
            </DialogTrigger>
            <PaymentDialog students={students} onClose={() => { setOpen(false); qc.invalidateQueries(); }} />
          </Dialog>
        </div>
      </div>


      <div className="flex gap-2 border-b">
        <TabBtn active={tab === "pending"} onClick={() => { setTab("pending"); setSelected(new Set()); }} label={`En attente (${pending.length})`} icon={<Clock className="size-4" />} />
        <TabBtn active={tab === "validated"} onClick={() => { setTab("validated"); setSelected(new Set()); }} label={`Validés (${validated.length})`} icon={<CheckCircle2 className="size-4" />} />
        <TabBtn active={tab === "late"} onClick={() => { setTab("late"); setSelected(new Set()); }} label={`Retards (${lateStudents.length})`} icon={<AlertTriangle className="size-4" />} />
      </div>


      {tab !== "late" && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Rechercher (reçu, élève, référence)…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      <Card>
        <CardContent className="p-4 overflow-x-auto">
          {tab === "late" ? (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10"><input type="checkbox" checked={lateStudents.length > 0 && lateStudents.every((s: any) => selected.has(s.id))} onChange={(e) => setSelected(e.target.checked ? new Set(lateStudents.map((s: any) => s.id)) : new Set())} /></TableHead>
                <TableHead>Élève</TableHead><TableHead>Classe</TableHead><TableHead>Payé</TableHead><TableHead>Reste</TableHead><TableHead>Progression</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {lateStudents.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun retard</TableCell></TableRow>}
                {lateStudents.map((s: any) => (
                  <TableRow key={s.id} data-state={selected.has(s.id) ? "selected" : undefined}>
                    <TableCell><input type="checkbox" checked={selected.has(s.id)} onChange={(e) => { const n = new Set(selected); e.target.checked ? n.add(s.id) : n.delete(s.id); setSelected(n); }} /></TableCell>
                    <TableCell><div className="flex items-center gap-2"><AlertTriangle className="size-4 text-destructive" /><span className="font-medium">{s.full_name}</span></div></TableCell>
                    <TableCell>{s.classes?.name ?? "—"}</TableCell>
                    <TableCell>{fmt(s.paid)} GNF</TableCell>
                    <TableCell className="font-semibold text-destructive">{fmt(s.remaining)} GNF</TableCell>
                    <TableCell>
                      <div className="h-2 bg-muted rounded-full overflow-hidden w-32">
                        <div className="h-full bg-destructive" style={{ width: `${Math.min(100, s.pct)}%` }} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{s.pct.toFixed(0)}%</div>
                    </TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      <Button variant="ghost" size="icon" title="Imprimer" onClick={() => exportPdf([], "late", school, [s])}><Printer className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Télécharger Excel" onClick={() => exportExcel([s], "late")}><FileSpreadsheet className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Télécharger PDF" onClick={() => exportPdf([], "late", school, [s])}><FileText className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><input type="checkbox" checked={rows.length > 0 && rows.every((p: PaymentRow) => selected.has(p.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((p: PaymentRow) => p.id)) : new Set())} /></TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Reçu</TableHead>
                  <TableHead>Élève</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Méthode</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Montant</TableHead>
                  {showAccounting && <TableHead>Comptabilité</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Aucun paiement</TableCell></TableRow>}
                {rows.map((p: PaymentRow) => (
                  <TableRow key={p.id} data-state={selected.has(p.id) ? "selected" : undefined}>
                    <TableCell><input type="checkbox" checked={selected.has(p.id)} onChange={(e) => { const n = new Set(selected); e.target.checked ? n.add(p.id) : n.delete(p.id); setSelected(n); }} /></TableCell>
                    <TableCell className="text-sm">{new Date(p.paid_at).toLocaleDateString("fr-FR")}</TableCell>
                    <TableCell className="font-mono text-xs">{p.receipt_number ?? <span className="text-muted-foreground italic">à générer</span>}</TableCell>
                    <TableCell><div className="font-medium">{p.students?.full_name}</div><div className="text-xs text-muted-foreground">{p.students?.classes?.name}</div></TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{p.payment_type}</Badge></TableCell>
                    <TableCell className="text-sm">{p.payment_method}</TableCell>
                    <TableCell className="font-mono text-xs">{p.transaction_reference ?? "—"}</TableCell>
                    <TableCell className="font-semibold">{fmt(p.amount)} GNF</TableCell>
                    {showAccounting && (
                      <TableCell className="whitespace-nowrap">
                        {p.validation_status !== "validé" ? <span className="text-xs text-muted-foreground">Après validation</span>
                          : isPosted(p.id) ? <Badge variant="outline" className="gap-1 text-emerald-700"><Landmark className="size-3" />Comptabilisé</Badge>
                          : <Button size="sm" variant="outline" className="gap-1" onClick={() => setPostTarget(p)}><Landmark className="size-3.5" />Comptabiliser</Button>}
                      </TableCell>
                    )}
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      {p.validation_status === "en_attente" ? (
                        <>
                          <Button size="sm" variant="default" className="gap-1" onClick={() => validatePayment(p)}><CheckCircle2 className="size-3.5" />Valider</Button>
                          <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => rejectPayment(p)}><XCircle className="size-3.5" />Rejeter</Button>
                        </>
                      ) : null}
                      <Button variant="ghost" size="icon" title="Imprimer le reçu" onClick={() => p.receipt_number ? printReceipt(p, school) : exportPdf([p], tab, school, [])}><Printer className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Télécharger Excel" onClick={() => exportExcel([p], tab)}><FileSpreadsheet className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Télécharger PDF" onClick={() => exportPdf([p], tab, school, [])}><FileText className="size-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

        </CardContent>
      </Card>
      <PostPaymentDialog payment={postTarget} accounts={accounts} onClose={() => setPostTarget(null)} onDone={() => { setPostTarget(null); qc.invalidateQueries({ queryKey: ["payments-posted"] }); qc.invalidateQueries({ queryKey: ["acc"] }); }} />
    </div>
  );
}

/** Choix du compte puis écriture de la recette correspondante en Comptabilité (une seule fois par paiement). */
function defaultAccountFor(method: string, accounts: Array<{ account_id: string; name: string; type: string; is_active?: boolean }>) {
  const wanted: Record<string, string[]> = {
    "espèces": ["caisse"], "Orange Money": ["orange_money", "mobile_money"], "MTN MoMo": ["mtn_momo", "mobile_money"],
    "virement": ["banque"], "chèque": ["banque", "caisse"], "PayPal": ["banque"], "Stripe": ["banque"],
  };
  const list = accounts.filter((a) => a.is_active !== false);
  for (const t of wanted[method] ?? []) { const a = list.find((x) => x.type === t); if (a) return a.account_id; }
  return list[0]?.account_id ?? "";
}
function PostPaymentDialog({ payment, accounts, onClose, onDone }: { payment: PaymentRow | null; accounts: Array<{ account_id: string; name: string; type: string; is_active?: boolean }>; onClose: () => void; onDone: () => void }) {
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const open = !!payment;
  const chosen = accountId || (payment ? defaultAccountFor(payment.payment_method, accounts) : "");
  async function post() {
    if (!payment || !chosen || busy) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc("post_payment_to_revenue", { _payment_id: payment.id, _account_id: chosen });
    setBusy(false);
    if (error) return void toast.error(error.message === "ALREADY_POSTED" ? "Ce paiement est déjà comptabilisé." : error.message === "PAYMENT_NOT_VALIDATED" ? "Le paiement doit d'abord être validé." : error.message);
    toast.success("Paiement comptabilisé"); setAccountId(""); onDone();
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setAccountId(""); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Comptabiliser ce paiement</DialogTitle>
          <DialogDescription>{payment ? `${payment.students?.full_name ?? "Élève"} — ${fmt(Number(payment.amount))} GNF (${payment.payment_method})` : ""}. Une recette sera créée dans le compte choisi ; son solde augmentera.</DialogDescription>
        </DialogHeader>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun compte financier. Créez d'abord vos comptes dans <Link to="/comptabilite" className="underline">Comptabilité</Link> (bouton « Comptes usuels »).</p>
        ) : (
          <div><Label>Compte qui reçoit l'argent</Label>
            <Select value={chosen} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
              <SelectContent>{accounts.filter((a) => a.is_active !== false).map((a) => <SelectItem key={a.account_id} value={a.account_id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter><Button onClick={post} disabled={busy || !chosen}>Comptabiliser</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TabBtn({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button onClick={onClick} className={"flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition " + (active ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
      {icon}
      {label}
    </button>
  );
}

function PaymentDialog({ students, onClose }: any) {
  const [form, setForm] = useState({
    student_id: "",
    amount: 0,
    payment_type: "scolarite",
    period: "",
    payment_method: "espèces",
    transaction_reference: "",
    notes: "",
    validation_status: "validé" as "validé" | "en_attente",
  });
  const [saving, setSaving] = useState(false);
  const needsRef = METHOD_NEEDS_REF.has(form.payment_method);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.student_id || form.amount <= 0) return toast.error("Élève et montant obligatoires");
    if (needsRef && !form.transaction_reference.trim()) return toast.error("Référence de transaction requise pour ce moyen de paiement");
    setSaving(true);
    try {
      const { data: uid } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("school_id").eq("id", uid.user!.id).maybeSingle();
      const school_id = profile?.school_id;
      if (!school_id) return toast.error("École introuvable");

      const payload: any = {
        student_id: form.student_id,
        amount: form.amount,
        payment_type: form.payment_type,
        period: form.period || null,
        payment_method: form.payment_method,
        transaction_reference: form.transaction_reference || null,
        notes: form.notes || null,
        validation_status: form.validation_status,
        status: form.validation_status === "validé" ? "payé" : "en_attente",
      };
      if (form.validation_status === "validé") {
        const { data: rn, error: rnErr } = await supabase.rpc("next_receipt_number", { _school_id: school_id });
        if (rnErr) throw rnErr;
        payload.receipt_number = rn;
        payload.validated_by = uid.user?.id;
        payload.validated_at = new Date().toISOString();
      }
      const { error } = await supabase.from("payments").insert(payload);
      if (error) throw error;
      toast.success(form.validation_status === "validé" ? "Paiement enregistré et validé" : "Paiement soumis pour validation");
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>Enregistrer un paiement</DialogTitle>
        <DialogDescription>Le numéro de reçu est généré automatiquement à la validation.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label>Élève *</Label>
          <Select value={form.student_id} onValueChange={(v) => setForm({ ...form, student_id: v })}>
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>{students.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.full_name} — {s.matricule}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Montant (GNF) *</Label><Input type="number" required min={1} value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
          <div>
            <Label>Type</Label>
            <Select value={form.payment_type} onValueChange={(v) => setForm({ ...form, payment_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["inscription", "scolarite", "cantine", "transport", "autre"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Période</Label><Input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="ex. Octobre 2025" /></div>
          <div>
            <Label>Moyen de paiement</Label>
            <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v, transaction_reference: METHOD_NEEDS_REF.has(v) ? form.transaction_reference : "" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {needsRef && (
          <div>
            <Label>Référence de transaction *</Label>
            <Input required value={form.transaction_reference} onChange={(e) => setForm({ ...form, transaction_reference: e.target.value })} placeholder="ex. OM-8734512 ou ID PayPal" />
            <p className="text-xs text-muted-foreground mt-1">Numéro fourni par {form.payment_method} pour vérification.</p>
          </div>
        )}
        <div>
          <Label>Notes</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div>
          <Label>Statut initial</Label>
          <Select value={form.validation_status} onValueChange={(v: any) => setForm({ ...form, validation_status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="validé">Validé immédiatement (paiement confirmé)</SelectItem>
              <SelectItem value="en_attente">En attente de validation par le comptable</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

async function printReceipt(p: any, school: any) {
  if (!p.receipt_number) return toast.error("Le reçu n'est pas encore validé");
  const verifyUrl = `${window.location.origin}/verifier-recu/${encodeURIComponent(p.receipt_number)}`;
  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 140, margin: 1 });
  } catch { /* ignore */ }

  // Validator name
  let validatorName = "—";
  if (p.validated_by) {
    const { data } = await supabase.from("profiles").select("full_name").eq("id", p.validated_by).maybeSingle();
    validatorName = data?.full_name ?? "—";
  }

  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  const schoolName = school?.name ?? "MBGEduGuinée";
  const schoolAddress = school?.address ?? "";
  const schoolPhone = school?.phone ?? "";
  const schoolEmail = school?.email ?? "";
  const logo = await signIfPath(school?.logo_url);
  const stamp = await signIfPath(school?.school_stamp_url);
  const signature = await signIfPath(school?.director_signature_url);
  const directorName = school?.director_name ?? "Le Directeur";
  const accent = school?.receipt_accent_color || "#2a5a3e";
  const receiptTitle = school?.receipt_title || "REÇU DE PAIEMENT";
  const receiptHeader = school?.receipt_header || "";
  const legalNotice = school?.receipt_legal_notice || "";
  const footerNote = school?.receipt_footer_note || "Reçu généré électroniquement — vérifiable en ligne via QR code.";

  w.document.write(`
<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reçu ${p.receipt_number}</title>
<style>
  @page { size: A5; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #1f2937; margin: 0; padding: 24px; }
  .header { display: flex; align-items: center; gap: 16px; border-bottom: 3px double ${accent}; padding-bottom: 12px; }
  .header img.logo { height: 64px; width: 64px; object-fit: contain; }
  .header .school { flex: 1; }
  .header h1 { margin: 0; color: ${accent}; font-size: 20px; }
  .header .addr { font-size: 11px; color: #555; margin-top: 2px; }
  .title { text-align: center; margin: 18px 0 8px; font-weight: 700; font-size: 15px; letter-spacing: 3px; color: ${accent}; }
  .subtitle { text-align: center; font-family: monospace; font-size: 13px; margin-bottom: 12px; color: #555; }
  .box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 18px; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e5e7eb; font-size: 13px; }
  .row:last-child { border: none; }
  .row strong { color: #444; }
  .total { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding: 12px 18px; background: ${accent}14; border-radius: 8px; }
  .total .label { font-weight: 600; }
  .total .value { font-size: 20px; font-weight: 700; color: ${accent}; }
  .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 26px; gap: 16px; }
  .sig { text-align: center; flex: 1; }
  .sig .name { font-size: 11px; color: #555; }
  .sig img { max-height: 55px; max-width: 140px; object-fit: contain; margin-bottom: 4px; }
  .sig .line { border-top: 1px solid #333; margin-top: 40px; padding-top: 3px; font-size: 11px; font-weight: 600; }
  .qr { text-align: center; }
  .qr img { width: 90px; height: 90px; }
  .qr .cap { font-size: 9px; color: #666; margin-top: 3px; max-width: 100px; }
  .stamp { position: absolute; opacity: .55; }
  .note { margin-top: 14px; font-size: 10px; color: #888; text-align: center; font-style: italic; }
  @media print { .no-print { display: none; } }
  .toolbar { position: fixed; top: 0; left: 0; right: 0; background: ${accent}; color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; z-index: 9999; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
  .toolbar .title { font-size: 13px; font-weight: 600; }
  .toolbar button { background: #fff; color: ${accent}; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; }
  .toolbar button.secondary { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.5); }
  .toolbar button:hover { opacity: .9; }
  .rheader { text-align: center; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 2px; padding-bottom: 8px; margin-bottom: 8px; border-bottom: 1px dashed #ddd; }
  .legal { margin-top: 10px; font-size: 9.5px; color: #666; text-align: center; font-style: italic; border-top: 1px solid #eee; padding-top: 6px; }
  body { padding-top: 70px !important; }
  @media print { .no-print, .toolbar { display: none !important; } body { padding-top: 24px !important; } }
</style>
</head><body>
  <div class="toolbar no-print">
    <span class="title">Aperçu du reçu — vérifiez avant d'imprimer</span>
    <div>
      <button class="secondary" onclick="window.close()">Fermer</button>
      <button onclick="window.print()">🖨️ Imprimer</button>
    </div>
  </div>
  ${receiptHeader ? `<div class="rheader">${escapeHtml(receiptHeader)}</div>` : ""}
  <div class="header">
    ${logo ? `<img class="logo" src="${logo}" alt="Logo" />` : ""}
    <div class="school">
      <h1>${escapeHtml(schoolName)}</h1>
      ${schoolAddress ? `<div class="addr">${escapeHtml(schoolAddress)}</div>` : ""}
      <div class="addr">${[schoolPhone, schoolEmail].filter(Boolean).map(escapeHtml).join(" • ")}</div>
    </div>
  </div>

  <div class="title">${escapeHtml(receiptTitle)}</div>
  <div class="subtitle">N° ${escapeHtml(p.receipt_number)}</div>


  <div class="box">
    <div class="row"><strong>Date</strong><span>${new Date(p.paid_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}</span></div>
    <div class="row"><strong>Élève</strong><span>${escapeHtml(p.students?.full_name ?? "")}</span></div>
    <div class="row"><strong>Matricule</strong><span>${escapeHtml(p.students?.matricule ?? "—")}</span></div>
    <div class="row"><strong>Classe</strong><span>${escapeHtml(p.students?.classes?.name ?? "—")}</span></div>
    <div class="row"><strong>Type de paiement</strong><span style="text-transform:capitalize">${escapeHtml(p.payment_type)}</span></div>
    ${p.period ? `<div class="row"><strong>Période</strong><span>${escapeHtml(p.period)}</span></div>` : ""}
    <div class="row"><strong>Moyen de paiement</strong><span>${escapeHtml(p.payment_method ?? "—")}</span></div>
    ${p.transaction_reference ? `<div class="row"><strong>Référence transaction</strong><span style="font-family:monospace">${escapeHtml(p.transaction_reference)}</span></div>` : ""}
  </div>

  <div class="total">
    <span class="label">Montant total payé</span>
    <span class="value">${fmt(Number(p.amount))} GNF</span>
  </div>

  <div class="footer">
    <div class="sig">
      ${qrDataUrl ? `<div class="qr"><img src="${qrDataUrl}" alt="QR" /><div class="cap">Scannez pour vérifier l'authenticité</div></div>` : ""}
    </div>
    <div class="sig">
      ${stamp ? `<img src="${stamp}" alt="Cachet" />` : ""}
      <div class="line">Cachet de l'école</div>
    </div>
    <div class="sig">
      ${signature ? `<img src="${signature}" alt="Signature" />` : ""}
      <div class="line">${escapeHtml(directorName)}</div>
      <div class="name">Validé par : ${escapeHtml(validatorName)}</div>
    </div>
  </div>

  ${legalNotice ? `<div class="legal">${escapeHtml(legalNotice)}</div>` : ""}
  <div class="note">${escapeHtml(footerNote)}</div>

</body></html>
  `);
  w.document.close();
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function signIfPath(val?: string | null): Promise<string> {
  if (!val) return "";
  if (val.startsWith("http") || val.startsWith("data:") || val.startsWith("blob:")) return val;
  const { data } = await supabase.storage.from("school-assets").createSignedUrl(val, 3600);
  return data?.signedUrl ?? "";
}

function exportExcel(rows: any[], tab: "pending" | "validated" | "late") {
  const today = new Date().toISOString().slice(0, 10);
  let sheetData: any[];
  let sheetName: string;
  if (tab === "late") {
    sheetData = rows.map((s: any) => ({
      Élève: s.full_name,
      Matricule: s.matricule,
      Classe: s.classes?.name ?? "",
      "Frais annuels (GNF)": s.due,
      "Payé (GNF)": s.paid,
      "Reste (GNF)": s.remaining,
      "Progression %": Number(s.pct.toFixed(1)),
    }));
    sheetName = "Retards";
  } else {
    sheetData = rows.map((p: any) => ({
      Date: new Date(p.paid_at).toLocaleDateString("fr-FR"),
      "N° Reçu": p.receipt_number ?? "",
      Élève: p.students?.full_name ?? "",
      Matricule: p.students?.matricule ?? "",
      Classe: p.students?.classes?.name ?? "",
      Type: p.payment_type,
      Période: p.period ?? "",
      Méthode: p.payment_method ?? "",
      Référence: p.transaction_reference ?? "",
      "Montant (GNF)": Number(p.amount),
      Statut: p.validation_status,
    }));
    sheetName = tab === "pending" ? "En attente" : "Validés";
  }
  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `paiements-${sheetName.toLowerCase().replace(/\s+/g, "-")}-${today}.xlsx`);
}

async function exportPdf(rows: any[], tab: "pending" | "validated" | "late", school: any, lateStudents: any[]) {
  const signedLogo = await signIfPath(school?.logo_url);
  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) return;
  const title = tab === "late" ? "Liste des retards de paiement" : tab === "pending" ? "Paiements en attente" : "Registre des paiements validés";
  const schoolName = school?.name ?? "MBGEduGuinée";
  const schoolAddress = school?.address ?? "";
  const logo = signedLogo || "";
  const today = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  let head = "";
  let body = "";
  let totalRow = "";
  if (tab === "late") {
    head = `<tr><th>Élève</th><th>Matricule</th><th>Classe</th><th>Frais</th><th>Payé</th><th>Reste</th><th>%</th></tr>`;
    body = lateStudents.map((s: any) => `<tr>
      <td>${escapeHtml(s.full_name)}</td>
      <td>${escapeHtml(s.matricule ?? "")}</td>
      <td>${escapeHtml(s.classes?.name ?? "")}</td>
      <td class="num">${fmt(s.due)}</td>
      <td class="num">${fmt(s.paid)}</td>
      <td class="num" style="color:#b91c1c;font-weight:600">${fmt(s.remaining)}</td>
      <td class="num">${s.pct.toFixed(0)}%</td>
    </tr>`).join("");
  } else {
    head = `<tr><th>Date</th><th>Reçu</th><th>Élève</th><th>Classe</th><th>Type</th><th>Méthode</th><th>Référence</th><th class="num">Montant (GNF)</th></tr>`;
    const total = rows.reduce((s: number, p: any) => s + Number(p.amount), 0);
    body = rows.map((p: any) => `<tr>
      <td>${new Date(p.paid_at).toLocaleDateString("fr-FR")}</td>
      <td class="mono">${escapeHtml(p.receipt_number ?? "—")}</td>
      <td>${escapeHtml(p.students?.full_name ?? "")}</td>
      <td>${escapeHtml(p.students?.classes?.name ?? "")}</td>
      <td>${escapeHtml(p.payment_type)}</td>
      <td>${escapeHtml(p.payment_method ?? "")}</td>
      <td class="mono">${escapeHtml(p.transaction_reference ?? "—")}</td>
      <td class="num">${fmt(Number(p.amount))}</td>
    </tr>`).join("");
    totalRow = `<tr class="total"><td colspan="7" style="text-align:right">TOTAL</td><td class="num">${fmt(total)} GNF</td></tr>`;
  }

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: system-ui, sans-serif; color: #1f2937; margin: 0; padding: 20px; }
  .header { display: flex; align-items: center; gap: 14px; border-bottom: 2px solid #2a5a3e; padding-bottom: 10px; margin-bottom: 14px; }
  .header img { height: 56px; width: 56px; object-fit: contain; }
  .header h1 { margin: 0; color: #2a5a3e; font-size: 18px; }
  .header .sub { font-size: 11px; color: #555; }
  .title { text-align: center; font-size: 15px; font-weight: 700; margin: 10px 0 14px; color: #2a5a3e; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
  th { background: #f0f9f4; color: #2a5a3e; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .mono { font-family: ui-monospace, monospace; font-size: 10px; }
  .total td { background: #f0f9f4; font-weight: 700; font-size: 12px; }
  .watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
  .watermark img { width: 45%; max-width: 340px; opacity: .06; }
  .content { position: relative; z-index: 1; }
  .foot { margin-top: 16px; font-size: 10px; color: #666; display: flex; justify-content: space-between; }
  .toolbar { position: fixed; top: 0; left: 0; right: 0; background: #2a5a3e; color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; z-index: 9999; box-shadow: 0 2px 6px rgba(0,0,0,.15); }
  .toolbar .t-title { font-size: 13px; font-weight: 600; }
  .toolbar button { background: #fff; color: #2a5a3e; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; margin-left: 8px; }
  .toolbar button.secondary { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,.5); }
  body { padding-top: 70px; }
  @media print { .toolbar { display: none !important; } body { padding-top: 20px; } }
</style></head><body>
  <div class="toolbar">
    <span class="t-title">Aperçu avant impression — vérifiez avant d'imprimer</span>
    <div>
      <button class="secondary" onclick="window.close()">Fermer</button>
      <button onclick="window.print()">🖨️ Imprimer</button>
    </div>
  </div>
  ${logo ? `<div class="watermark"><img src="${logo}" alt="" /></div>` : ""}
  <div class="content">
  <div class="header">
    ${logo ? `<img src="${logo}" />` : ""}
    <div>
      <h1>${escapeHtml(schoolName)}</h1>
      <div class="sub">${escapeHtml(schoolAddress)}</div>
    </div>
  </div>
  <div class="title">${escapeHtml(title.toUpperCase())}</div>
  <table><thead>${head}</thead><tbody>${body || `<tr><td colspan="8" style="text-align:center;padding:20px;color:#888">Aucune donnée</td></tr>`}${totalRow}</tbody></table>
  <div class="foot"><span>Édité le ${today}</span><span>${escapeHtml(schoolName)}${schoolAddress ? " — " + escapeHtml(schoolAddress) : ""}</span></div>
  </div>
</body></html>`);
  w.document.close();
}

async function printSelectedReceipts(payments: any[], school: any) {
  const printable = payments.filter((p) => p.receipt_number);
  if (printable.length === 0) return toast.error("Aucun reçu validé à imprimer");
  if (printable.length < payments.length) toast.warning(`${payments.length - printable.length} paiement(s) sans numéro de reçu ignoré(s)`);
  for (const p of printable) {
    await printReceipt(p, school);
    await new Promise((r) => setTimeout(r, 400));
  }
}
