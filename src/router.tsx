import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { supabase } from "@/integrations/supabase/client";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  // Les données en cache appartiennent à un compte : à chaque changement de compte (inscription puis connexion,
  // déconnexion, autre école), on repart d'un cache vide. Sans cela, un menu pouvait garder l'état de l'ancien
  // compte (ex. « Mon forfait » absent pour un directeur qui vient de créer son école).
  if (typeof window !== "undefined") {
    let lastUserId: string | null | undefined;
    supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id ?? null;
      if (lastUserId !== undefined && id !== lastUserId) queryClient.clear();
      lastUserId = id;
    });
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
};
