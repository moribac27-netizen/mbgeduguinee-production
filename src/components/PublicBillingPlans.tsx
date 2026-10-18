import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBillingConfig } from "@/hooks/useBillingPlans";
import { computeBilling, formatBillingGNF, planRanges } from "@/lib/billing";

/**
 * Forfaits d'établissement selon l'effectif (paiement mensuel ou annuel avec mois offerts).
 * Tout vient de Supabase (modifiable par le Super Admin) ; rien n'est affiché tant que la configuration n'est pas lue.
 */
export function PublicBillingPlans() {
  const { plans, freeMonths, loaded } = useBillingConfig();
  if (!loaded) return null;
  const ranges = planRanges(plans);
  if (ranges.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 lg:px-8" id="forfaits">
      <div className="mx-auto max-w-2xl text-center">
        <Badge variant="secondary" className="border-[#19B5A5]/20 bg-[#EAF7F5] text-[#0B1F3A]">Forfaits établissement</Badge>
        <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Un forfait selon l'effectif de votre établissement</h2>
        <p className="mt-4 leading-7 text-muted-foreground">
          Payez au mois{freeMonths > 0 ? <>, ou à l'année et bénéficiez de <strong>{freeMonths} mois offerts</strong></> : null}. Le forfait applicable est déterminé automatiquement par votre nombre d'élèves.
        </p>
      </div>
      <div className={`mt-10 grid gap-6 ${ranges.length > 1 ? "md:grid-cols-2" : "max-w-md mx-auto"}`}>
        {ranges.map(({ plan, min, max }) => {
          const monthly = computeBilling(plan.monthly_price, "monthly", freeMonths);
          const yearly = computeBilling(plan.monthly_price, "yearly", freeMonths);
          return (
            <Card key={plan.code} className="border-[#0B1F3A]/15 shadow-sm">
              <CardContent className="flex h-full flex-col p-7">
                <div className="text-sm font-medium text-muted-foreground">{plan.name}</div>
                <div className="mt-1 text-sm">{min === 0 ? "Jusqu'à" : `De ${min.toLocaleString("fr-FR")} à`} <strong>{max.toLocaleString("fr-FR")}</strong> élèves</div>
                <div className="mt-4 font-display text-4xl font-bold">{formatBillingGNF(monthly.amount).replace(" GNF", "")} <span className="text-lg">GNF</span></div>
                <div className="text-sm text-muted-foreground">par mois</div>
                <div className="mt-5 rounded-xl bg-[#EEF4FA] p-3 text-sm">
                  Paiement annuel : <strong>{formatBillingGNF(yearly.amount)}</strong>
                  {yearly.discount > 0 && <> au lieu de {formatBillingGNF(yearly.gross)} (réduction de {formatBillingGNF(yearly.discount)})</>}
                </div>
                <Button className="mt-6" variant="outline" asChild><Link to="/creer-etablissement">Créer mon établissement</Link></Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
