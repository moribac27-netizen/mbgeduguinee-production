import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_ANNUAL_FREE_MONTHS, toBillingPlan, type BillingPlan } from "@/lib/billing";

export const BILLING_CONFIG_KEY = ["billing-config"];

export interface BillingConfig {
  plans: BillingPlan[];
  freeMonths: number;
  /** Vrai tant que la configuration réelle n'a pas été lue (les montants affichés ne sont alors pas fiables). */
  loaded: boolean;
}

/**
 * Forfaits et réduction annuelle lus dans Supabase (modifiables par le Super Admin), rafraîchis automatiquement.
 * Lecture publique des forfaits actifs ; le Super Admin voit aussi les forfaits désactivés.
 * Aucune valeur par défaut n'est inventée : tant que la lecture n'a pas abouti, `plans` est vide.
 */
export function useBillingConfig(): BillingConfig & { isLoading: boolean; error: unknown } {
  const { data, isLoading, error } = useQuery({
    queryKey: BILLING_CONFIG_KEY,
    staleTime: 20_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
    queryFn: async (): Promise<BillingConfig> => {
      const db = supabase as any;
      const [p, s] = await Promise.all([
        db.from("billing_plans").select("code,name,monthly_price,max_students,is_active,sort_order").order("sort_order"),
        db.from("billing_settings").select("annual_free_months").eq("id", true).maybeSingle(),
      ]);
      if (p.error) throw p.error;
      if (s.error) throw s.error;
      const free = Number(s.data?.annual_free_months);
      return { plans: (p.data ?? []).map(toBillingPlan), freeMonths: Number.isInteger(free) ? free : DEFAULT_ANNUAL_FREE_MONTHS, loaded: true };
    },
  });
  return { plans: data?.plans ?? [], freeMonths: data?.freeMonths ?? DEFAULT_ANNUAL_FREE_MONTHS, loaded: !!data?.loaded, isLoading, error };
}
