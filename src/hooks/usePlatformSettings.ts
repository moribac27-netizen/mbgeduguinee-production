import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FlatTexts { title?: string; subtitle?: string; message?: string }

export const FLAT_TEXTS_KEY = ["platform-setting", "public.flat_offers_texts"];

/** Textes de la catégorie « Plans par établissement » modifiables par le Super Admin ; null = valeurs par défaut du code. */
export function useFlatTexts(): FlatTexts | null {
  const { data } = useQuery({
    queryKey: FLAT_TEXTS_KEY,
    staleTime: 30_000,
    refetchInterval: 120_000,
    retry: false,
    queryFn: async (): Promise<FlatTexts | null> => {
      const { data, error } = await (supabase as any).from("platform_settings").select("value").eq("key", "public.flat_offers_texts").maybeSingle();
      if (error || !data?.value) return null;
      const v = data.value as Record<string, unknown>;
      const t = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : undefined);
      return { title: t(v.title), subtitle: t(v.subtitle), message: t(v.message) };
    },
  });
  return data ?? null;
}
