import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronDown, Coins, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { formatGNF } from "@/lib/orange-money";
import {
  PER_STUDENT_UNIT_PRICE_GNF,
  PER_STUDENT_SCHOOL_SHARE_GNF,
} from "@/lib/pricing";

// Repli si le plan n'a pas encore de seuil configuré en base — même valeur
// que celle utilisée ailleurs dans l'app (usePerStudentPlan.ts, routes/index.tsx).
const DEFAULT_PER_STUDENT_THRESHOLD = 20;

interface Props {
  schoolId: string | null;
  currentPlanId?: string | null;
  onChanged?: () => void | Promise<void>;
}

/**
 * Présentation du mode de facturation « par élève », réservée aux écoles
 * connectées. La bascule réutilise renew_or_change_subscription, comme un
 * changement Basic ↔ Standard classique.
 */
export function PerStudentPlanOffer({ schoolId, currentPlanId, onChanged }: Props) {
  const [plan, setPlan] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .eq("billing_model", "per_student")
        .maybeSingle();
      setPlan(data ?? null);
    })();
  }, []);

  if (!plan) return null;

  const unit = Number(plan.price_per_student ?? PER_STUDENT_UNIT_PRICE_GNF);
  const share = Number(plan.school_share_per_student ?? PER_STUDENT_SCHOOL_SHARE_GNF);
  const threshold = Number(plan.access_threshold_students ?? DEFAULT_PER_STUDENT_THRESHOLD);
  const isCurrent = currentPlanId === plan.id;

  async function apply() {
    if (!schoolId) return toast.error("Établissement non identifié.");
    setSaving(true);
    const { error } = await (supabase as any).rpc("renew_or_change_subscription", {
      p_school_id: schoolId,
      p_new_plan_id: plan.id,
      p_billing_cycle: "yearly",
    });
    setSaving(false);
    setConfirm(false);
    if (error) return toast.error("Changement impossible", { description: error.message });
    toast.success("Mode de facturation par élève activé");
    await onChanged?.();
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="size-4 text-primary" /> Découvrir un autre mode de facturation
            </CardTitle>
            <CardDescription>
              {plan.name} · {formatGNF(unit)} par élève et par an
              {isCurrent && " — mode actuellement activé"}
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => setOpen((v) => !v)}>
            {open ? "Masquer" : "En savoir plus"} <ChevronDown className={"size-4 ml-1 transition " + (open ? "rotate-180" : "")} />
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Tarif</div>
              <div className="font-semibold">{formatGNF(unit)} / élève / an</div>
              <p className="text-xs text-muted-foreground mt-1">
                Réglé individuellement par la famille ou encaissé en groupe par l'école.
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Part reversée à l'école</div>
              <div className="font-semibold">{formatGNF(share)} / élève</div>
              <p className="text-xs text-muted-foreground mt-1">Suivi dans l'écran Cotisations.</p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Seuil d'accès</div>
              <div className="font-semibold flex items-center gap-1"><Users className="size-4" /> {threshold} élèves payés</div>
              <p className="text-xs text-muted-foreground mt-1">
                En dessous, l'accès complet de l'école reste suspendu.
              </p>
            </div>
          </div>
          <ul className="text-sm space-y-1.5 text-muted-foreground list-disc pl-5">
            <li>Aucun abonnement mensuel fixe : l'école ne paie que pour les élèves inscrits.</li>
            <li>Les notes, bulletins et documents d'un élève sans cotisation restent verrouillés.</li>
            <li>Chaque paiement génère un reçu imprimable au nom de l'établissement.</li>
          </ul>
          {!isCurrent && (
            <div>
              <Badge variant="outline" className="mr-2">Changement immédiat</Badge>
              <Button onClick={() => setConfirm(true)}>Basculer sur ce mode de facturation</Button>
            </div>
          )}
        </CardContent>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Basculer sur le {plan.name} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Votre établissement passera à la facturation par élève ({formatGNF(unit)} / élève / an).
              L'accès complet sera rétabli dès {threshold} cotisations réglées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(e) => { e.preventDefault(); void apply(); }}>
              {saving ? <><Loader2 className="size-4 mr-2 animate-spin" /> Activation…</> : "Confirmer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
