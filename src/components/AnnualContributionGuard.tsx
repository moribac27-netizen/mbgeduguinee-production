import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { usePerStudentPlan } from "@/hooks/usePerStudentPlan";
import { useMyFlatOffer } from "@/hooks/useMyFlatOffer";

const BLOCKED_WHEN_RESTRICTED = ["/notes", "/bulletins", "/cartes", "/examens", "/rapports", "/resultats-generaux", "/analyse-scolaire"];

function matches(pathname: string, list: string[]) {
  return list.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Applique le niveau d'accès global calculé côté serveur par le registre des cotisations. */
export function AnnualContributionGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();
  const { info, loading: accessLoading, error } = usePerStudentPlan();
  const { flat, loading: flatLoading } = useMyFlatOffer();
  const navigate = useNavigate();

  useEffect(() => {
    if (saLoading || accessLoading || flatLoading || isSuperAdmin || error) return;
    if (info.accessMode === "RESTRICTED" && matches(pathname, BLOCKED_WHEN_RESTRICTED)) {
      // Établissement sous forfait : la page de régularisation est « Mon forfait », pas les cotisations par élève.
      navigate({ to: flat ? "/mon-forfait" : "/cotisations", replace: true });
    }
  }, [pathname, saLoading, accessLoading, flatLoading, flat, isSuperAdmin, error, info.accessMode, navigate]);

  return null;
}
