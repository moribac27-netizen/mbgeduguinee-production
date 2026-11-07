import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPublicGNF } from "@/lib/public-offers";
import { formatDateFr } from "@/lib/flat-offers";
import { flatPaymentErrorMessage } from "@/lib/flat-payments";
import { MY_FLAT_OFFER_KEY } from "@/hooks/useMyFlatOffer";

const db = supabase as any;
export const FLAT_RENEWAL_KEY = ["flat-renewal-status"];

type Status = {
  state: "none" | "not_due" | "upcoming" | "due" | "blocked";
  academic_year?: string; previous_year?: string; previous_balance?: number; previous_overdue?: number;
  year_end?: string; days_left?: number; offer_name?: string; previous_offer_code?: string;
  offers?: Array<{ code: string; name: string; monthly_price: number; max_students: number | null }>;
};

/** Réinscription obligatoire chaque année. Les règles (solde de l'an passé à zéro, formules disponibles) sont décidées par la base. */
export function FlatRenewal({ fallback = null }: { fallback?: ReactNode }) {
  const qc = useQueryClient();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: FLAT_RENEWAL_KEY, retry: false, staleTime: 60_000, queryFn: async () => {
    const { data, error } = await db.rpc("my_flat_renewal_status");
    if (error) throw error;
    return data as Status;
  } });
  const s = q.data;
  if (!s || s.state === "none" || s.state === "not_due") return <>{fallback}</>;

  if (s.state === "upcoming") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" data-testid="renewal-upcoming">
        <strong>Réinscription obligatoire.</strong> L'année se termine le {s.year_end ? formatDateFr(s.year_end) : "30 juin"} ({s.days_left} jour(s)). Réglez votre solde pour pouvoir vous réinscrire dès le début de la nouvelle année scolaire.
      </div>
    );
  }

  const chosen = code ?? s.previous_offer_code ?? s.offers?.[0]?.code ?? null;
  async function renew() {
    if (!chosen || busy) return;
    if (!window.confirm("Confirmer la réinscription pour " + s!.academic_year + " ?")) return;
    setBusy(true);
    const { error } = await db.rpc("renew_flat_offer", { _offer_code: chosen });
    setBusy(false);
    if (error) { toast.error(flatPaymentErrorMessage(error.message)); return; }
    toast.success("Réinscription enregistrée.");
    for (const k of [FLAT_RENEWAL_KEY, ["my-flat-schedule"], ["my-flat-payments"], ["school-suspension"], MY_FLAT_OFFER_KEY]) void qc.invalidateQueries({ queryKey: k });
  }

  const blocked = s.state === "blocked";
  return (
    <Card data-testid="renewal-card">
      <CardHeader>
        <CardTitle className="text-base">Réinscription pour {s.academic_year}</CardTitle>
        <CardDescription>La réinscription est obligatoire chaque année. Elle n'est possible que si le solde de l'année {s.previous_year} est entièrement réglé.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {blocked ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">
            Solde de {s.previous_year} à régler avant de vous réinscrire : <strong>{formatPublicGNF(Number(s.previous_balance ?? 0))}</strong>
            {Number(s.previous_overdue ?? 0) > 0 && <> (dont {formatPublicGNF(Number(s.previous_overdue))} en retard)</>}. Déclarez votre paiement dans « Mon forfait ».
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {(s.offers ?? []).map((o) => (
                <Button key={o.code} variant={chosen === o.code ? "default" : "outline"} size="sm" onClick={() => setCode(o.code)}>
                  {o.name} · {formatPublicGNF(o.monthly_price)}/mois{o.max_students ? ` · ${o.max_students} élèves` : ""}
                </Button>
              ))}
            </div>
            {(s.offers ?? []).length === 0 && <p className="text-sm text-red-700">Aucune formule n'est disponible actuellement : contactez l'administrateur de la plateforme.</p>}
            <Button disabled={busy || !chosen} onClick={() => void renew()}>Me réinscrire</Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
