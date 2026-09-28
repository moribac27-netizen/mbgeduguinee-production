import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  BookOpen,
  Bus,
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  CreditCard,
  GraduationCap,
  LayoutDashboard,
  Library,
  LockKeyhole,
  Megaphone,
  Receipt,
  School,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MBGEduGuinée — Gestion scolaire numérique" },
      {
        name: "description",
        content:
          "MBGEduGuinée centralise la gestion des établissements, des élèves, des notes, des présences, des paiements et de la communication en Guinée.",
      },
    ],
  }),
  component: Landing,
});

const LANDING_IMAGES = {
  students: "/images/mbg-eleves.png",
  school: "/images/mbg-etablissement.png",
} as const;

const featureGroups = [
  {
    title: "Pédagogie & suivi",
    icon: GraduationCap,
    items: [
      ["Gestion des élèves", "Inscriptions, dossiers, classes et photos.", Users],
      ["Enseignants", "Matières, emplois du temps et salaires.", BookOpen],
      ["Classes", "Organisation, niveaux et effectifs.", School],
      ["Notes & bulletins", "Moyennes, classements et bulletins PDF.", ClipboardList],
      ["Emploi du temps", "Planning par classe et enseignant.", CalendarClock],
      ["Présences", "Appel quotidien, retards et absences.", CalendarCheck],
    ],
  },
  {
    title: "Administration & finances",
    icon: Wallet,
    items: [
      ["Cotisations", "Cotisation annuelle de 50 000 GNF par élève.", CreditCard],
      ["Comptabilité", "Dépenses, soldes et rapports financiers.", Receipt],
      ["Suivi des paiements", "Déclarations, validations et contrôle des accès.", ShieldCheck],
      ["Accès par rôle", "Chaque espace est adapté à la fonction de l'utilisateur.", LockKeyhole],
    ],
  },
  {
    title: "Vie scolaire",
    icon: Sparkles,
    items: [
      ["Cantine", "Suivi des repas et inscriptions.", UtensilsCrossed],
      ["Bibliothèque", "Gestion des ouvrages et emprunts.", Library],
      ["Transport", "Suivi des circuits scolaires.", Bus],
      ["Communication", "Annonces et notifications aux parents.", Megaphone],
    ],
  },
] as const;

const audiences = [
  {
    title: "Direction",
    text: "Pilotez l'établissement avec une vue centralisée des élèves, équipes, activités et finances.",
    icon: LayoutDashboard,
  },
  {
    title: "Enseignants",
    text: "Retrouvez les classes, notes, présences et emplois du temps dans un même environnement.",
    icon: BookOpen,
  },
  {
    title: "Secrétariat & comptabilité",
    text: "Structurez les dossiers, paiements, cotisations et opérations administratives.",
    icon: Receipt,
  },
  {
    title: "Parents & élèves",
    text: "Accédez aux espaces scolaires prévus pour suivre la scolarité et les informations disponibles.",
    icon: Users,
  },
];

const steps = [
  ["01", "Créez votre établissement", "Inscription et configuration de votre école ou centre de formation.", UserPlus],
  ["02", "Ajoutez vos élèves", "Import ou saisie manuelle des élèves et de leurs classes.", Users],
  ["03", "Déclarez les cotisations", "50 000 GNF par élève et par année scolaire, individuellement ou en groupe.", CreditCard],
  ["04", "Suivez l'accès", "20 cotisations VALIDATED activent le mode FULL de l'établissement.", ShieldCheck],
] as const;

