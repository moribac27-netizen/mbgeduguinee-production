import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Clock, XCircle, Loader2, Printer, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { usePerStudentPlan } from "@/hooks/usePerStudentPlan";
import { usePdfMeta } from "@/hooks/usePdfMeta";
import { formatGNF, ORANGE_MONEY, orangeMoneyUssdLink } from "@/lib/orange-money";
import { newCotisationReceiptNumber, printCotisationReceipt } from "@/lib/cotisation-print";
import { logActivity } from "@/lib/audit";
import { registerStudentPayment } from "@/lib/cotisation";

interface Props {
  studentId: string;
  studentName: string;
  matricule?: string | null;
  className?: string | null;
}

export function CotisationCard({ studentId, studentName, matricule, className }: Props) {
  const { info } = usePerStudentPlan();
  const meta = usePdfMeta("Cotisation annuelle");
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: payment, refetch } = useQuery({
    queryKey: ["student-cotisation", studentId, info.academicYear],
    enabled: !!studentId && !!info.academicYear && info.isPerStudent,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("student_plan_payments")
        .select("*")
        .eq("student_id", studentId)
        .eq("academic_year", info.academicYear)
        .maybeSingle();
      return data ?? null;
    },
  });

  if (!info.isPerStudent) return null;

  const status = payment?.status ?? null; // null | "en_attente" | "paye" | "rejeté"

  function receipt(row: any) {
    printCotisationReceipt(meta, {
      receiptNumber: row.receipt_number ?? "—",
      studentName,
      matricule,
      className,
      academicYear: row.academic_year,
      amount: Number(row.amount),
      schoolShare: Number(row.school_share),
      paidAt: row.paid_at,
      method: row.payment_method,
      reference: row.reference,
      mode: row.payment_mode,
    });
  }

  async function pay() {
    if (!info.schoolId) return toast.error("Établissement non identifié.");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const res = await registerStudentPayment({
      studentId,
      schoolId: info.schoolId,
      academicYear: info.academicYear,
      amount: info.unitPrice,
      schoolShare: info.schoolShare,
      reference: reference || null,
      paidBy: u.user?.id ?? null,
    });
    setSaving(false);

    if (res.status === "error") {
      toast.error("Enregistrement impossible", { description: res.error });
      return;
    }
    if (res.status === "already_paid") {
      setOpen(false);
      setReference("");
      toast.info("Paiement déjà validé");
      receipt(res.row);
      return;
    }
    if (res.status === "already_pending") {
      setOpen(false);
      setReference("");
      toast.info("Un paiement est déjà en attente de validation par l'école.");
      return;
    }

    setOpen(false);
    setReference("");
    toast.success("Paiement déclaré. Il sera actif dès validation par l'école.");
    await refetch();
    void logActivity({ action: "create", entity_type: "student_plan_payment", entity_id: res.row?.id ?? null, metadata: { mode: "individuel", reference } });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="size-4 text-primary" /> Cotisation annuelle {info.academicYear}
        </CardTitle>
        <CardDescription>
          {formatGNF(info.unitPrice)} par élève et par an. Sans cette cotisation validée, les notes, bulletins et
          documents de l'élève restent inaccessibles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "paye" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="gap-1"><CheckCircle2 className="size-3" /> Cotisation réglée</Badge>
            <span className="text-sm text-muted-foreground">Reçu n° {payment.receipt_number ?? "—"}</span>
            <Button variant="outline" size="sm" onClick={() => receipt(payment)}>
              <Printer className="size-4 mr-1" /> Imprimer le reçu
            </Button>
          </div>
        ) : status === "en_attente" ? (
          <div className="space-y-2">
            <Badge variant="secondary" className="gap-1"><Clock className="size-3" /> En attente de validation</Badge>
            <p className="text-sm text-muted-foreground">
              Votre paiement a été déclaré{payment.reference ? ` (référence ${payment.reference})` : ""} et sera
              activé dès vérification par l'école. Les notes et le bulletin restent verrouillés en attendant.
            </p>
          </div>
        ) : (
          <>
            {status === "rejeté" && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <Badge variant="destructive" className="gap-1 mb-1"><XCircle className="size-3" /> Paiement rejeté</Badge>
                <p className="text-muted-foreground">
                  {payment?.rejection_reason ? `Motif : ${payment.rejection_reason}` : "Motif non précisé."} Vous pouvez déclarer un nouveau paiement ci-dessous.
                </p>
              </div>
            )}
            {status !== "rejeté" && <Badge variant="destructive">Non payée</Badge>}
            <p className="text-sm text-muted-foreground">
              Payez {formatGNF(info.unitPrice)} par Orange Money au {ORANGE_MONEY.local} ({ORANGE_MONEY.holder}),
              puis déclarez le paiement ci-dessous. Il sera vérifié par l'école avant activation.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild><a href={orangeMoneyUssdLink()}>Composer {ORANGE_MONEY.ussd}</a></Button>
              <Button onClick={() => setOpen(true)}>Déclarer mon paiement</Button>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cotisation de {studentName}</DialogTitle>
            <DialogDescription>
              Montant : {formatGNF(info.unitPrice)} · Année {info.academicYear}. Indiquez la référence de la
              transaction Orange Money pour accélérer la vérification.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Référence de la transaction</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex. PP250901.1234.A56789" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={() => void pay()} disabled={saving}>
              {saving ? <><Loader2 className="size-4 mr-2 animate-spin" /> Envoi…</> : "Déclarer le paiement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}