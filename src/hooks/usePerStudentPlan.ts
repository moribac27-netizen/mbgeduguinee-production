import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { PER_STUDENT_ACCESS_THRESHOLD, PER_STUDENT_SCHOOL_SHARE_GNF, PER_STUDENT_UNIT_PRICE_GNF } from "@/lib/pricing";
import { getCurrentAcademicYear } from "@/lib/academic-year";
import type { OfferConditions } from "@/lib/offers";

export interface PerStudentPlanInfo {
  schoolId: string | null;
  isPerStudent: true;
  planName: string;
  unitPrice: number;
  schoolShare: number;
  threshold: number;
  academicYear: string;
  paidCount: number;
  unlocked: boolean;
  accessMode: "RESTRICTED" | "FULL";
  schoolRevenue: number;
  remaining: number;
  /** Offre de l'établissement (null tant qu'elle n'est pas chargée ou si l'utilisateur n'a pas d'école). */
  offer: OfferConditions | null;
}

const EMPTY: PerStudentPlanInfo = {
  schoolId: null,
  isPerStudent: true,
  planName: "Cotisation annuelle par élève",
  unitPrice: PER_STUDENT_UNIT_PRICE_GNF,
  schoolShare: PER_STUDENT_SCHOOL_SHARE_GNF,
  threshold: PER_STUDENT_ACCESS_THRESHOLD,
  academicYear: "",
  paidCount: 0,
  unlocked: false,
  accessMode: "RESTRICTED",
  schoolRevenue: 0,
  remaining: PER_STUDENT_ACCESS_THRESHOLD,
  offer: null,
};

/** Source unique côté frontend pour l'état financier de l'établissement. */
export function usePerStudentPlan() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["annual-contribution-access"],
    staleTime: 15_000,
    // Les conditions de l'offre (prix, commission, droits) peuvent changer : relecture automatique.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PerStudentPlanInfo> => {
      const { data: sid, error: sidError } = await supabase.rpc("current_school_id");
      if (sidError) throw sidError;
      if (!sid) return EMPTY;

      const schoolId = sid as unknown as string;
      const { data: summary, error: summaryError } = await (supabase as any).rpc("school_access_summary", { _school_id: schoolId });
      if (summaryError) throw summaryError;
      const { data: school, error: schoolError } = await supabase.from("schools").select("academic_year").eq("id", schoolId as any).maybeSingle();
      if (schoolError) throw schoolError;

      const s = (summary ?? {}) as any;
      const paidCount = Number(s.paid_count ?? 0);
      const threshold = Number(s.threshold ?? PER_STUDENT_ACCESS_THRESHOLD);
      const accessMode = s.access_mode === "FULL" ? "FULL" : "RESTRICTED";
      const academicYear = String(s.academic_year ?? getCurrentAcademicYear());

      // Offre active de l'établissement pour l'année scolaire : instantané des conditions (prix, commission, droits).
      // Sans souscription enregistrée, l'établissement garde ses conditions historiques (50 000 / 15 000 GNF).
      const { data: sub, error: subError } = await (supabase as any)
        .from("school_offer_subscriptions")
        .select("offer_code, offer_name, annual_price_per_student, school_commission_per_student, parent_login_allowed, student_login_allowed, features, payer_roles")
        .eq("school_id", schoolId)
        .eq("academic_year", academicYear)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (subError) throw subError;

      const unitPrice = Number(sub?.annual_price_per_student ?? s.unit_price ?? PER_STUDENT_UNIT_PRICE_GNF);
      const schoolShare = Number(sub?.school_commission_per_student ?? s.school_share ?? PER_STUDENT_SCHOOL_SHARE_GNF);
      const offer: OfferConditions | null = sub
        ? {
            code: String(sub.offer_code),
            name: String(sub.offer_name ?? sub.offer_code),
            unit_price: unitPrice,
            school_commission: schoolShare,
            parent_login: !!sub.parent_login_allowed,
            student_login: !!sub.student_login_allowed,
            payer_roles: Array.isArray(sub.payer_roles) ? sub.payer_roles.map(String) : [],
            modules: { cantine: sub.features?.cantine !== false, infirmerie: sub.features?.infirmerie !== false, bibliotheque: sub.features?.bibliotheque !== false },
          }
        : null;

      return {
        schoolId,
        offer,
        isPerStudent: true,
        planName: offer ? `Offre ${offer.name}` : "Cotisation annuelle par élève",
        unitPrice,
        schoolShare,
        threshold,
        academicYear,
        paidCount,
        unlocked: accessMode === "FULL",
        accessMode,
        schoolRevenue: paidCount * schoolShare,
        remaining: Number(s.remaining ?? Math.max(0, threshold - paidCount)),
      };
    },
  });

  return { info: data ?? EMPTY, loading: isLoading, error, refetch };
}

export function usePaidStudentIds(schoolId: string | null, academicYear: string, enabled = true) {
  const { isSuperAdmin } = useSuperAdmin();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["validated-student-ids", schoolId, academicYear],
    enabled: !!schoolId && !!academicYear && enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase as any)
        .from("student_plan_payments")
        .select("student_id")
        .eq("school_id", schoolId)
        .eq("academic_year", academicYear)
        .eq("status", "VALIDATED");
      if (error) throw error;
      return new Set(((data ?? []) as Array<{ student_id: string }>).map((r) => r.student_id));
    },
  });
  const paidIds = data ?? new Set<string>();
  /**
   * Déverrouillage d'un élève pour l'accès aux notes, bulletins, cartes, rapports.
   * Le Super Admin n'est jamais bloqué par le statut de cotisation ; les autres rôles
   * restent soumis à la cotisation VALIDATED. `paidIds` garde le vrai statut de paiement
   * (affichage des badges, page Cotisations) : ne pas l'utiliser pour verrouiller.
   */
  const isUnlocked = useCallback((studentId: string) => isSuperAdmin || paidIds.has(studentId), [isSuperAdmin, data]);
  return { paidIds, isUnlocked, loading: isLoading, refetch };
}
