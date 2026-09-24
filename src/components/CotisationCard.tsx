import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Clock, XCircle, Loader2, Printer, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { usePerStudentPlan } from "@/hooks/usePerStudentPlan";
import { usePdfMeta } from "@/hooks/usePdfMeta";
import { formatGNF, ORANGE_MONEY, orangeMoneyUssdLink } from "@/lib/orange-money";
import { printCotisationReceipt } from "@/lib/cotisation-print";
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
  const [payerPhone, setPayerPhone] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const { data: payment, refetch } = useQuery({
    queryKey: ["student-cotisation", studentId, info.academicYear],
    enabled: !!studentId && !!info.academicYear,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("student_plan_payments")
        .select("*")
        .eq("student_id", studentId)
        .eq("academic_year", info.academicYear)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

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
    if (!reference.trim()) return toast.error("La référence de transaction est obligatoire.");
    setSaving(true);
    const res = await registerStudentPayment({
      studentId,
      reference: reference.trim(),
      transferDate: transferDate ? new Date(`${transferDate}T12:00:00`).toISOString() : null,
      payerPhone: payerPhone.trim() || null,
    });
    setSaving(false);
    if (res.status === "error") return toast.error("Enregistrement impossible", { description: res.error });
    setOpen(false);
    setReference("");
    setPayerPhone("");
    toast.success("Paiement déclaré. Il sera actif uniquement après validation.");
    await refetch();
  }

  const status = payment?.status ?? null;
  const canDeclare = status !== "VALIDATED" && status !== "AWAITING_VALIDATION";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="size-4 text-primary" /> Cotisation annuelle {info.academicYear}
        </CardTitle>
        <CardDescription>
          {formatGNF(info.unitPrice)} par élève et par an. La référence Orange Money est une déclaration, jamais une preuve automatique.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === "VALIDATED" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="gap-1"><CheckCircle2 className="size-3" /> Cotisation validée</Badge>
            <span className="text-sm text-muted-foreground">Reçu n° {payment.receipt_number ?? "—"}</span>
            <Button variant="outline" size="sm" onClick={() => receipt(payment)}><Printer className="size-4 mr-1" /> Imprimer le reçu</Button>
          </div>
        ) : status === "AWAITING_VALIDATION" ? (
          <div className="space-y-2">
            <Badge variant="secondary" className="gap-1"><Clock className="size-3" /> En attente de validation</Badge>
            <p className="text-sm text-muted-foreground">Référence {payment.reference}. Le dossier reste verrouillé tant que la cotisation n'est pas VALIDATED.</p>
          </div>
        ) : (
          <>
            {status === "REJECTED" && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <Badge variant="destructive" className="gap-1 mb-1"><XCircle className="size-3" /> Paiement rejeté</Badge>
                <p className="text-muted-foreground">{payment?.rejection_reason ? `Motif : ${payment.rejection_reason}` : "Motif non précisé."}</p>
              </div>
            )}
            <Badge variant="destructive">Cotisation non validée</Badge>
            <p className="text-sm text-muted-foreground">
              Transférez {formatGNF(info.unitPrice)} par Orange Money au <strong>{ORANGE_MONEY.local}</strong> — {ORANGE_MONEY.holder} — puis déclarez la référence.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild><a href={orangeMoneyUssdLink()}>Composer {ORANGE_MONEY.ussd}</a></Button>
              {canDeclare && <Button onClick={() => setOpen(true)}>Déclarer mon paiement</Button>}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cotisation de {studentName}</DialogTitle>
            <DialogDescription>
              Montant fixe : {formatGNF(info.unitPrice)}. Le serveur contrôlera l'élève, l'école et le montant avant création.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Référence de transaction *</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Référence Orange Money" /></div>
            <div><Label>Numéro Orange Money utilisé</Label><Input value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} placeholder="Ex. 62 12 34 56 78" inputMode="tel" /></div>
            <div><Label>Date du transfert</Label><Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">La saisie de ces informations ne valide pas le paiement. Une vérification par un utilisateur autorisé est obligatoire.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annuler</Button>
            <Button onClick={() => void pay()} disabled={saving}>{saving ? <><Loader2 className="size-4 mr-2 animate-spin" /> Envoi…</> : "Déclarer le paiement"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
