import { usePublicOffers } from "@/hooks/usePublicOffers";
import { useFlatOffersState } from "@/hooks/useFlatOffers";
import { flatToPublicOffer, type PublicOffer } from "@/lib/public-offers";

/** Les cinq offres choisissables à la création : trois par élève + les offres établissement actuellement disponibles. */
export function useSignupOffersState(): { offers: PublicOffer[]; loading: boolean; failed: boolean } {
  const perStudent = usePublicOffers();
  const { offers: flat, loading, failed } = useFlatOffersState();
  return { offers: [...perStudent, ...flat.map(flatToPublicOffer)], loading, failed };
}

export function useSignupOffers(): PublicOffer[] {
  return useSignupOffersState().offers;
}
