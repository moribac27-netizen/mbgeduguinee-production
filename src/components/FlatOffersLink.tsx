import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useFlatOffers } from "@/hooks/useFlatOffers";
import { FLAT_OFFERS_PATH, flatOffersNotice } from "@/lib/flat-offers";

/**
 * Lien discret vers les offres par établissement + mention « année académique en cours ».
 * N'affiche rien quand aucune offre établissement n'est disponible (désactivées ou période de validité terminée).
 */
export function FlatOffersLink({ className = "" }: { className?: string }) {
  const offers = useFlatOffers();
  if (!offers.length) return null;
  return (
    <div className={`mx-auto max-w-2xl text-center ${className}`}>
      <Link to={FLAT_OFFERS_PATH} className="inline-flex items-center gap-1 text-sm font-medium text-[#0B1F3A] underline-offset-4 hover:underline">
        Vous êtes un établissement de grande taille ? Voir les offres établissement <ArrowRight className="size-3.5" />
      </Link>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{flatOffersNotice(offers)}</p>
    </div>
  );
}
