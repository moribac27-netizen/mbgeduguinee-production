import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toFlatOffers, type FlatOffer } from "@/lib/flat-offers";

export const FLAT_OFFERS_KEY = ["flat-offers"];

/**
 * Offres par établissement disponibles aujourd'hui (actives et dans leur période de validité).
 * Rafraîchies toutes les minutes ; liste vide en cas d'erreur (la page publique reste alors sur les trois offres par élève).
 */
export function useFlatOffersState(): { offers: FlatOffer[]; loading: boolean; failed: boolean } {
  const { data, isLoading, isError } = useQuery({
    queryKey: FLAT_OFFERS_KEY,
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async (): Promise<FlatOffer[]> => {
      const { data, error } = await (supabase as any).from("subscription_offers").select("*").eq("is_active", true).eq("offer_type", "per_school");
      if (error) throw error;
      return toFlatOffers(data);
    },
  });
  return { offers: data ?? [], loading: isLoading, failed: isError };
}

export function useFlatOffers(): FlatOffer[] {
  return useFlatOffersState().offers;
}
