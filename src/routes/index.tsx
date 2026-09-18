import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  School, Users, GraduationCap, ClipboardList, CreditCard, Megaphone,
  BarChart3, Check, X, ArrowRight, Sparkles, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SubscriptionHistory } from "@/components/SubscriptionHistory";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MBGEduGuinée — Gestion scolaire numérique en Guinée" },
      { name: "description", content: "Plateforme complète pour écoles primaires, collèges, lycées et centres de formation. Élèves, notes, paiements, communication." },
      { property: "og:title", content: "MBGEduGuinée — Gestion scolaire numérique" },
      { property: "og:description", content: "Digitalisez votre établissement scolaire en Guinée." },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Users, title: "Gestion des élèves", desc: "Inscriptions, dossiers, classes, photos." },
  { icon: GraduationCap, title: "Enseignants", desc: "Matières, emploi du temps, salaires." },
  { icon: ClipboardList, title: "Notes & bulletins", desc: "Moyennes, classement, bulletins PDF." },
  { icon: CreditCard, title: "Paiements", desc: "Frais, reçus, relances automatiques." },
  { icon: Megaphone, title: "Communication", desc: "Annonces, notifications aux parents." },
  { icon: BarChart3, title: "Rapports", desc: "Statistiques financières et académiques." },
];

const FAQ = [
  { q: "Puis-je essayer MBGEduGuinée gratuitement ?", a: "Oui. Chaque nouvelle école bénéficie automatiquement d'une période d'essai gratuite de 30 jours, sans carte bancaire." },
  { q: "Quels moyens de paiement acceptez-vous ?", a: "Nous préparons l'intégration Orange Money, Mobile Money (MTN/Moov), Stripe (carte bancaire) et PayPal. Vous pouvez actuellement souscrire depuis votre espace et notre équipe vous accompagne pour la première facturation." },
  { q: "Comment fonctionne le plan par élève ?", a: "Après la création de votre établissement, vous accédez à un espace détaillant le tarif exact par élève et la part reversée à votre école. Créez votre compte pour découvrir tous les détails." },
  { q: "Mes données sont-elles sécurisées ?", a: "Chaque école est isolée par des politiques strictes (multi-tenant + RLS). Les sauvegardes sont automatiques et chiffrées." },
  { q: "Proposez-vous une formation ?", a: "Oui. Toutes les offres incluent une prise en main et un accompagnement personnalisé." },
];

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly?: number | null;
  currency: string;
  student_limit: number | null;
  features: string[];
  is_popular: boolean;
  display_order: number;
};

type CurrentSub = {
  id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string;
  plan: { name: string; code: string } | null;
} | null;

