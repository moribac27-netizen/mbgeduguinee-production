import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ADJUSTMENT_LABELS, feeAdjustmentErrorMessage } from "@/lib/fees";
import { getCurrentAcademicYear } from "@/lib/academic-year";

const fmt = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n));

interface StudentOption { id: string; full_name: string; matricule?: string | null; classes?: { name?: string | null; annual_fee?: number | string | null } | null }

/** Enregistrer ou annuler une réduction, une bourse ou une gratuité totale de frais de scolarité (direction et comptabilité). */
export function FeeAdjustmentDialog({ open, onOpenChange, students, initialStudentId }: {
  open: boolean; onOpenChange: (o: boolean) => void; students: StudentOption[]; initialStudentId?: string;
}) {
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState(initialStudentId ?? "");
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("reduction");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const student = students.find((s) => s.id === studentId);
  const fee = Number(student?.classes?.annual_fee ?? 0);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? students.filter((s) => `${s.full_name} ${s.matricule ?? ""}`.toLowerCase().includes(q)) : students;
    return list.slice(0, 30);
  }, [students, search]);

  const { data: history = [] } = useQuery({
    queryKey: ["fee-adjustments-student", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fee_adjustments")
        .select("id, kind, amount, reason, academic_year, created_at, voided_at, void_reason")
        .eq("student_id", studentId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const year = getCurrentAcademicYear();
  // Seules les réductions non annulées de l'année en cours viennent en déduction des frais annuels.
  const active = history.filter((h: any) => !h.voided_at && h.academic_year === year);
  const activeTotal = active.reduce((s: number, h: any) => s + Number(h.amount), 0);
  const remainingToCover = Math.max(fee - activeTotal, 0);

  const refresh = () => {
    for (const k of ["fee-adjustments", "fee-adjustments-student", "students-payments", "dashboard"]) void qc.invalidateQueries({ queryKey: [k] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("add_fee_adjustment", {
        _student_id: studentId, _kind: kind, _amount: kind === "exoneration" ? null : Number(amount), _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(kind === "exoneration" ? "Gratuité enregistrée" : "Réduction enregistrée");
      setAmount(""); setReason(""); refresh();
    },
    onError: (e: any) => toast.error(feeAdjustmentErrorMessage(e?.message)),
  });

  const voidIt = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("void_fee_adjustment", { _id: voidingId, _reason: voidReason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Réduction annulée"); setVoidingId(null); setVoidReason(""); refresh(); },
    onError: (e: any) => toast.error(feeAdjustmentErrorMessage(e?.message)),
  });

  const amountNum = Number(amount);
  const amountError = kind !== "exoneration" && amount !== "" && (!(amountNum > 0) || amountNum > remainingToCover)
    ? (amountNum > remainingToCover ? `Maximum ${fmt(remainingToCover)} GNF` : "Montant invalide") : null;
  const canSubmit = !!student && fee > 0 && remainingToCover > 0 && reason.trim().length >= 3
    && (kind === "exoneration" || (amountNum > 0 && !amountError)) && !add.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Réduction, bourse ou gratuité totale</DialogTitle>
          <DialogDescription>Diminue les frais de scolarité dus par un élève pour l'année en cours. Les paiements déjà reçus ne sont pas modifiés.</DialogDescription>
        </DialogHeader>

        <details className="rounded-md border bg-muted/40 p-3 text-xs" open={!studentId}>
          <summary className="cursor-pointer font-medium">Comment ça marche ?</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
            <li>Choisissez l'élève, puis le type : <b>réduction</b> ou <b>bourse</b> (un montant en GNF) ou <b>gratuité totale</b> (plus rien à payer).</li>
            <li>Écrivez le motif (obligatoire, il reste dans l'historique), puis enregistrez.</li>
            <li>Les frais de l'élève baissent : <b>À payer après réduction = frais annuels − réductions</b>. Le reste à payer se calcule à partir de ce montant.</li>
          </ol>
          <p className="mt-2 text-muted-foreground">Exemple : frais 1 000 000, réduction 200 000 → l'élève doit 800 000. S'il a déjà payé 300 000, il lui reste 500 000.</p>
          <p className="mt-1 text-muted-foreground">Aucun paiement n'est créé et la caisse ne bouge pas. Valable pour l'année en cours. Une erreur ? Annulez la réduction dans l'historique ci-dessous : elle reste visible, marquée « annulée ».</p>
          <p className="mt-1 text-muted-foreground">Un élève qui paie en plusieurs fois n'a pas besoin de réduction : enregistrez simplement chaque paiement reçu.</p>
        </details>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Élève</Label>
            {!studentId ? (
              <>
                <Input placeholder="Rechercher par nom ou matricule…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
                <div className="max-h-44 overflow-y-auto rounded-md border">
                  {matches.length === 0 && <div className="p-3 text-sm text-muted-foreground">Aucun élève trouvé</div>}
                  {matches.map((s) => (
                    <button key={s.id} type="button" onClick={() => setStudentId(s.id)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                      <span className="font-medium">{s.full_name}</span>
                      <span className="text-xs text-muted-foreground">{s.classes?.name ?? "sans classe"}{s.matricule ? ` · ${s.matricule}` : ""}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div><div className="font-medium">{student?.full_name}</div><div className="text-xs text-muted-foreground">{student?.classes?.name ?? "sans classe"} · frais annuels {fmt(fee)} GNF</div></div>
                <Button variant="ghost" size="sm" onClick={() => { setStudentId(""); setSearch(""); }}>Changer</Button>
              </div>
            )}
          </div>

          {student && fee <= 0 && <p className="text-sm text-destructive">Aucun frais n'est défini pour la classe de cet élève : définissez-les d'abord dans la gestion des classes.</p>}

          {student && fee > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md bg-muted p-2"><div className="text-muted-foreground">Frais annuels</div><div className="font-semibold">{fmt(fee)}</div></div>
                <div className="rounded-md bg-muted p-2"><div className="text-muted-foreground">Réductions</div><div className="font-semibold">{fmt(activeTotal)}</div></div>
                <div className="rounded-md bg-muted p-2"><div className="text-muted-foreground">À payer après réduction</div><div className="font-semibold">{fmt(remainingToCover)}</div></div>
              </div>

              {remainingToCover > 0 && (kind === "exoneration" || (amountNum > 0 && !amountError)) && (
                <p className="rounded-md bg-primary/10 p-2 text-xs">
                  Après enregistrement : l'élève devra <b>{fmt(kind === "exoneration" ? 0 : remainingToCover - amountNum)} GNF</b> au lieu de {fmt(remainingToCover)} GNF.
                </p>
              )}

              {remainingToCover > 0 ? (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <Select value={kind} onValueChange={setKind}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reduction">Réduction (montant en GNF)</SelectItem>
                        <SelectItem value="bourse">Bourse (montant en GNF)</SelectItem>
                        <SelectItem value="exoneration">Gratuité totale (plus rien à payer)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {kind !== "exoneration" ? (
                    <div className="space-y-1.5">
                      <Label>Montant (GNF)</Label>
                      <Input type="number" inputMode="numeric" min={1} max={remainingToCover} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Maximum ${fmt(remainingToCover)}`} />
                      {amountError && <p className="text-xs text-destructive">{amountError}</p>}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">L'élève ne devra plus rien : {fmt(remainingToCover)} GNF seront déduits.</p>
                  )}
                  <div className="space-y-1.5">
                    <Label>Motif (obligatoire)</Label>
                    <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : 3e enfant de la même famille, orphelin, bourse d'excellence…" />
                  </div>
                  <Button className="w-full" disabled={!canSubmit} onClick={() => add.mutate()}>
                    {add.isPending ? "Enregistrement…" : kind === "exoneration" ? "Enregistrer la gratuité" : "Enregistrer la réduction"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Les frais de cet élève sont entièrement couverts. Annulez une réduction ci-dessous pour en modifier le montant.</p>
              )}

              <div className="space-y-2">
                <Label>Historique</Label>
                {history.length === 0 && <p className="text-sm text-muted-foreground">Aucune réduction pour cet élève.</p>}
                {history.map((h: any) => (
                  <div key={h.id} className={`rounded-md border p-2 text-sm ${h.voided_at ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={h.voided_at ? "outline" : "secondary"}>{ADJUSTMENT_LABELS[h.kind] ?? h.kind}</Badge>
                        <span className={`font-semibold ${h.voided_at ? "line-through" : ""}`}>{fmt(Number(h.amount))} GNF</span>
                        <span className="text-xs text-muted-foreground">{h.academic_year}</span>
                      </div>
                      {!h.voided_at && voidingId !== h.id && <Button variant="ghost" size="sm" onClick={() => { setVoidingId(h.id); setVoidReason(""); }}>Annuler</Button>}
                      {h.voided_at && <span className="text-xs text-muted-foreground">Annulée</span>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{h.reason} — {new Date(h.created_at).toLocaleDateString("fr-FR")}{h.voided_at ? ` · annulée : ${h.void_reason ?? ""}` : ""}</div>
                    {voidingId === h.id && (
                      <div className="mt-2 flex gap-2">
                        <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Motif de l'annulation" />
                        <Button size="sm" variant="destructive" disabled={voidReason.trim().length < 3 || voidIt.isPending} onClick={() => voidIt.mutate()}>Confirmer</Button>
                        <Button size="sm" variant="ghost" onClick={() => setVoidingId(null)}>Non</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
