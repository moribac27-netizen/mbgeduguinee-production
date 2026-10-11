import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { usePerStudentPlan } from "@/hooks/usePerStudentPlan";
import { homeForRoles } from "@/lib/access";
import { loginAllowed, loginDeniedMessage, pathBlockedByOffer, MODULE_LABELS, moduleOfPath } from "@/lib/offers";

/**
 * Applique l'offre de l'établissement sur les routes (même en tapant l'URL à la main) :
 * - connexion Parents / Élèves selon l'offre (sinon déconnexion avec explication) ;
 * - modules Cantine / Infirmerie / Bibliothèque désactivés.
 * Le serveur applique les mêmes règles (RLS) : cette garde n'est que l'interface.
 */
export function OfferGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, loading: rolesLoading, error: rolesError } = useRoles();
  const { isSuperAdmin, loading: saLoading, error: saError } = useSuperAdmin();
  const { info, loading: planLoading, error: planError } = usePerStudentPlan();
  const navigate = useNavigate();
  const denied = useRef<string | null>(null);

  useEffect(() => {
    if (rolesLoading || saLoading || planLoading || rolesError || saError || planError) return;
    const offer = info.offer;
    if (!offer || isSuperAdmin) return;

    if (!loginAllowed(roles, false, offer)) {
      if (denied.current === "__login__") return;
      denied.current = "__login__";
      toast.error("Connexion non incluse dans l'offre", { description: loginDeniedMessage(roles) });
      void supabase.auth.signOut().then(() => navigate({ to: "/auth", replace: true }));
      return;
    }
    if (pathBlockedByOffer(pathname, offer, false)) {
      if (denied.current === pathname) return;
      denied.current = pathname;
      const m = moduleOfPath(pathname);
      toast.error("Module non inclus dans l'offre", { description: `${m ? MODULE_LABELS[m] : "Ce module"} n'est pas disponible avec l'offre ${offer.name} de votre établissement.` });
      navigate({ to: homeForRoles(roles, false), replace: true });
      return;
    }
    denied.current = null;
  }, [pathname, roles, isSuperAdmin, info.offer, rolesLoading, saLoading, planLoading, rolesError, saError, planError, navigate]);

  return null;
}
