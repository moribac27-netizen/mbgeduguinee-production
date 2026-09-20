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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, Clock, Coins, Loader2, Printer, Search, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import { usePerStudentPlan, usePaidStudentIds } from "@/hooks/usePerStudentPlan";
import { usePdfMeta } from "@/hooks/usePdfMeta";
import { formatGNF } from "@/lib/orange-money";
import { PER_STUDENT_SCHOOL_SHARE_GNF } from "@/lib/pricing";
import { newCotisationReceiptNumber, printCotisationReceipt } from "@/lib/cotisation-print";

export const Route = createFileRoute("/_authenticated/cotisations")({
  head: () => ({
    meta: [
      { title: "Cotisations des élèves — MBGEduGuinée" },
      { name: "description", content: "Suivi des cotisations annuelles par élève, paiement groupé et reversement à l'établissement." },
      { property: "og:title", content: "Cotisations des élèves — MBGEduGuinée" },
      { property: "og:description", content: "Paiement groupé des cotisations et suivi du reversement de l'école." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CotisationsPage,
});

function CotisationsPage() {
  const { info, loading, refetch } = usePerStudentPlan();
  const meta = usePdfMeta("Cotisations annuelles");
  const { paidIds, refetch: refetchPaid } = usePaidStudentIds(info.schoolId, info.academicYear, info.isPerStudent);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: students = [] } = useQuery({
    queryKey: ["cotisation-students"],
    queryFn: async () =>
      (await supabase.from("students").select("id, full_name, matricule, class_id, classes(name)").order("full_name")).data ?? [],
  });

  const { data: payments = [], refetch: refetchPayments } = useQuery({
    queryKey: ["cotisation-payments", info.schoolId, info.academicYear],
    enabled: !!info.schoolId && !!info.academicYear,
    queryFn: async () =>
      (await (supabase as any)
        .from("student_plan_payments")
        .select("*")
        .eq("school_id", info.schoolId)
        .eq("academic_year", info.academicYear)).data ?? [],
  });

  const byStudent = useMemo(() => {
    const m = new Map<string, any>();
    for (const p of payments as any[]) m.set(p.student_id, p);
    return m;
  }, [payments]);

  const pendingCount = (payments as any[]).filter((p) => p.status === "en_attente").length;

  const filtered = (students as any[]).filter((s) =>
    [s.full_name, s.matricule].some((v: string) => v?.toLowerCase().includes(search.toLowerCase())),
  );
  // Sélectionnable pour l'encaissement groupé : pas déjà payé, et pas de déclaration en attente à traiter d'abord
  const unpaidSelectable = filtered.filter((s) => {
    const row = byStudent.get(s.id);
    return !paidIds.has(s.id) && row?.status !== "en_attente";
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function payGroup() {
    if (!info.schoolId || selected.size === 0) return;
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const rows = Array.from(selected).map((sid) => ({
      school_id: info.schoolId,
      student_id: sid,
      academic_year: info.academicYear,
      amount: info.unitPrice,
      school_share: info.schoolShare,
      status: "paye",
      payment_mode: "groupe_ecole",
      payment_method: "espece",
      receipt_number: newCotisationReceiptNumber(info.academicYear),
      paid_by: u.user?.id ?? null,
      validated_by: u.user?.id ?? null,
      validated_at: new Date().toISOString(),
    }));
    const { error } = await (supabase as any).from("student_plan_payments").insert(rows);
    setSaving(false);
    setConfirm(false);
    if (error) return toast.error("Enregistrement impossible", { description: error.message });
    toast.success(`${rows.length} cotisation(s) enregistrée(s)`);
    setSelected(new Set());
    await Promise.all([refetch(), refetchPaid(), refetchPayments()]);
  }

  async function validatePending(row: any) {
    const { data: u } = await supabase.auth.getUser();
    const receipt_number = row.receipt_number ?? newCotisationReceiptNumber(row.academic_year);
    const { error } = await (supabase as any)
      .from("student_plan_payments")
      .update({
        status: "paye",
        receipt_number,
        validated_by: u.user?.id,
        validated_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Cotisation validée");
    await Promise.all([refetch(), refetchPaid(), refetchPayments()]);
  }

  async function rejectPending(row: any) {
    const reason = window.prompt("Motif du rejet ?");
    if (!reason) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await (supabase as any)
      .from("student_plan_payments")
      .update({ status: "rejeté", rejection_reason: reason, validated_by: u.user?.id, validated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Cotisation rejetée");
    await Promise.all([refetch(), refetchPaid(), refetchPayments()]);
  }

  function receipt(student: any, row: any) {
    printCotisationReceipt(meta, {
      receiptNumber: row.receipt_number ?? "—",
      studentName: student.full_name,
      matricule: student.matricule,
      className: student.classes?.name ?? null,
      academicYear: row.academic_year,
      amount: Number(row.amount),
      schoolShare: Number(row.school_share),
      paidAt: row.paid_at,
      method: row.payment_method,
      reference: row.reference,
      mode: row.payment_mode,
    });
  }

  if (loading) return <div className="h-40 animate-pulse bg-muted rounded" />;

  if (!info.isPerStudent) {
    return (
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Cotisations des élèves</CardTitle>
          <CardDescription>
            Votre établissement est sur une offre à prix fixe. Cet écran ne concerne que les écoles ayant
            choisi le mode de facturation par élève.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const progress = Math.min(100, Math.round((info.paidCount / Math.max(1, info.threshold)) * 100));
  const schoolShare = Number(info.schoolShare ?? PER_STUDENT_SCHOOL_SHARE_GNF);

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="font-display text-3xl font-bold">Cotisations des élèves</h1>
        <p className="text-muted-foreground mt-1">
          Année {info.academicYear} · {formatGNF(info.unitPrice)} par élève et par an
        </p>
      </div>

      <div className="grid sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="size-4 text-primary" /> Élèves à jour</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{info.paidCount}<span className="text-base text-muted-foreground"> / {info.threshold}</span></div>
            <div className="h-2 rounded-full bg-muted mt-3 overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {info.unlocked ? "Accès complet activé." : `Encore ${info.threshold - info.paidCount} élève(s) pour activer l'accès complet.`}
            </p>
          </CardContent>
        </Card>
        <Card className={pendingCount > 0 ? "border-amber-500/40" : undefined}>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="size-4 text-amber-600" /> En attente de validation</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground mt-2">Paiements déclarés par les familles, à vérifier ci-dessous.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Coins className="size-4 text-primary" /> Reversement à l'école</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatGNF(info.schoolRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {info.paidCount} élève(s) × {formatGNF(schoolShare)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Élèves sans cotisation</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{Math.max(0, (students as any[]).length - info.paidCount)}</div>
            <p className="text-xs text-muted-foreground mt-2">Leurs notes et documents restent verrouillés.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Élèves</CardTitle>
            <CardDescription>
              Validez les paiements déclarés par les familles, ou cochez les élèves dont l'école a encaissé la cotisation en direct.
            </CardDescription>
          </div>
          <Button disabled={selected.size === 0} onClick={() => setConfirm(true)}>
            Encaisser {selected.size > 0 ? `${selected.size} élève(s)` : ""}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Rechercher un élève…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={unpaidSelectable.length > 0 && unpaidSelectable.every((s) => selected.has(s.id))}
                      onCheckedChange={(v) =>
                        setSelected(v ? new Set(unpaidSelectable.map((s) => s.id)) : new Set())
                      }
                    />
                  </TableHead>
                  <TableHead>Matricule</TableHead>
                  <TableHead>Élève</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun élève</TableCell></TableRow>
                )}
                {filtered.map((s: any) => {
                  const row = byStudent.get(s.id);
                  const isPaid = paidIds.has(s.id);
                  const isPending = row?.status === "en_attente";
                  const isRejected = row?.status === "rejeté";
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Checkbox
                          disabled={isPaid || isPending}
                          checked={selected.has(s.id)}
                          onCheckedChange={() => toggle(s.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.matricule}</TableCell>
                      <TableCell className="font-medium">{s.full_name}</TableCell>
                      <TableCell>{s.classes?.name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row?.reference ?? "—"}</TableCell>
                      <TableCell>
                        {isPaid ? (
                          <Badge className="gap-1"><CheckCircle2 className="size-3" /> Payée</Badge>
                        ) : isPending ? (
                          <Badge variant="secondary" className="gap-1"><Clock className="size-3" /> En attente</Badge>
                        ) : isRejected ? (
                          <Badge variant="destructive" className="gap-1" title={row?.rejection_reason ?? ""}><XCircle className="size-3" /> Rejetée</Badge>
                        ) : (
                          <Badge variant="outline">Non payée</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        {isPending ? (
                          <>
                            <Button size="sm" className="gap-1" onClick={() => validatePending(row)}><CheckCircle2 className="size-3.5" />Valider</Button>
                            <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => rejectPending(row)}><XCircle className="size-3.5" />Rejeter</Button>
                          </>
                        ) : row && isPaid ? (
                          <Button variant="ghost" size="icon" title="Imprimer le reçu" onClick={() => receipt(s, row)}>
                            <Printer className="size-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l'encaissement groupé</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.size} élève(s) × {formatGNF(info.unitPrice)} = {formatGNF(selected.size * info.unitPrice)}.
              Part revenant à l'école : {formatGNF(selected.size * info.schoolShare)}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); void payGroup(); }}>
              {saving ? <><Loader2 className="size-4 mr-2 animate-spin" /> Enregistrement…</> : "Confirmer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}