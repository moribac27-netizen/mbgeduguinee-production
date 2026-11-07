import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFlatOffers } from "@/hooks/useFlatOffers";
import { formatPublicGNF } from "@/lib/public-offers";
import { formatDateFr } from "@/lib/flat-offers";
import { flatPaymentErrorMessage } from "@/lib/flat-payments";
import { MY_FLAT_OFFER_KEY } from "@/hooks/useMyFlatOffer";

const db = supabase as any;

/** Passage à une formule supérieure en cours d'année (règle A : le déjà échu reste au tarif actuel). Tout est calculé par la base. */
export function FlatPlanChange({ currentMonthly, canChange }: { currentMonthly: number; canChange: boolean }) {
  const qc = useQueryClient();
  const offers = useFlatOffers().filter((o) => o.monthlyPrice > currentMonthly).sort((a, b) => a.monthlyPrice - b.monthlyPrice);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useQuery({
    queryKey: ["flat-plan-preview", code],
    enabled: !!code,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc("preview_flat_offer_change", { _offer_code: code });
      if (error) throw error;
      return data as any;
    },
  });

  if (!offers.length) return null;

  async function confirm() {
    if (!code || busy) return;
    if (!window.confirm("Confirmer le passage à cette formule ? Le nouvel engagement annuel s'applique immédiatement et ne peut pas être annulé.")) return;
    setBusy(true);
    const { error } = await db.rpc("change_flat_offer", { _offer_code: code });
    setBusy(false);
    if (error) { toast.error(flatPaymentErrorMessage(error.message)); return; }
    toast.success("Formule modifiée.");
    setCode(null);
    for (const k of [["my-flat-schedule"], ["my-flat-payments"], ["school-suspension"], MY_FLAT_OFFER_KEY]) void qc.invalidateQueries({ queryKey: k });
  }

  const p = preview.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Passer à une formule supérieure</CardTitle>
        <CardDescription>
          Ce qui est déjà échu reste au tarif actuel ; le reste de l'engagement annuel passe au nouveau tarif. Vos paiements déjà validés sont conservés.
          Le passage à une formule inférieure n'est pas possible en cours d'année.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {offers.map((o) => (
            <Button key={o.code} size="sm" variant={code === o.code ? "default" : "outline"} onClick={() => setCode(o.code)}>
              {o.name} — {formatPublicGNF(o.monthlyPrice)} / mois
            </Button>
          ))}
        </div>
        {code && preview.isLoading && <Loader2 className="size-4 animate-spin" />}
        {code && preview.isError && <p className="text-sm text-destructive">{flatPaymentErrorMessage((preview.error as any)?.message)}</p>}
        {p && (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>Engagement actuel : <strong>{formatPublicGNF(Number(p.old_annual))}</strong></div>
              <div>Nouvel engagement : <strong>{formatPublicGNF(Number(p.new_annual))}</strong> (+ {formatPublicGNF(Number(p.extra_cost))})</div>
              <div>Déjà échu (tarif actuel) : {formatPublicGNF(Number(p.due_so_far))}</div>
              <div>Déjà payé : {formatPublicGNF(Number(p.paid))}</div>
              <div>Solde restant après changement : <strong>{formatPublicGNF(Number(p.balance_after))}</strong></div>
              <div>≈ {formatPublicGNF(Number(p.approx_installment))} × {p.remaining_installments} échéance(s), dès le {formatDateFr(p.next_due_date)}</div>
            </div>
            {canChange
              ? <Button size="sm" onClick={confirm} disabled={busy}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Confirmer le passage à {p.new_offer}</Button>
              : <p className="text-xs text-muted-foreground">Seule la direction de l'établissement peut confirmer ce changement.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
