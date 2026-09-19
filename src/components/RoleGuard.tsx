import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRoles } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { canAccess, homeForRoles } from "@/lib/access";

export function RoleGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, loading: rolesLoading, error: rolesError } = useRoles();
  const { isSuperAdmin, loading: saLoading, error: saError } = useSuperAdmin();
  const navigate = useNavigate();
  const lastDeniedRef = useRef<string | null>(null);

  useEffect(() => {
    if (rolesLoading || saLoading) return;
    // Erreur technique (réseau, RLS temporaire...) : ne pas conclure à
    // "aucun rôle" ni déconnecter l'utilisateur sur un simple échec de requête.
    if (rolesError || saError) return;
    // Compte sans rôle attribué : aucun espace ne lui correspond.
    if (!isSuperAdmin && roles.length === 0) {
      if (lastDeniedRef.current === "__no-role__") return;
      lastDeniedRef.current = "__no-role__";
      toast.error("Compte non rattaché", {
        description: "Aucun rôle ne vous a encore été attribué. Contactez l'administrateur de votre établissement.",
      });
      void supabase.auth.signOut().then(() => navigate({ to: "/auth", replace: true }));
      return;
    }
    if (canAccess(pathname, roles, isSuperAdmin)) {
      lastDeniedRef.current = null;
      return;
    }
    if (lastDeniedRef.current === pathname) return;
    lastDeniedRef.current = pathname;
    const home = homeForRoles(roles, isSuperAdmin);
    toast.error("Accès refusé", {
      description: "Vous n'êtes pas autorisé à consulter cette page.",
    });
    navigate({ to: home, replace: true });
  }, [pathname, roles, isSuperAdmin, rolesLoading, saLoading, rolesError, saError, navigate]);

  return null;
}