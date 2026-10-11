import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PUBLIC_OFFERS, toPublicOffers, type PublicOffer } from "@/lib/public-offers";

export const PUBLIC_OFFERS_KEY = ["public-offers"];

/**
 * Offres actives lues dans Supabase (modifiables par le Super Admin) et rafraîchies automatiquement :
 * toutes les minutes, au retour sur l'onglet et à la reconnexion. En cas d'échec : valeurs par défaut.
 */
export function usePublicOffers(): PublicOffer[] {
  const { data } = useQuery({
    queryKey: PUBLIC_OFFERS_KEY,
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
    queryFn: async (): Promise<PublicOffer[]> => {
      const { data, error } = await (supabase as any)
        .from("subscription_offers")
        .select("code,name,annual_price_per_student,school_commission_per_student,parent_login_allowed,student_login_allowed,features,payer_roles,is_active")
        .eq("is_active", true);
      if (error) throw error;
      return toPublicOffers(data);
    },
  });
  return data ?? DEFAULT_PUBLIC_OFFERS;
}