function formatPrice(v: number) {
  return new Intl.NumberFormat("fr-FR").format(v);
}
function formatDate(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function Landing() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [currentSub, setCurrentSub] = useState<CurrentSub>(null);
  const [renewOpen, setRenewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renewPlanId, setRenewPlanId] = useState<string>("");
  const [renewCycle, setRenewCycle] = useState<"monthly" | "yearly">("monthly");
  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [publicCycle, setPublicCycle] = useState<"monthly" | "yearly">("monthly");

  async function refreshSubscription(sid: string) {
    const { data: sub } = await (supabase as any)
      .from("school_subscriptions")
      .select("id,status,trial_ends_at,current_period_end,plan:subscription_plans(name,code)")
      .eq("school_id", sid)
      .maybeSingle();
    setCurrentSub(sub ?? null);
    return sub ?? null;
  }

  async function confirmRenew() {
    if (!renewPlanId) return;
    setRenewing(true);
    setRenewError(null);
    try {
      const code = plans.find((p) => p.id === renewPlanId)?.code;
      setConfirmOpen(false);
      setRenewOpen(false);
      toast.info("Réglez votre abonnement par Orange Money pour l'activer.");
      navigate({ to: "/souscription", search: code ? { plan: code } : {} });
    } finally {
      setRenewing(false);
    }
  }


  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      setPlans(
        (data ?? []).map((p: any) => ({
          ...p,
          features: Array.isArray(p.features) ? p.features : [],
        })),
      );
      setLoading(false);
    })();

    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);
      const { data: prof } = await supabase
        .from("profiles").select("school_id").eq("id", u.user.id).maybeSingle();
      if (!prof?.school_id) return;
      setSchoolId(prof.school_id);
      await refreshSubscription(prof.school_id);
    })();
  }, []);


  function handleChoose(planCode: string) {
    const search = { plan: planCode, cycle: publicCycle } as any;
    if (userId) {
      navigate({ to: "/souscription", search });
    } else {
      navigate({ to: "/auth", search });
    }
  }

  // Build comparison rows: union of features across plans
  const allFeatures = Array.from(
    new Set(plans.flatMap((p) => p.features)),
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
              <School className="size-5" />
            </div>
            <div>
              <div className="font-display font-bold text-lg leading-none">MBGEduGuinée</div>
              <div className="text-xs text-muted-foreground mt-1">Gestion scolaire</div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#fonctionnalites" className="text-muted-foreground hover:text-foreground">Fonctionnalités</a>
            <a href="#tarifs" className="text-muted-foreground hover:text-foreground">Tarifs</a>
            <a href="#faq" className="text-muted-foreground hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            {userId ? (
              <Link to="/dashboard"><Button size="sm">Mon espace</Button></Link>
            ) : (
              <>
                <Link to="/auth"><Button variant="ghost" size="sm">Connexion</Button></Link>
                <Link to="/auth"><Button size="sm">Commencer</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/10 pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-20 lg:py-28 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 text-sm font-medium mb-6">
              <span className="size-2 rounded-full bg-accent" />
              Conçu pour les écoles guinéennes
            </div>
            <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight">
              La gestion scolaire qui simplifie le quotidien de votre établissement.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
              MBGEduGuinée digitalise inscriptions, notes, paiements, comptabilité et communication.
              Écoles primaires, collèges, lycées et centres de formation.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth">
                <Button size="lg" className="gap-2">Démarrer gratuitement <ArrowRight className="size-4" /></Button>
              </Link>
              <a href="#tarifs"><Button size="lg" variant="outline">Voir les tarifs</Button></a>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="fonctionnalites" className="py-20 border-t">
        <div className="max-w-6xl mx-auto px-4 lg:px-6">
          <div className="max-w-2xl mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold">Tout votre établissement, en un seul endroit.</h2>
            <p className="mt-4 text-muted-foreground">Des outils pensés pour les directeurs, enseignants, parents et élèves.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="p-6 rounded-xl border bg-card hover:border-primary/40 transition-colors">
                  <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4"><Icon className="size-5" /></div>
                  <h3 className="font-display font-semibold text-lg">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="tarifs" className="py-20 border-t bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 lg:px-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Sparkles className="size-4" /> Aucun abonnement mensuel
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-bold">Un tarif juste, basé sur vos élèves</h2>
            <p className="mt-4 text-muted-foreground">Votre école touche une part sur chaque élève inscrit et payant. Créez votre établissement pour voir le détail complet.</p>
          </div>

          {currentSub && (
            <div className="max-w-3xl mx-auto mb-10 p-5 rounded-xl border bg-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Votre abonnement actuel</div>
                <div className="font-display font-semibold text-lg">
                  {currentSub.plan?.name ?? "—"}{" "}
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary uppercase">
                    {currentSub.status}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {currentSub.status === "trial"
                    ? `Essai jusqu'au ${formatDate(currentSub.trial_ends_at)}`
                    : `Valide jusqu'au ${formatDate(currentSub.current_period_end)}`}
                </div>
              </div>
              <Button
                onClick={() => {
                  setRenewPlanId(
                    plans.find((p) => p.code === currentSub.plan?.code)?.id ?? plans[0]?.id ?? "",
                  );
                  setRenewOpen(true);
                }}
              >
                {currentSub.status === "trial" ? "Choisir une offre" : "Renouveler / Changer d'offre"}
              </Button>

            </div>
          )}

          <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Renouveler ou changer d'offre</DialogTitle>
                <DialogDescription>
                  Sélectionnez l'offre et le cycle de facturation souhaités.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-medium mb-2">Offre</div>
                  <Select value={renewPlanId} onValueChange={setRenewPlanId}>
                    <SelectTrigger><SelectValue placeholder="Choisir une offre" /></SelectTrigger>
                    <SelectContent>
                      {plans.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {formatPrice(p.price_monthly)} {p.currency}/mois
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-sm font-medium mb-2">Cycle de facturation</div>
                  <Select value={renewCycle} onValueChange={(v: any) => setRenewCycle(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensuel</SelectItem>
                      <SelectItem value="yearly">Annuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRenewOpen(false)} disabled={renewing}>
                  Annuler
                </Button>
                <Button
                  onClick={() => { setRenewError(null); setConfirmOpen(true); }}
                  disabled={renewing || !renewPlanId || !schoolId}
                >
                  Continuer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Confirmation récapitulative */}
          <Dialog open={confirmOpen} onOpenChange={(o) => { if (!renewing) setConfirmOpen(o); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirmer la modification</DialogTitle>
                <DialogDescription>
                  Vérifiez le récapitulatif avant de valider. Cette action met à jour l'abonnement de votre école.
                </DialogDescription>
              </DialogHeader>
              {(() => {
                const p = plans.find((x) => x.id === renewPlanId);
                const price = p
                  ? renewCycle === "yearly"
                    ? (p as any).price_yearly ?? p.price_monthly * 12
                    : p.price_monthly
                  : 0;
                return (
                  <div className="rounded-xl border bg-muted/40 p-4 text-sm space-y-2">
                    <div className="flex justify-between"><span className="text-muted-foreground">Offre</span><span className="font-medium">{p?.name ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Période</span><span className="font-medium">{renewCycle === "yearly" ? "Annuel (yearly)" : "Mensuel (monthly)"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Montant</span><span className="font-medium">{formatPrice(price)} {p?.currency ?? "GNF"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Offre actuelle</span><span className="font-medium">{currentSub?.plan?.name ?? "—"}</span></div>
                  </div>
                );
              })()}
              {renewError && (
                <div className="text-sm text-destructive">{renewError}</div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={renewing}>
                  Annuler
                </Button>
                <Button onClick={confirmRenew} disabled={renewing || !renewPlanId || !schoolId}>
                  {renewing && <Loader2 className="size-4 mr-2 animate-spin" />}
                  {renewing ? "Traitement en cours…" : renewError ? "Réessayer" : "Valider"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {schoolId && <SubscriptionHistory schoolId={schoolId} refreshKey={historyKey} />}



          <div className="grid md:grid-cols-1 max-w-md mx-auto gap-6">
            {loading && (
              <div className="p-8 rounded-2xl border bg-card animate-pulse h-80" />
            )}
            {!loading && plans.map((p) => {
              const perStudent = (p as any).billing_model === "per_student";
              const unit = Number((p as any).price_per_student ?? 0);
              const share = Number((p as any).school_share_per_student ?? 0);
              const threshold = Number((p as any).access_threshold_students ?? 20);
              return (
              <div key={p.id} className={"p-8 rounded-2xl border bg-card relative " + (p.is_popular ? "border-primary shadow-lg ring-1 ring-primary/20" : "")}>
                {p.is_popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">Recommandé</div>}
                <h3 className="font-display text-2xl font-bold">{p.name}</h3>
                {p.description && <p className="text-sm text-muted-foreground mt-2">{p.description}</p>}

                <div className="mt-4 flex items-baseline gap-1">
                  {perStudent && !userId ? (
                    <span className="text-2xl font-bold">Détails après inscription</span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold">
                        {formatPrice(perStudent ? unit : (publicCycle === "yearly" ? (p.price_yearly ?? p.price_monthly * 12) : p.price_monthly))}
                      </span>
                      <span className="text-muted-foreground">
                        {p.currency}{perStudent ? " / élève / an" : `/${publicCycle === "yearly" ? "an" : "mois"}`}
                      </span>
                    </>
                  )}
                </div>

                {perStudent ? (
                  userId ? (
                    <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                      <p>
                        Chaque élève doit régler {formatPrice(unit)} {p.currency}/an. Deux options : paiement individuel
                        par l'élève ou le parent directement sur la plateforme, ou paiement groupé par l'école pour les
                        élèves dont elle a déjà collecté l'argent.
                      </p>
                      <p>
                        Votre école reçoit {formatPrice(share)} {p.currency} par élève payé, quel que soit le mode.
                        L'accès complet est activé dès que {threshold} élèves ont payé.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                      <p>Aucun abonnement mensuel. Votre école touche une part sur chaque élève inscrit et payant.</p>
                      <p className="font-medium text-foreground">Créez votre établissement pour découvrir le tarif exact et le montant reversé à votre école.</p>
                    </div>
                  )
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent/20 text-accent-foreground">
                      <Sparkles className="size-3" /> 30 jours gratuits
                    </div>
                  </div>
                )}
                <ul className="mt-6 space-y-2 text-sm">
  {(perStudent && !userId
    ? [
        "Aucun abonnement mensuel fixe",
        "Tarif par élève avec part reversée à l'école",
        "Accès complet dès un seuil d'élèves payés",
        "Paiement groupé (école) ou individuel (parent/élève)",
        "Reçu imprimable par élève",
      ]
    : p.features
  ).map((f) => (
    <li key={f} className="flex gap-2"><Check className="size-4 text-primary mt-0.5 shrink-0" />{f}</li>
  ))}
</ul>
                <Button
                  className="w-full mt-6"
                  variant={p.is_popular ? "default" : "outline"}
                  onClick={() => handleChoose(p.code)}
                >
                  Choisir {p.name}
                </Button>
              </div>
              );
            })}

          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 border-t">
        <div className="max-w-3xl mx-auto px-4 lg:px-6">
          <div className="text-center mb-10">
            <h2 className="font-display text-3xl md:text-4xl font-bold">Questions fréquentes</h2>
            <p className="mt-4 text-muted-foreground">Tout ce qu'il faut savoir avant de vous lancer.</p>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {FAQ.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <footer className="border-t py-8">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 flex flex-col sm:flex-row justify-between gap-4 text-sm text-muted-foreground">
          <div>© 2026 MBGEduGuinée. Conçu en Guinée pour les écoles guinéennes.</div>
          <div>Conakry · contact@eduguinee.gn</div>
        </div>
      </footer>
    </div>
  );
}