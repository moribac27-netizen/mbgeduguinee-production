import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { usePerStudentPlan } from "@/hooks/usePerStudentPlan";

/** Routes encore accessibles quand l'abonnement classique est expiré. */
const ALLOWED_WHEN_EXPIRED = ["/abonnement", "/souscription", "/plans", "/cotisations", "/parent", "/eleve"];

/**
 * Routes bloquées quand le plan par élève n'a pas encore atteint son seuil :
 * uniquement la saisie de notes et les documents de sortie (bulletins, cartes,
 * examens, rapports, affectations). Tout le reste (Élèves, Classes, Enseignants,
 * Parents, Cotisations, etc.) reste accessible pour permettre d'atteindre le seuil.
 */
const BLOCKED_WHEN_UNPAID = ["/notes", "/bulletins", "/cartes", "/examens", "/rapports", "/affectations"];

function matches(pathname: string, list: string[]) {
  return list.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Redirige automatiquement vers /abonnement lorsque l'abonnement de l'école
 * est expiré (blocage total, hors liste blanche), ou vers /cotisations quand
 * le plan par élève n'a pas atteint son seuil (blocage ciblé sur notes/documents
 * de sortie uniquement). Le super admin conserve un accès complet.
 */
export function SubscriptionGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isExpired, loading } = useSubscriptionStatus();
  const { isSuperAdmin, loading: saLoading } = useSuperAdmin();
  const { info, loading: planLoading } = usePerStudentPlan();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || saLoading || planLoading || isSuperAdmin) return;

    // Cas 1 : abonnement classique expiré -> blocage total (liste blanche restrictive, inchangé)
    if (isExpired) {
      if (matches(pathname, ALLOWED_WHEN_EXPIRED)) return;
      navigate({ to: "/abonnement", replace: true });
      return;
    }

    // Cas 2 : plan par élève, seuil non atteint -> blocage ciblé uniquement
    if (info.isPerStudent && !info.unlocked) {
      if (matches(pathname, BLOCKED_WHEN_UNPAID)) {
        navigate({ to: "/cotisations", replace: true });
      }
      return;
    }
  }, [pathname, isExpired, loading, saLoading, planLoading, info.isPerStudent, info.unlocked, isSuperAdmin, navigate]);

  return null;
}