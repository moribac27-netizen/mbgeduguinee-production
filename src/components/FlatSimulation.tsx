import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateFr } from "@/lib/flat-offers";
import { formatPublicGNF } from "@/lib/public-offers";

/** Simulation du paiement mensuel avant souscription. Tout est calculé par la base (flat_simulate_monthly) ; ce composant affiche seulement. */
export function FlatSimulation({ offerCode }: { offerCode: string }) {
  const sim = useQuery({
    queryKey: ["flat-simulate", offerCode],
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("flat_simulate_monthly", { _offer_code: offerCode, _enrol: null });
      if (error) throw error;
      return data as any;
    },
  });
  if (sim.isLoading) return <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Calcul de votre engagement…</div>;
  const s = sim.data;
  if (sim.isError || !s || !Array.isArray(s.schedule)) return null;
  const rows: any[] = s.schedule;
  const instalments = rows.filter((r) => r.kind !== "initial");
  return (
    <div className="mt-4 rounded-xl border border-[#19B5A5]/50 bg-[#F3FBF9] p-4 text-sm" data-testid="flat-simulation">
      <div className="font-semibold">Votre engagement financier (simulation si vous vous inscrivez aujourd'hui)</div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Tarif mensuel de référence</dt><dd className="font-semibold">{formatPublicGNF(Number(s.monthly_price))}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Montant annuel obligatoire (12 mensualités)</dt><dd className="font-semibold">{formatPublicGNF(Number(s.annual_commitment))}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Date d'inscription</dt><dd className="font-semibold">{formatDateFr(s.enrol_date)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Première mensualité</dt><dd className="font-semibold">{formatPublicGNF(Number(s.first_payment))}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Échéances restantes</dt><dd className="font-semibold">{instalments.length}{s.installment_amount ? ` × ${formatPublicGNF(Number(s.installment_amount))}` : ""}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Total à payer sur l'année</dt><dd className="font-semibold">{formatPublicGNF(Number(s.total_to_pay))}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Dernière échéance</dt><dd className="font-semibold">{formatDateFr(s.last_due_date)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Année scolaire</dt><dd className="font-semibold">{s.academic_year} (du {formatDateFr(s.year_start)} au {formatDateFr(s.year_end)})</dd></div>
      </dl>
      {s.calendar_phase === "vacation" && <p className="mt-3 text-xs">Vous vous inscrivez pendant les vacances : votre abonnement est rattaché à l'année {s.academic_year}, et le service démarre le {formatDateFr(s.service_start)}.</p>}
      {Number(s.last_installment_amount) !== Number(s.installment_amount) && <p className="mt-2 text-xs text-muted-foreground">La dernière échéance ({formatPublicGNF(Number(s.last_installment_amount))}) absorbe l'arrondi pour que le total corresponde exactement à l'engagement annuel.</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3">Échéance</th><th className="pr-3">Date</th><th>Montant</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.seq} className="border-t"><td className="py-1 pr-3">{r.kind === "initial" ? "Première mensualité" : r.kind === "balance" ? "Solde" : `Échéance ${r.seq}`}</td><td className="pr-3">{formatDateFr(r.due_date)}</td><td>{formatPublicGNF(Number(r.amount))}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Cet engagement est un plafond : les paiements ne dépasseront jamais le montant annuel de votre formule. Le calendrier exact est confirmé à la validation de votre premier paiement.</p>
    </div>
  );
}
