import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, School } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useFlatOffers } from "@/hooks/useFlatOffers";
import { FLAT_OFFERS_TOP_MESSAGE, flatOffersNotice, studentRangeText } from "@/lib/flat-offers";
import { formatPublicGNF } from "@/lib/public-offers";
import { CREATE_SCHOOL_PATH } from "@/lib/signup-offer";

export const Route = createFileRoute("/offres-etablissement")({
  ssr: false,
  head: () => ({ meta: [{ title: "Offres établissement — MBGEduGuinée" }, { name: "description", content: "Offres par établissement, valables uniquement pour l'année académique en cours." }] }),
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
      <main className="mx-auto max-w-5xl px-4 py-10 lg:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="border-[#19B5A5]/20 bg-[#EAF7F5] text-[#0B1F3A]">Offres établissement</Badge>
          <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Un forfait pour tout l'établissement</h1>
          {offers.length > 0 && (
            <p className="mt-4 rounded-xl border border-[#19B5A5]/40 bg-[#EAF7F5] p-4 text-sm leading-6">{FLAT_OFFERS_TOP_MESSAGE}</p>
          )}
        </div>

        {offers.length === 0 ? (
          <div className="mx-auto mt-10 max-w-xl rounded-xl border bg-white p-6 text-center">
            <p className="font-medium">Les offres par établissement ne sont plus proposées.</p>
            <p className="mt-2 text-sm text-muted-foreground">Choisissez l'une des trois offres par élève.</p>
            <Button asChild className="mt-5"><Link to={CREATE_SCHOOL_PATH}>Voir les offres par élève</Link></Button>
          </div>
        ) : (
          <>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {offers.map((o) => (
                <Card key={o.code} className="border-[#0B1F3A]/15 shadow-sm">
                  <CardContent className="flex h-full flex-col p-7">
                    <div className="text-sm font-medium text-muted-foreground">{o.name}</div>
                    <div className="mt-1 text-sm font-semibold">{studentRangeText(o)}</div>
                    <div className="mt-4 font-display text-4xl font-bold">{formatPublicGNF(o.monthlyPrice).replace(" GNF", "")} <span className="text-lg">GNF / mois</span></div>
                    <div className="mt-2 rounded-xl bg-[#EEF4FA] p-3 text-sm">
                      Paiement annuel : <strong>{formatPublicGNF(o.annualPrice)}</strong> / an
                      {o.freeMonths > 0 && <> — <strong>{o.freeMonths} mois offerts</strong> si vous payez à l'année</>}
                    </div>
                    <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                      {[
                        o.modules.cantine && o.modules.infirmerie && o.modules.bibliotheque ? "Cantine, Infirmerie et Bibliothèque" : null,
                        o.parentLogin ? "Connexion des parents" : null,
                        o.studentLogin ? "Connexion des élèves" : null,
                        "Aucune cotisation par élève : le forfait la remplace",
                        "Personnel de l'établissement (direction, enseignants, administration)",
                      ].filter(Boolean).map((t) => (
                        <li key={t as string} className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-[#0B1F3A]" /><span>{t}</span></li>
                      ))}
                    </ul>
                    <Button className="mt-7" asChild><Link to={CREATE_SCHOOL_PATH} search={{ offre: o.code }}>Choisir {o.name}</Link></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">{flatOffersNotice(offers)} Les paiements sont déclarés puis validés par l'administration de la plateforme ; choisir une offre n'est pas un paiement.</p>
          </>
        )}
      </main>
    </div>
  );
}
