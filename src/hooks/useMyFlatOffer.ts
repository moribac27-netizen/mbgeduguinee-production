import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MyFlatOffer {
  offer_code: string;
  offer_name: string;
  academic_year: string;
  monthly_price: number;
  free_months: number;
  annual_price: number;
  min_students: number;
  max_students: number;
  students_count: number;
  over_tranche: boolean;
  valid_until: string;
  days_left: number;
  in_good_standing: boolean;
  paid_months: string[];
  annual_paid: boolean;
  pending_count: number;
}

export const MY_FLAT_OFFER_KEY = ["my-flat-offer"];

/** État du forfait de l'établissement connecté ; null si l'établissement est sous une offre par élève (ou si la fonction n'existe pas encore). */
export function useMyFlatOffer() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: MY_FLAT_OFFER_KEY,
    staleTime: 30_000,
    refetchInterval: 120_000,
    retry: false,
    queryFn: async (): Promise<MyFlatOffer | null> => {
      const { data, error } = await (supabase as any).rpc("my_flat_offer_status");
      if (error) return null;
      return (data ?? null) as MyFlatOffer | null;
    },
  });
  return { flat: data ?? null, loading: isLoading, refetch };
}
