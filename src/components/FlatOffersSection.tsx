import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useFlatOffers } from "@/hooks/useFlatOffers";
import { flatCategoryMessage, flatCategoryTitle, studentRangeText, type FlatOffer } from "@/lib/flat-offers";
import { formatPublicGNF } from "@/lib/public-offers";
import { CREATE_SCHOOL_PATH } from "@/lib/signup-offer";

function inclusions(o: FlatOffer): string[] {
  return [
    o.modules.cantine && o.modules.infirmerie && o.modules.bibliotheque ? "Cantine, Infirmerie et Bibliothèque" : null,
    o.parentLogin ? "Connexion des parents" : null,
    o.studentLogin ? "Connexion des élèves" : null,
    "Aucune cotisation par élève : le forfait de l'établissement la remplace",
    "Personnel de l'établissement (direction, enseignants, administration)",
  ].filter(Boolean) as string[];
}

/**
 * Catégorie « Plans par établissement » (offre exceptionnelle). N'affiche rien quand aucune offre n'est disponible
 * (désactivées par le Super Admin ou période de validité terminée).
 * Sans `onChoose`, les boutons mènent à la création d'établissement avec l'offre présélectionnée.
 */
export function FlatOffersSection({ onChoose, id }: { onChoose?: (o: FlatOffer) => void; id?: string }) {
  const offers = useFlatOffers();
  if (!offers.length) return null;
  return (
    <section id={id} className="mt-14 rounded-2xl border border-[#19B5A5]/40 bg-[#F3FBF9] p-5 sm:p-8">
      <div className="mx-auto max-w-3xl text-center">
        <Badge variant="secondary" className="border-[#19B5A5]/30 bg-[#EAF7F5] text-[#0B1F3A]">Offre exceptionnelle</Badge>
        <h2 className="mt-3 font-display text-xl font-bold leading-snug sm:text-2xl">{flatCategoryTitle(offers)}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{flatCategoryMessage(offers)}</p>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {offers.map((o) => (
          <Card key={o.code} className="border-[#0B1F3A]/15 bg-white shadow-sm">
            <CardContent className="flex h-full flex-col p-6">
              <div className="text-sm font-medium text-muted-foreground">Plan {o.name}</div>
              <div className="mt-2 font-display text-3xl font-bold">{formatPublicGNF(o.monthlyPrice).replace(" GNF", "")} <span className="text-base">GNF / mois</span></div>
              <div className="mt-2 text-sm font-semibold">{studentRangeText(o)}</div>
              {o.freeMonths > 0 && (
                <div className="mt-3 rounded-xl bg-[#EEF4FA] p-3 text-sm">Paiement annuel : <strong>{formatPublicGNF(o.annualPrice)}</strong> ({o.freeMonths} mois offerts)</div>
              )}
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {inclusions(o).map((t) => (
                  <li key={t} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-[#0B1F3A]" /><span>{t}</span></li>
                ))}
              </ul>
              {onChoose ? (
                <Button className="mt-6" variant="outline" onClick={() => onChoose(o)}>Choisir le plan {o.name}</Button>
              ) : (
                <Button className="mt-6" variant="outline" asChild><Link to={CREATE_SCHOOL_PATH} search={{ offre: o.code }}>Choisir le plan {o.name}</Link></Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-5 text-center text-xs text-muted-foreground">Choisir un plan n'est pas un paiement : les paiements mensuels sont déclarés puis validés par l'administration de la plateforme.</p>
    </section>
  );
}
