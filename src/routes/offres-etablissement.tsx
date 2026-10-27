import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, School } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlatOffersSection } from "@/components/FlatOffersSection";
import { useFlatOffers } from "@/hooks/useFlatOffers";
import { CREATE_SCHOOL_PATH } from "@/lib/signup-offer";

export const Route = createFileRoute("/offres-etablissement")({
  ssr: false,
  head: () => ({ meta: [{ title: "Plans par établissement — MBGEduGuinée" }, { name: "description", content: "Offre exceptionnelle par établissement, valable uniquement pour l'année scolaire en cours." }] }),
  component: FlatOffersPage,
});

function FlatOffersPage() {
  const offers = useFlatOffers();
  return (
    <div className="min-h-screen bg-[#F7F9FC] text-[#0B1F3A]">
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#0B1F3A] text-white shadow-sm"><School className="size-5" /></div>
            <div><div className="font-display font-bold leading-none">MBGEduGuinée</div><div className="mt-1 text-xs text-muted-foreground">Gestion scolaire</div></div>
          </Link>
          <Button variant="ghost" asChild className="text-[#0B1F3A]"><Link to="/"><ArrowLeft className="mr-2 size-4" /> Accueil</Link></Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-14">
        <FlatOffersSection />
        {offers.length === 0 && (
          <div className="mx-auto mt-10 max-w-xl rounded-xl border bg-white p-6 text-center">
            <p className="font-medium">Les plans par établissement ne sont plus proposés.</p>
            <p className="mt-2 text-sm text-muted-foreground">Choisissez l'un des trois plans par élève.</p>
            <Button asChild className="mt-5"><Link to={CREATE_SCHOOL_PATH}>Voir les plans par élève</Link></Button>
          </div>
        )}
      </main>
    </div>
  );
}
