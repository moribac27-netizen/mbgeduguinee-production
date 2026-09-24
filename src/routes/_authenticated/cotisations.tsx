import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CheckCircle2, Clock, Coins, Loader2, Printer, Search, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { usePerStudentPlan, usePaidStudentIds } from "@/hooks/usePerStudentPlan";
import { usePdfMeta } from "@/hooks/usePdfMeta";
import { formatGNF, ORANGE_MONEY, orangeMoneyUssdLink } from "@/lib/orange-money";
import { printCotisationReceipt } from "@/lib/cotisation-print";

export const Route = createFileRoute("/_authenticated/cotisations")({
  head: () => ({ meta: [
    { title: "Cotisations annuelles — MBGEduGuinée" },
    { name: "description", content: "Cotisation annuelle unique par élève, vérification Orange Money et progression vers 20 cotisations validées." },
  ] }),
  component: CotisationsPage,
});

function CotisationsPage() {
  const { info, loading, refetch } = usePerStudentPlan();
  const meta = usePdfMeta("Cotisations annuelles");
  const { paidIds, refetch: refetchPaid } = usePaidStudentIds(info.schoolId, info.academicYear);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reference, setReference] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: students = [], refetch: refetchStudents } = useQuery({
    queryKey: ["cotisation-students", info.schoolId],
    enabled: !!info.schoolId,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id, full_name, matricule, class_id, school_id, classes(name)").eq("school_id", info.schoolId).order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payments = [], refetch: refetchPayments } = useQuery({
    queryKey: ["cotisation-payments", info.schoolId, info.academicYear],
    enabled: !!info.schoolId && !!info.academicYear,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("student_plan_payments").select("*").eq("school_id", info.schoolId).eq("academic_year", info.academicYear).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const byStudent = useMemo(() => new Map((payments as any[]).map((p) => [p.student_id, p])), [payments]);
  const pendingCount = (payments as any[]).filter((p) => ["INITIATED", "PENDING_VERIFICATION", "AWAITING_VALIDATION"].includes(p.status)).length;
  const filtered = (students as any[]).filter((s) => [s.full_name, s.matricule].some((v: string) => v?.toLowerCase().includes(search.toLowerCase())));
  const unpaidSelectable = filtered.filter((s) => !paidIds.has(s.id) && !["INITIATED", "PENDING_VERIFICATION", "AWAITING_VALIDATION"].includes(byStudent.get(s.id)?.status));

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function declareGroup() {
    if (!info.schoolId || selected.size === 0 || !reference.trim()) return toast.error("Sélectionnez au moins un élève et saisissez la référence Orange Money.");
    setSaving(true);
    const { data, error } = await (supabase as any).rpc("declare_cotisation_group_payment", {
      _student_ids: Array.from(selected),
      _reference: reference.trim(),
      _transfer_date: transferDate ? new Date(`${transferDate}T12:00:00`).toISOString() : null,
      _payer_phone: payerPhone.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error("Déclaration impossible", { description: error.message });
    setConfirm(false); setSelected(new Set()); setReference(""); setPayerPhone("");
    toast.success(`${selected.size} cotisation(s) déclarée(s) — montant serveur : ${formatGNF(selected.size * info.unitPrice)}`);
    void data;
    await Promise.all([refetch(), refetchPaid(), refetchPayments(), refetchStudents()]);
  }

  async function review(row: any, approve: boolean) {
    let reason: string | null = null;
    if (!approve) {
      reason = window.prompt("Motif du rejet ?")?.trim() || null;
      if (!reason) return;
    }
    const { error } = await (supabase as any).rpc("review_cotisation_payment", { _payment_id: row.id, _approve: approve, _reason: reason });
    if (error) return toast.error(error.message);
    toast.success(approve ? "Paiement validé" : "Paiement rejeté");
    await Promise.all([refetch(), refetchPaid(), refetchPayments()]);
  }

  function receipt(student: any, row: any) {
    printCotisationReceipt(meta, {
      receiptNumber: row.receipt_number ?? "—", studentName: student.full_name, matricule: student.matricule,
      className: student.classes?.name ?? null, academicYear: row.academic_year, amount: Number(row.amount),
      schoolShare: Number(row.school_share), paidAt: row.paid_at, method: row.payment_method,
      reference: row.reference, mode: row.payment_mode, status: row.status,
    });
  }

  if (loading) return <div className="h-40 animate-pulse bg-muted rounded" />;
  const progress = Math.min(100, Math.round((info.paidCount / Math.max(1, info.threshold)) * 100));

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="font-display text-3xl font-bold">Cotisations annuelles</h1><p className="text-muted-foreground mt-1">{info.academicYear} · {formatGNF(info.unitPrice)} par élève · Orange Money {ORANGE_MONEY.local}</p></div>
        <Button variant="outline" asChild><a href={orangeMoneyUssdLink()}>Composer {ORANGE_MONEY.ussd}</a></Button>
      </div>

      <Card className={info.unlocked ? "border-primary/30" : "border-amber-500/40"}>
        <CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><Users className="size-5" /> Accès école : {info.accessMode}</CardTitle><CardDescription>{info.paidCount}/{info.threshold} cotisations VALIDATED · {info.remaining} restante(s)</CardDescription></div><Badge variant={info.unlocked ? "default" : "secondary"}>{info.unlocked ? "FULL" : "RESTRICTED"}</Badge></div></CardHeader>
        <CardContent><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div><p className="text-sm text-muted-foreground mt-2">{info.unlocked ? "Le seuil global est atteint." : `Accès restreint — ${info.paidCount}/20 cotisations validées. Il reste ${info.remaining} élève(s) à valider.`}</p></CardContent>
      </Card>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Coins className="size-4" /> Part école</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{formatGNF(info.schoolRevenue)}</div><p className="text-xs text-muted-foreground">{info.paidCount} × {formatGNF(info.schoolShare)}</p></CardContent></Card>
        <Card className={pendingCount ? "border-amber-500/40" : undefined}><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="size-4" /> En attente</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{pendingCount}</div><p className="text-xs text-muted-foreground">Déclarations à vérifier.</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Élèves non validés</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{Math.max(0, (students as any[]).length - info.paidCount)}</div><p className="text-xs text-muted-foreground">Leurs dossiers restent verrouillés.</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Élèves et cotisations</CardTitle><CardDescription>Les paiements individuels et groupés passent par le même contrôle serveur.</CardDescription></div><Button disabled={selected.size === 0} onClick={() => setConfirm(true)}>Déclarer un paiement groupé {selected.size ? `(${selected.size})` : ""}</Button></CardHeader>
        <CardContent>
          <div className="relative mb-4"><Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Rechercher un élève…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-10"><Checkbox checked={unpaidSelectable.length > 0 && unpaidSelectable.every((s) => selected.has(s.id))} onCheckedChange={(v) => setSelected(v ? new Set(unpaidSelectable.map((s) => s.id)) : new Set())} /></TableHead><TableHead>Matricule</TableHead><TableHead>Élève</TableHead><TableHead>Classe</TableHead><TableHead>Référence</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
            {filtered.map((s: any) => {
              const row = byStudent.get(s.id); const isPaid = paidIds.has(s.id); const pending = ["INITIATED", "PENDING_VERIFICATION", "AWAITING_VALIDATION"].includes(row?.status); const rejected = row?.status === "REJECTED";
              return <TableRow key={s.id}><TableCell><Checkbox disabled={isPaid || pending} checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} /></TableCell><TableCell>{s.matricule ?? "—"}</TableCell><TableCell className="font-medium">{s.full_name}</TableCell><TableCell>{s.classes?.name ?? "—"}</TableCell><TableCell>{row?.reference ?? "—"}</TableCell><TableCell>{isPaid ? <Badge><CheckCircle2 className="size-3 mr-1" /> VALIDATED</Badge> : pending ? <Badge variant="secondary"><Clock className="size-3 mr-1" /> AWAITING_VALIDATION</Badge> : rejected ? <Badge variant="destructive"><XCircle className="size-3 mr-1" /> REJECTED</Badge> : <Badge variant="outline">NON VALIDÉE</Badge>}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-2">{pending && <><Button size="sm" onClick={() => void review(row, true)}><CheckCircle2 className="size-4 mr-1" /> Valider</Button><Button size="sm" variant="outline" onClick={() => void review(row, false)}><XCircle className="size-4 mr-1" /> Rejeter</Button></>}{isPaid && <Button size="sm" variant="ghost" onClick={() => receipt(s, row)}><Printer className="size-4" /></Button>}</div></TableCell></TableRow>;
            })}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun élève</TableCell></TableRow>}
          </TableBody></Table></div>
        </CardContent>
      </Card>

      <AlertDialog open={confirm} onOpenChange={setConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Déclarer le paiement groupé</AlertDialogTitle><AlertDialogDescription>{selected.size} élève(s) · montant serveur calculé : <strong>{formatGNF(selected.size * info.unitPrice)}</strong>. Le paiement sera en attente jusqu'à validation.</AlertDialogDescription></AlertDialogHeader><div className="space-y-3"><Input placeholder="Référence Orange Money *" value={reference} onChange={(e) => setReference(e.target.value)} /><Input placeholder="Numéro Orange Money utilisé" value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} /><Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} /></div><AlertDialogFooter><AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel><AlertDialogAction disabled={saving || !reference.trim()} onClick={(e) => { e.preventDefault(); void declareGroup(); }}>{saving ? <><Loader2 className="size-4 mr-2 animate-spin" /> Envoi…</> : "Déclarer"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