const faqs = [
  [
    "Quel est le modèle financier ?",
    "Le modèle unique est la cotisation annuelle de 50 000 GNF par élève et par année scolaire. Aucun abonnement fixe d'établissement n'est requis dans ce modèle.",
  ],
  [
    "Comment fonctionne le seuil de 20 ?",
    "Le compteur global utilise uniquement les cotisations au statut VALIDATED. De 0 à 19, l'établissement reste en mode RESTRICTED ; à partir de 20, il passe en mode FULL.",
  ],
  [
    "Un élève est-il automatiquement débloqué à 20 cotisations ?",
    "Non. Le seuil global et le dossier individuel sont indépendants. Le dossier d'un élève reste verrouillé tant que sa propre cotisation n'est pas VALIDATED.",
  ],
  [
    "Comment payer avec Orange Money ?",
    "Le transfert se fait vers le 628 49 98 12, bénéficiaire MBGEduGuinée, via #144#. La référence déclarée est ensuite contrôlée ; elle ne constitue pas à elle seule une preuve automatique de paiement.",
  ],
  [
    "Qui peut utiliser MBGEduGuinée ?",
    "La plateforme est conçue pour la Maternelle, les écoles primaires, collèges, lycées et centres de formation, avec des espaces adaptés aux différents rôles.",
  ],
  [
    "Les données des établissements sont-elles séparées ?",
    "L'application prévoit une séparation des données par établissement, des contrôles d'accès par rôle et des vérifications côté serveur pour les opérations sensibles.",
  ],
] as const;

