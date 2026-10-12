import { Link } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePublicOffers } from "@/hooks/usePublicOffers";
import { formatPublicGNF, offerFeatures } from "@/lib/public-offers";

/** Offres Basique / Standard / Premium pour les visiteurs. Prix lus depuis Supabase et rafraîchis automatiquement. */
export function PublicOffers() {
  const offers = usePublicOffers();

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8" id="tarifs">
      <div className="mx-auto max-w-2xl text-center">
        <Badge variant="secondary" className="border-[#19B5A5]/20 bg-[#EAF7F5] text-[#0B1F3A]">Nos offres</Badge>
        <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Trois offres, une cotisation annuelle par élève</h2>
        <p className="mt-4 leading-7 text-muted-foreground">Choisissez la formule adaptée à votre établissement. Le tarif est par élève et par année scolaire ; une part est reversée à l'établissement pour chaque cotisation validée.</p>
      </div>
      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {offers.map((o) => {
          const featured = o.code === "standard";
          return (
            <Card key={o.code} className={featured ? "relative border-[#19B5A5] shadow-xl" : "border-[#0B1F3A]/15 shadow-sm"}>
              <CardContent className="flex h-full flex-col p-7">
                {featured && <Badge className="absolute -top-3 left-7 bg-[#19B5A5] text-[#06251f]">Le plus choisi</Badge>}
                <div className="text-sm font-medium text-muted-foreground">Offre {o.name}</div>
                <div className="mt-2 font-display text-4xl font-bold">{formatPublicGNF(o.price).replace(" GNF", "")} <span className="text-lg">GNF</span></div>
                <div className="mt-1 text-sm text-muted-foreground">par élève / an</div>
                <div className="mt-5 rounded-xl bg-[#EEF4FA] p-3 text-sm">
                  {o.commission > 0
                    ? <>Part reversée à l'établissement : <strong>{formatPublicGNF(o.commission)}</strong> par cotisation validée</>
                    : <>Aucune part reversée à l'établissement</>}
                </div>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {offerFeatures(o).map((f) => (
                    <li key={f.label} className={f.included ? "flex gap-3" : "flex gap-3 text-muted-foreground"}>
                      {f.included ? <Check className="mt-0.5 size-4 shrink-0 text-[#0B1F3A]" /> : <X className="mt-0.5 size-4 shrink-0" />}
                      <span>{f.label}{f.included ? "" : " — non inclus"}</span>
                    </li>
                  ))}
                </ul>
                <Button className="mt-7" variant={featured ? "default" : "outline"} asChild>
                  <Link to="/creer-etablissement">Créer mon établissement</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">Le personnel de l'établissement (direction, enseignants, administration) se connecte avec toutes les offres. Les paiements sont validés par l'administration de la plateforme.</p>
    </section>
  );
}
