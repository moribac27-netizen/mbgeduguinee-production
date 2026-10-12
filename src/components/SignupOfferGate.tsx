import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPublicGNF, type PublicOffer } from "@/lib/public-offers";
import { CREATE_SCHOOL_PATH } from "@/lib/signup-offer";

/**
 * Protège le formulaire de création d'un établissement : sans offre choisie, le formulaire n'est pas affiché
 * et l'utilisateur est renvoyé au choix de l'offre. Avec une offre, un rappel (modifiable) s'affiche au-dessus.
 */
export function SignupOfferGate({ offer, children }: { offer: PublicOffer | null; children: ReactNode }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (!offer) void navigate({ to: CREATE_SCHOOL_PATH, replace: true });
  }, [offer, navigate]);

  if (!offer) {
    return (
      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Choisissez d'abord une offre pour créer votre établissement.</p>
        <Button asChild size="sm" className="mt-3"><Link to={CREATE_SCHOOL_PATH}>Choisir une offre</Link></Button>
      </div>
    );
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#19B5A5]/40 bg-[#EAF7F5] p-3 text-sm text-[#0B1F3A]">
        <span className="flex items-center gap-2">
          <Check className="size-4 shrink-0" />
          <span>Offre choisie : <strong>{offer.name}</strong> — {formatPublicGNF(offer.price)} / élève / an</span>
        </span>
        <Link to={CREATE_SCHOOL_PATH} className="inline-flex items-center gap-1 text-xs font-medium underline-offset-2 hover:underline">
          <ArrowLeft className="size-3" /> Changer d'offre
        </Link>
      </div>
      {children}
    </>
  );
}