function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex size-10 items-center justify-center rounded-2xl shadow-sm ${
          light ? "bg-white/15 text-white ring-1 ring-white/20" : "bg-primary text-primary-foreground"
        }`}
      >
        <School className="size-5" />
      </div>
      <div className="leading-none">
        <div className={`font-display text-lg font-bold ${light ? "text-white" : "text-foreground"}`}>
          MBGEduGuinée
        </div>
        <div className={`mt-1 text-[10px] font-medium uppercase tracking-[0.18em] ${light ? "text-white/60" : "text-muted-foreground"}`}>
          Gestion scolaire
        </div>
      </div>
    </div>
  );
}

function LoginChoice({ onClose }: { onClose: () => void }) {
  const choices = [
    ["Établissement / Direction", "Direction, enseignants et personnel", LayoutDashboard],
    ["Parent / Tuteur", "Suivre la scolarité de vos enfants", Users],
    ["Élève", "Accéder à votre espace scolaire", GraduationCap],
  ] as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-choice-title"
    >
      <button className="absolute inset-0 cursor-default" aria-label="Fermer" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/50 bg-card shadow-2xl">
        <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary/95 to-slate-900 px-6 py-7 text-white sm:px-8">
          <div className="absolute -right-12 -top-12 size-36 rounded-full bg-white/10 blur-2xl" />
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            aria-label="Fermer"
          >
            <X className="size-4" />
          </button>
          <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <School className="size-6" />
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Accès sécurisé</p>
          <h2 id="login-choice-title" className="font-display text-2xl font-bold sm:text-3xl">
            Accéder à MBGEduGuinée
          </h2>
          <p className="mt-2 max-w-md text-sm text-white/70">Choisissez simplement l'espace qui correspond à votre rôle.</p>
        </div>

        <div className="grid gap-3 p-5 sm:p-7">
          {choices.map(([title, description, Icon]) => (
            <Link
              key={title}
              to="/auth"
              onClick={onClose}
              className="group flex items-center gap-4 rounded-2xl border border-border/80 bg-background p-4 transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/[0.035] hover:shadow-md"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">{title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
            </Link>
          ))}
        </div>
        <div className="border-t bg-muted/25 px-5 py-5 text-center text-sm sm:px-7">
          <span className="text-muted-foreground">Vous n'avez pas encore accès ? </span>
          <Link to="/auth" onClick={onClose} className="font-semibold text-primary hover:underline">
            Demander un accès
          </Link>
        </div>
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[620px]">
      <div className="absolute -inset-4 rounded-[2.5rem] bg-primary/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 p-2 shadow-[0_35px_90px_-35px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90">
        <div className="rounded-[1.5rem] bg-slate-950 p-3 text-white sm:p-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary"><School className="size-4" /></div>
              <div>
                <div className="text-xs font-semibold">MBGEduGuinée</div>
                <div className="text-[9px] text-white/45">Tableau de bord</div>
              </div>
            </div>
            <div className="rounded-full bg-white/10 px-2.5 py-1 text-[9px] text-white/65">2026–2027</div>
          </div>

          <div className="grid gap-3 pt-4 sm:grid-cols-[0.75fr_1.25fr]">
            <div className="hidden rounded-2xl bg-white/[0.045] p-3 sm:block">
              <div className="mb-4 text-[9px] font-semibold uppercase tracking-widest text-white/35">Navigation</div>
              <div className="space-y-1.5 text-[10px]">
                {["Vue d'ensemble", "Élèves", "Classes", "Notes", "Paiements", "Communication"].map((item, index) => (
                  <div key={item} className={`rounded-lg px-2.5 py-2 ${index === 0 ? "bg-primary text-white" : "text-white/50"}`}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  ["Élèves", "428", Users],
                  ["Classes", "18", School],
                  ["Moyenne", "14,8", GraduationCap],
                  ["Paiements", "72%", CreditCard],
                ].map(([label, value, Icon]) => (
                  <div key={label as string} className="rounded-2xl bg-white/[0.055] p-3">
                    <div className="flex items-center justify-between text-white/40"><span className="text-[9px]">{label as string}</span><Icon className="size-3.5" /></div>
                    <div className="mt-2 text-xl font-bold">{value as string}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 rounded-2xl bg-white/[0.055] p-3">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[10px] font-semibold">Suivi scolaire</span>
                  <span className="text-[9px] text-emerald-300">À jour</span>
                </div>
                <div className="space-y-2">
                  {["Présences", "Notes publiées", "Cotisations"].map((item, index) => (
                    <div key={item}>
                      <div className="mb-1 flex justify-between text-[8px] text-white/45"><span>{item}</span><span>{["94%", "86%", "72%"][index]}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-primary" style={{ width: ["94%", "86%", "72%"][index] }} /></div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between rounded-2xl bg-primary/20 p-3 ring-1 ring-primary/20">
                <div><div className="text-[9px] text-white/55">Cotisation annuelle</div><div className="mt-0.5 text-sm font-bold">50 000 GNF / élève</div></div>
                <Check className="size-4 text-emerald-300" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Landing() {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="MBGEduGuinée accueil"><BrandMark /></Link>
          <nav className="hidden items-center gap-7 lg:flex">
            <a href="#fonctionnalites" className="text-sm font-medium text-muted-foreground transition hover:text-foreground">Fonctionnalités</a>
            <a href="#roles" className="text-sm font-medium text-muted-foreground transition hover:text-foreground">Pour qui ?</a>
            <a href="#fonctionnement" className="text-sm font-medium text-muted-foreground transition hover:text-foreground">Comment ça marche</a>
            <a href="#tarifs" className="text-sm font-medium text-muted-foreground transition hover:text-foreground">Tarifs</a>
            <a href="#faq" className="text-sm font-medium text-muted-foreground transition hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => setLoginOpen(true)}>Connexion</Button>
            <Button asChild className="rounded-full px-5 shadow-sm">
              <Link to="/auth">Créer mon établissement <ArrowRight className="ml-2 size-4" /></Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden bg-slate-950 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_15%,rgba(59,130,246,0.22),transparent_32%),radial-gradient(circle_at_10%_80%,rgba(14,165,233,0.16),transparent_30%)]" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-950 to-transparent" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-24">
            <div className="max-w-2xl">
              <Badge className="mb-6 rounded-full border-white/15 bg-white/10 px-4 py-1.5 text-white hover:bg-white/10">
                <Sparkles className="mr-2 size-3.5" /> Une plateforme pensée pour l'école
              </Badge>
              <h1 className="font-display text-4xl font-bold leading-[1.04] tracking-tight sm:text-5xl lg:text-[4.4rem]">
                La gestion scolaire qui <span className="text-sky-300">simplifie</span> le quotidien de votre établissement.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/68 sm:text-lg">
                MBGEduGuinée digitalise inscriptions, notes, paiements, comptabilité et communication — dans un environnement pensé pour la Maternelle, les écoles primaires, collèges, lycées et centres de formation.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 rounded-full bg-white px-6 text-slate-950 shadow-xl hover:bg-white/90">
                  <Link to="/auth">Créer mon établissement <ArrowRight className="ml-2 size-4" /></Link>
                </Button>
                <Button size="lg" variant="outline" className="h-12 rounded-full border-white/20 bg-white/5 px-6 text-white hover:bg-white/10 hover:text-white" onClick={() => setLoginOpen(true)}>
                  Accéder à mon espace
                </Button>
              </div>
              <div className="mt-9 grid max-w-xl grid-cols-3 gap-4 border-t border-white/10 pt-6">
                {[["01", "Contrôles d'accès"], ["05", "Niveaux scolaires"], ["50k", "GNF / élève / an"]].map(([value, label]) => (
                  <div key={label}>
                    <div className="text-xl font-bold text-white">{value}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/40">{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative lg:pl-5">
              <DashboardPreview />
            </div>
          </div>
        </section>

        <section className="relative -mt-8 z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid overflow-hidden rounded-[1.75rem] border border-border/60 bg-card shadow-xl sm:grid-cols-3">
            {[
              [ShieldCheck, "Sécurité intégrée", "Rôles, accès et contrôles pensés pour les établissements."],
              [School, "Pour tous les niveaux", "Maternelle, primaire, collège, lycée et formation."],
              [Wallet, "Un modèle simple", "50 000 GNF par élève et par année scolaire."],
            ].map(([Icon, title, text], index) => (
              <div key={title as string} className={`flex gap-4 p-5 sm:p-6 ${index > 0 ? "border-t sm:border-l sm:border-t-0" : ""}`}>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></div>
                <div><div className="font-semibold">{title as string}</div><div className="mt-1 text-xs leading-5 text-muted-foreground">{text as string}</div></div>
              </div>
            ))}
          </div>
        </section>

        <section id="fonctionnalites" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Tout au même endroit</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Une gestion plus claire, de l'inscription à la communication.</h2>
            <p className="mt-4 text-muted-foreground">Un environnement unique pour réduire la dispersion et donner à chaque équipe les bons outils.</p>
          </div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {featureGroups.map(({ title, icon: GroupIcon, items }) => (
              <Card key={title} className="overflow-hidden rounded-[1.75rem] border-border/60 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                <div className="border-b bg-muted/25 p-6"><div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><GroupIcon className="size-5" /></div><h3 className="mt-5 font-display text-xl font-bold">{title}</h3></div>
                <CardContent className="space-y-1 p-3">
                  {items.map(([name, text, Icon]) => (
                    <div key={name as string} className="flex gap-3 rounded-2xl p-3 transition hover:bg-muted/50">
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary"><Icon className="size-4" /></div>
                      <div><div className="text-sm font-semibold">{name as string}</div><div className="mt-0.5 text-xs leading-5 text-muted-foreground">{text as string}</div></div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="roles" className="bg-muted/35 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Une expérience adaptée à votre rôle</p>
                <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Moins de dispersion. Plus de visibilité.</h2>
                <p className="mt-5 leading-7 text-muted-foreground">Chaque utilisateur retrouve les informations utiles à sa mission, sans transformer la gestion scolaire en parcours compliqué.</p>
                <div className="mt-7 flex flex-wrap gap-2">
                  {["Direction", "Enseignants", "Secrétariat", "Comptabilité", "Parents", "Élèves"].map((item) => <Badge key={item} variant="secondary" className="rounded-full px-3 py-1">{item}</Badge>)}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {audiences.map(({ title, text, icon: Icon }) => (
                  <Card key={title} className="rounded-[1.5rem] border-border/60 bg-background/90 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                    <CardContent className="p-6"><div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></div><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="grid overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-2xl lg:grid-cols-[1fr_1.15fr]">
            <div className="relative min-h-[360px] overflow-hidden">
              <img src={LANDING_IMAGES.students} alt="Élèves travaillant ensemble en classe" className="absolute inset-0 size-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-white/15 bg-slate-950/45 p-4 backdrop-blur-md">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Une école connectée</div>
                <div className="mt-1 text-sm text-white/85">Des équipes, des élèves et des familles mieux reliés.</div>
              </div>
            </div>
            <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Pensé pour le terrain</p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Votre établissement mérite une gestion qui reste simple.</h2>
              <p className="mt-5 leading-7 text-white/65">Du premier dossier élève au suivi des cotisations, MBGEduGuinée rassemble l'essentiel dans une expérience douce, claire et professionnelle.</p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {["Dossiers élèves centralisés", "Notes et bulletins", "Présences et emplois du temps", "Paiements et comptabilité", "Communication scolaire", "Accès adaptés aux rôles"].map((item) => <div key={item} className="flex items-center gap-2 text-sm text-white/80"><Check className="size-4 text-sky-300" />{item}</div>)}
              </div>
            </div>
          </div>
        </section>

        <section id="fonctionnement" className="bg-muted/35 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Comment ça marche</p><h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Une mise en route progressive.</h2><p className="mt-4 text-muted-foreground">Commencez avec votre établissement, puis développez votre usage au rythme de votre équipe.</p></div>
            <div className="mt-12 grid gap-4 md:grid-cols-4">
              {steps.map(([number, title, text, Icon]) => (
                <div key={number} className="relative rounded-[1.5rem] border border-border/60 bg-background p-6 shadow-sm">
                  <div className="flex items-center justify-between"><span className="text-xs font-bold tracking-[0.15em] text-primary">{number}</span><Icon className="size-5 text-primary/70" /></div>
                  <h3 className="mt-8 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                  {number !== "04" && <ArrowRight className="absolute -right-3 top-1/2 z-10 hidden size-6 rounded-full bg-background text-muted-foreground shadow md:block" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="tarifs" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-xl">
              <div className="p-8 sm:p-10"><p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Un modèle lisible</p><h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Une cotisation simple, par élève.</h2><p className="mt-4 text-white/60">Pas de grille compliquée : le principe est présenté clairement à l'établissement.</p><div className="mt-9"><div className="text-5xl font-bold tracking-tight">50 000 <span className="text-lg font-semibold text-white/45">GNF</span></div><div className="mt-2 text-sm text-white/50">par élève et par année scolaire</div></div><div className="mt-8 space-y-3">{["Cotisation annuelle unique", "Déclaration individuelle ou groupée", "Suivi des validations", "Progression vers l'accès FULL"].map((item) => <div key={item} className="flex items-center gap-3 text-sm text-white/75"><span className="flex size-6 items-center justify-center rounded-full bg-white/10"><Check className="size-3.5 text-sky-300" /></span>{item}</div>)}</div></div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Card className="overflow-hidden rounded-[2rem] border-border/60"><img src={LANDING_IMAGES.school} alt="Établissement scolaire moderne et accueillant" className="h-64 w-full object-cover" /><CardContent className="p-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Votre établissement</p><h3 className="mt-2 font-display text-2xl font-bold">Une image professionnelle dès le premier regard.</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Présentez votre école avec une expérience numérique cohérente, claire et rassurante.</p></CardContent></Card>
              <Card className="rounded-[2rem] border-border/60 bg-primary/[0.035]"><CardContent className="flex h-full flex-col justify-between p-6"><div><div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck className="size-5" /></div><h3 className="mt-6 font-display text-2xl font-bold">Contrôles d'accès</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">Les règles d'accès sont adaptées aux rôles et aux validations prévues par votre établissement.</p></div><div className="mt-8 rounded-2xl border bg-background p-4"><div className="flex items-center justify-between text-xs"><span className="font-medium">Progression établissement</span><span className="font-semibold text-primary">X / 20</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full w-3/5 rounded-full bg-primary" /></div></div></CardContent></Card>
            </div>
          </div>
        </section>

        <section className="bg-muted/35 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Orange Money</p><h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Un paiement expliqué sans ambiguïté.</h2><p className="mt-4 max-w-xl leading-7 text-muted-foreground">Le transfert est effectué par l'établissement, puis la référence déclarée est contrôlée selon le workflow de la plateforme.</p></div>
            <Card className="rounded-[2rem] border-border/60 bg-background shadow-sm"><CardContent className="p-7 sm:p-8"><div className="grid gap-5 sm:grid-cols-3"><div><div className="text-xs text-muted-foreground">Bénéficiaire</div><div className="mt-1 font-semibold">MBGEduGuinée</div></div><div><div className="text-xs text-muted-foreground">Numéro</div><div className="mt-1 font-semibold">628 49 98 12</div></div><div><div className="text-xs text-muted-foreground">USSD</div><div className="mt-1 font-semibold">#144#</div></div></div><div className="mt-6 rounded-2xl bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">Une référence déclarée ne constitue pas à elle seule une preuve automatique de paiement.</div></CardContent></Card>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="rounded-[2rem] border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-background to-sky-500/[0.05] p-7 sm:p-10 lg:p-12">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div><div className="flex items-center gap-3"><div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><ShieldCheck className="size-5" /></div><div className="font-semibold">Une plateforme pensée avec la sécurité au centre</div></div><p className="mt-4 max-w-2xl leading-7 text-muted-foreground">Séparation des données par établissement, contrôles d'accès par rôle et vérifications côté serveur pour les opérations sensibles.</p></div>
              <div className="flex flex-wrap gap-2"><Badge variant="secondary" className="rounded-full">Accès par rôle</Badge><Badge variant="secondary" className="rounded-full">Données séparées</Badge><Badge variant="secondary" className="rounded-full">Contrôles serveur</Badge></div>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden bg-slate-950 py-20 text-white sm:py-24">
          <div className="absolute -left-24 top-1/2 size-72 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
            <Badge className="rounded-full border-white/10 bg-white/10 text-white hover:bg-white/10"><Sparkles className="mr-2 size-3.5" /> Votre établissement, plus simplement</Badge>
            <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-5xl">Prêt à donner une nouvelle dimension à votre gestion scolaire ?</h2>
            <p className="mx-auto mt-5 max-w-2xl text-white/60">Créez votre espace établissement et découvrez une expérience conçue pour le quotidien des écoles et centres de formation.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><Button asChild size="lg" className="h-12 rounded-full bg-white px-7 text-slate-950 hover:bg-white/90"><Link to="/auth">Créer mon établissement <ArrowRight className="ml-2 size-4" /></Link></Button><Button size="lg" variant="outline" className="h-12 rounded-full border-white/15 bg-white/5 px-7 text-white hover:bg-white/10 hover:text-white" onClick={() => setLoginOpen(true)}>J'ai déjà un accès</Button></div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28">
          <div className="text-center"><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">FAQ</p><h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Les réponses essentielles.</h2></div>
          <Accordion type="single" collapsible className="mt-10 w-full">
            {faqs.map(([question, answer], index) => <AccordionItem key={question} value={`item-${index}`} className="border-b-border/70"><AccordionTrigger className="py-5 text-left font-semibold hover:no-underline">{question}</AccordionTrigger><AccordionContent className="pb-5 leading-7 text-muted-foreground">{answer}</AccordionContent></AccordionItem>)}
          </Accordion>
        </section>
      </main>

      <footer className="border-t bg-slate-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.3fr_1fr_1fr] lg:px-8">
          <div><BrandMark light /><p className="mt-5 max-w-sm text-sm leading-6 text-white/50">La gestion scolaire qui simplifie le quotidien de votre établissement en Guinée.</p></div>
          <div><div className="text-sm font-semibold">Navigation</div><div className="mt-4 grid gap-2 text-sm text-white/50"><a href="#fonctionnalites" className="hover:text-white">Fonctionnalités</a><a href="#roles" className="hover:text-white">Pour qui ?</a><a href="#fonctionnement" className="hover:text-white">Comment ça marche</a><a href="#faq" className="hover:text-white">FAQ</a></div></div>
          <div><div className="text-sm font-semibold">Accès</div><div className="mt-4 grid gap-2 text-sm"><button onClick={() => setLoginOpen(true)} className="w-fit text-left text-white/50 hover:text-white">Connexion</button><Link to="/auth" className="w-fit text-white/50 hover:text-white">Créer un établissement</Link></div></div>
        </div>
        <div className="border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><span>© {new Date().getFullYear()} MBGEduGuinée. Tous droits réservés.</span><span>Conçu pour les établissements scolaires et centres de formation.</span></div></div>
      </footer>

      {loginOpen && <LoginChoice onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
