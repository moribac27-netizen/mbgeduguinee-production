import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useFlatOffers } from "@/hooks/useFlatOffers";
import { useFlatTexts } from "@/hooks/usePlatformSettings";
import { flatCategoryMessage, flatCategoryTitle, formatDateFr, studentRangeText, type FlatOffer } from "@/lib/flat-offers";
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
export function FlatOffersSection({ onChoose, id, selectedCode }: { onChoose?: (o: FlatOffer) => void; id?: string; selectedCode?: string | null }) {
  const offers = useFlatOffers();
  const texts = useFlatTexts();
  if (!offers.length) return null;
  return (
    <section id={id} className="mt-14 rounded-2xl border border-[#19B5A5]/40 bg-[#F3FBF9] p-5 sm:p-8">
      <div className="mx-auto max-w-3xl text-center">
        <Badge variant="secondary" className="border-[#19B5A5]/30 bg-[#EAF7F5] text-[#0B1F3A]">Offre exceptionnelle</Badge>
        <h2 className="mt-3 font-display text-xl font-bold leading-snug sm:text-2xl">{texts?.title ?? flatCategoryTitle(offers)}</h2>
        {texts?.subtitle && <p className="mt-2 text-sm font-medium">{texts.subtitle}</p>}
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{texts?.message ?? flatCategoryMessage(offers)}</p>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {offers.map((o) => (
          <Card key={o.code} className={`bg-white shadow-sm ${selectedCode === o.code ? "border-2 border-[#19B5A5] ring-2 ring-[#19B5A5]/30" : "border-[#0B1F3A]/15"}`}>
            <CardContent className="flex h-full flex-col p-6">
              <div className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground"><span>Plan {o.name}</span>{selectedCode === o.code && <Badge className="bg-[#19B5A5] text-white">Plan sélectionné</Badge>}</div>
              <div className="mt-2 font-display text-3xl font-bold">{formatPublicGNF(o.monthlyPrice).replace(" GNF", "")} <span className="text-base">GNF / mois</span></div>
              <div className="mt-2 text-sm font-semibold">{studentRangeText(o)}</div>
              <div className="mt-1 text-xs text-muted-foreground">Facturation mensuelle · valable du {formatDateFr(o.validFrom)} au {formatDateFr(o.validUntil)}</div>
              {o.description && <p className="mt-3 text-sm text-muted-foreground">{o.description}</p>}
              {o.freeMonths > 0 && (
                <div className="mt-3 rounded-xl bg-[#EEF4FA] p-3 text-sm">Paiement annuel : <strong>{formatPublicGNF(o.annualPrice)}</strong> ({o.freeMonths} mois offerts)</div>
              )}
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {inclusions(o).map((t) => (
                  <li key={t} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-[#0B1F3A]" /><span>{t}</span></li>
                ))}
              </ul>
              {onChoose ? (
                <Button className="mt-6" variant={selectedCode === o.code ? "default" : "outline"} onClick={() => onChoose(o)}>{selectedCode === o.code ? "Forfait choisi" : "Choisir ce forfait"}</Button>
              ) : (
                <Button className="mt-6" variant="outline" asChild><Link to={CREATE_SCHOOL_PATH} search={{ offre: o.code }}>Choisir ce forfait</Link></Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-5 text-center text-xs text-muted-foreground">Choisir un plan n'est pas un paiement : les paiements mensuels sont déclarés puis validés par l'administration de la plateforme.</p>
    </section>
  );
}
