import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, School, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveUserHome } from "@/lib/auth-redirect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePublicOffers } from "@/hooks/usePublicOffers";
import { formatPublicGNF, offerFeatures, type PublicOffer } from "@/lib/public-offers";
import { OFFER_DURATION_TEXT, offerConditions, readSignupOfferCode, resolveSignupOffer, saveSignupOfferCode, clearSignupOfferCode } from "@/lib/signup-offer";

export const Route = createFileRoute("/creer-etablissement")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { offre?: string } => ({ offre: typeof s.offre === "string" ? s.offre : undefined }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) throw redirect({ to: await resolveUserHome() });
  },
  head: () => ({ meta: [{ title: "Créer mon établissement — MBGEduGuinée" }] }),
  component: CreateSchoolOffer,
});

const STEPS = ["Offre", "Confirmation", "Établissement"];

function Stepper({ current }: { current: 1 | 2 }) {
  return (
    <ol className="mx-auto mb-8 flex max-w-xl items-center justify-center gap-2 text-xs sm:text-sm">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className={`flex size-7 items-center justify-center rounded-full border text-xs font-bold ${done ? "border-[#19B5A5] bg-[#19B5A5] text-[#06251f]" : active ? "border-[#0B1F3A] bg-[#0B1F3A] text-white" : "bg-white text-muted-foreground"}`}>
              {done ? <Check className="size-4" /> : n}
            </span>
            <span className={active ? "font-semibold" : "text-muted-foreground"}>{label}</span>
            {n < STEPS.length && <span className="mx-1 hidden h-px w-6 bg-border sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

function FeatureList({ offer }: { offer: PublicOffer }) {
  return (
    <ul className="space-y-2.5 text-sm">
      {offerFeatures(offer).map((f) => (
        <li key={f.label} className={f.included ? "flex gap-3" : "flex gap-3 text-muted-foreground"}>
          {f.included ? <Check className="mt-0.5 size-4 shrink-0 text-[#0B1F3A]" /> : <X className="mt-0.5 size-4 shrink-0" />}
          <span>{f.label}{f.included ? "" : " — non inclus"}</span>
        </li>
      ))}
    </ul>
  );
}

function CreateSchoolOffer() {
  const offers = usePublicOffers();
  const { offre } = Route.useSearch();
  // Le choix est conservé dans la session : retour arrière, rechargement ou changement de page ne le font pas perdre.
  const [code, setCode] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const fromUrl = offre ? resolveSignupOffer(offre, offers) : null;
    if (fromUrl) saveSignupOfferCode(fromUrl.code);
    setCode(fromUrl ? fromUrl.code : readSignupOfferCode());
    setReady(true);
    // Une seule initialisation : les offres sont rafraîchies ensuite sans écraser le choix de l'utilisateur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = resolveSignupOffer(code, offers);

  // Offre mémorisée mais retirée entre-temps par le Super Admin : on oublie le choix et on revient à la liste.
  useEffect(() => {
    if (ready && code && !selected) {
      clearSignupOfferCode();
      setCode(null);
    }
  }, [ready, code, selected]);

  function choose(o: PublicOffer) {
    saveSignupOfferCode(o.code);
    setCode(o.code);
    window.scrollTo?.({ top: 0 });
  }
  function change() {
    clearSignupOfferCode();
    setCode(null);
  }
  function next() {
    if (!selected) return;
    saveSignupOfferCode(selected.code);
    // /auth lit son contexte (espace + mode) dans l'URL : navigation complète, le choix reste dans la session.
    window.location.assign("/auth?role=etablissement&mode=signup");
  }

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

      <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8 lg:py-14">
        {!ready ? null : !selected ? (
          <>
            <Stepper current={1} />
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="secondary" className="border-[#19B5A5]/20 bg-[#EAF7F5] text-[#0B1F3A]">Étape 1 sur 3</Badge>
              <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Choisissez l'offre de votre établissement</h1>
              <p className="mt-3 leading-7 text-muted-foreground">Le tarif est par élève et par année scolaire. Vous devez sélectionner une offre pour continuer ; elle pourra être modifiée ensuite par l'administration de la plateforme.</p>
            </div>
            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {offers.map((o) => {
                const featured = o.code === "standard";
                return (
                  <Card key={o.code} className={featured ? "relative border-[#19B5A5] shadow-xl" : "border-[#0B1F3A]/15 shadow-sm"}>
                    <CardContent className="flex h-full flex-col p-7">
                      {featured && <Badge className="absolute -top-3 left-7 bg-[#19B5A5] text-[#06251f]">Le plus choisi</Badge>}
                      <div className="text-sm font-medium text-muted-foreground">Offre {o.name}</div>
                      <div className="mt-2 font-display text-4xl font-bold">{formatPublicGNF(o.price).replace(" GNF", "")} <span className="text-lg">GNF</span></div>
                      <div className="mt-1 text-sm text-muted-foreground">par élève / an</div>
                      <p className="mt-2 text-xs text-muted-foreground">{OFFER_DURATION_TEXT}</p>
                      <div className="mt-5 rounded-xl bg-[#EEF4FA] p-3 text-sm">
                        {o.commission > 0 ? <>Part reversée à l'établissement : <strong>{formatPublicGNF(o.commission)}</strong> par cotisation validée</> : <>Aucune part reversée à l'établissement</>}
                      </div>
                      <div className="mt-6 flex-1"><FeatureList offer={o} /></div>
                      <Button className="mt-7" variant={featured ? "default" : "outline"} onClick={() => choose(o)}>Choisir l'offre {o.name}</Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <Stepper current={2} />
            <div className="mx-auto max-w-2xl">
              <div className="text-center">
                <Badge variant="secondary" className="border-[#19B5A5]/20 bg-[#EAF7F5] text-[#0B1F3A]">Étape 2 sur 3</Badge>
                <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Confirmez votre offre</h1>
              </div>
              <Card className="mt-8 border-[#0B1F3A]/15 shadow-xl">
                <CardContent className="p-7 sm:p-9">
                  <div className="text-sm font-medium text-muted-foreground">Offre choisie</div>
                  <div className="mt-1 font-display text-2xl font-bold">{selected.name}</div>
                  <div className="mt-3 font-display text-4xl font-bold">{formatPublicGNF(selected.price).replace(" GNF", "")} <span className="text-lg">GNF</span></div>
                  <div className="mt-1 text-sm text-muted-foreground">par élève / an — {OFFER_DURATION_TEXT.toLowerCase()}</div>
                  <div className="mt-6"><FeatureList offer={selected} /></div>
                  <div className="mt-6 space-y-2 rounded-xl bg-[#EEF4FA] p-4 text-sm leading-6">
                    {offerConditions(selected).map((c) => <p key={c}>{c}</p>)}
                  </div>
                  <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <Button variant="outline" onClick={change}><ArrowLeft className="mr-2 size-4" /> Changer d'offre</Button>
                    <Button className="bg-[#0B1F3A] text-white hover:bg-[#123B68]" onClick={next}>Continuer <ArrowRight className="ml-2 size-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
