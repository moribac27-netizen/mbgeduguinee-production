import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDateFr } from "@/lib/flat-offers";
import { formatPublicGNF } from "@/lib/public-offers";

export interface SchoolSuspension {
  suspended: boolean;
  school_name?: string;
  offer_name?: string;
  since?: string | null;
  phase?: string;
  can_manage?: boolean;
  balance?: number | null;
  overdue_amount?: number | null;
  next_due_date?: string | null;
  pay_now?: number | null;
}

export const SCHOOL_SUSPENSION_KEY = ["school-suspension"];

/** Statut de suspension de MON établissement, décidé par la base (aucun calcul ici). En cas d'erreur, l'écran n'est pas bloqué : le serveur refuse de toute façon les données. */
export function useSchoolSuspension() {
  const q = useQuery({
    queryKey: SCHOOL_SUSPENSION_KEY,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("my_school_suspension");
      if (error) return { suspended: false } as SchoolSuspension;
      return (data ?? { suspended: false }) as SchoolSuspension;
    },
  });
  return { suspension: q.data ?? { suspended: false }, loading: q.isLoading };
}

/** Pages encore accessibles aux responsables pour régulariser : la situation financière et le paiement. */
const ALLOWED_WHEN_SUSPENDED = ["/mon-forfait"];

export function SuspensionGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { suspension } = useSchoolSuspension();
  if (!suspension.suspended) return <>{children}</>;
  // La Vue Fondateur gère elle-même la suspension (la base ne renvoie alors que la partie abonnement).
  if (pathname === "/fondateur" || pathname.startsWith("/fondateur/")) return <>{children}</>;
  const allowed = suspension.can_manage && ALLOWED_WHEN_SUSPENDED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (allowed) return <>{children}</>;
  return <SuspendedScreen s={suspension} />;
}

function SuspendedScreen({ s }: { s: SchoolSuspension }) {
  return (
    <div className="mx-auto max-w-2xl py-10" data-testid="suspended-screen">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 sm:p-8">
        <div className="flex items-center gap-3 text-red-900"><Lock className="size-6" /><h1 className="font-display text-xl font-bold">Accès de l'établissement suspendu</h1></div>
        <p className="mt-4 text-sm leading-6 text-red-950">
          {s.school_name ? <><strong>{s.school_name}</strong> : </> : null}
          un paiement de l'abonnement{s.offer_name ? ` (formule ${s.offer_name})` : ""} n'a pas été réglé dans le délai autorisé.
          Tant qu'il n'est pas régularisé, l'accès à la plateforme est suspendu pour tous les utilisateurs de l'établissement.
          <strong> Aucune donnée n'est perdue</strong> : tout est rétabli automatiquement dès que le paiement est confirmé.
        </p>
        {s.can_manage ? (
          <>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              {s.overdue_amount != null && Number(s.overdue_amount) > 0 && <div className="rounded-lg bg-white p-3"><dt className="text-xs text-muted-foreground">Montant en retard</dt><dd className="font-semibold">{formatPublicGNF(Number(s.overdue_amount))}</dd></div>}
              {s.pay_now != null && Number(s.pay_now) > 0 && <div className="rounded-lg bg-white p-3"><dt className="text-xs text-muted-foreground">À régler maintenant</dt><dd className="font-semibold">{formatPublicGNF(Number(s.pay_now))}</dd></div>}
              {s.balance != null && <div className="rounded-lg bg-white p-3"><dt className="text-xs text-muted-foreground">Solde annuel restant</dt><dd className="font-semibold">{formatPublicGNF(Number(s.balance))}</dd></div>}
              {s.next_due_date && <div className="rounded-lg bg-white p-3"><dt className="text-xs text-muted-foreground">Prochaine échéance</dt><dd className="font-semibold">{formatDateFr(s.next_due_date)}</dd></div>}
            </dl>
            <p className="mt-4 text-sm">Pour régulariser : ouvrez « Mon forfait », effectuez le paiement puis déclarez sa référence. L'accès est rétabli dès la validation.</p>
            <Button asChild className="mt-4"><Link to="/mon-forfait">Régulariser mon paiement</Link></Button>
          </>
        ) : (
          <p className="mt-4 text-sm">Veuillez contacter la direction de votre établissement pour qu'elle régularise l'abonnement.</p>
        )}
      </div>
    </div>
  );
}
