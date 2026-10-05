import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { usePerStudentPlan } from "@/hooks/usePerStudentPlan";

const BLOCKED_WHEN_RESTRICTED = ["/notes", "/bulletins", "/cartes", "/examens", "/rapports", "/resultats-generaux", "/analyse-scolaire"];

function matches(pathname: string, list: string[]) {
  return list.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Applique le niveau d'accès global calculé côté serveur par le registre des cotisations. */
export function AnnualContributionGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();
  const { info, loading: accessLoading, error } = usePerStudentPlan();
  const navigate = useNavigate();

  useEffect(() => {
    if (saLoading || accessLoading || isSuperAdmin || error) return;
    if (info.accessMode === "RESTRICTED" && matches(pathname, BLOCKED_WHEN_RESTRICTED)) {
      navigate({ to: "/cotisations", replace: true });
    }
  }, [pathname, saLoading, accessLoading, isSuperAdmin, error, info.accessMode, navigate]);

  return null;
}
