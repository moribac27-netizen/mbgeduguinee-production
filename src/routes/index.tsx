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

const FEATURE_GROUPS = [
  {
    title: "Pédagogie & suivi",
    desc: "Les outils du quotidien pour suivre la scolarité et organiser les équipes.",
    items: [
      { icon: Users, title: "Gestion des élèves", desc: "Inscriptions, dossiers, classes et photos." },
      { icon: GraduationCap, title: "Enseignants", desc: "Matières, emplois du temps et salaires." },
      { icon: BookOpen, title: "Classes", desc: "Organisation, niveaux et effectifs." },
      { icon: ClipboardList, title: "Notes & bulletins", desc: "Moyennes, classements et bulletins PDF." },
      { icon: CalendarClock, title: "Emploi du temps", desc: "Planning par classe et enseignant." },
      { icon: CalendarCheck, title: "Présences", desc: "Appel quotidien, retards et absences." },
    ],
  },
  {
    title: "Administration & finances",
    desc: "Une vision plus claire des opérations administratives et financières.",
    items: [
      { icon: CreditCard, title: "Cotisations", desc: "Cotisation annuelle de 50 000 GNF par élève." },
      { icon: Wallet, title: "Comptabilité", desc: "Dépenses, soldes et rapports financiers." },
      { icon: Receipt, title: "Suivi des paiements", desc: "Déclarations, validations et contrôle des accès." },
      { icon: LockKeyhole, title: "Accès par rôle", desc: "Chaque espace est adapté à la fonction de l'utilisateur." },
    ],
  },
  {
    title: "Vie scolaire",
    desc: "Les services qui prolongent l'expérience de l'établissement.",
    items: [
      { icon: UtensilsCrossed, title: "Cantine", desc: "Suivi des repas et inscriptions." },
      { icon: Library, title: "Bibliothèque", desc: "Gestion des ouvrages et emprunts." },
      { icon: Bus, title: "Transport", desc: "Suivi des circuits scolaires." },
      { icon: Megaphone, title: "Communication", desc: "Annonces et notifications aux parents." },
    ],
  },
];

const AUDIENCES = [
  { icon: School, title: "Direction", desc: "Pilotez l'établissement avec une vue centralisée des élèves, équipes, activités et finances." },
  { icon: GraduationCap, title: "Enseignants", desc: "Retrouvez les classes, notes, présences et emplois du temps dans un même environnement." },
  { icon: Wallet, title: "Secrétariat & comptabilité", desc: "Structurez les dossiers, paiements, cotisations et opérations administratives." },
  { icon: Users, title: "Parents & élèves", desc: "Accédez aux espaces scolaires prévus pour suivre la scolarité et les informations disponibles." },
];

const STEPS = [
  { icon: UserPlus, title: "Créez votre établissement", desc: "Inscription et configuration de votre école ou centre de formation." },
  { icon: Users, title: "Ajoutez vos élèves", desc: "Import ou saisie manuelle des élèves et de leurs classes." },
  { icon: CreditCard, title: "Déclarez les cotisations", desc: "50 000 GNF par élève et par année scolaire, individuellement ou en groupe." },
  { icon: ShieldCheck, title: "Suivez l'accès", desc: "20 cotisations VALIDATED activent le mode FULL de l'établissement." },
];

const FAQ = [
  { q: "Quel est le modèle financier ?", a: "Le modèle unique est la cotisation annuelle de 50 000 GNF par élève et par année scolaire. Aucun abonnement fixe d'établissement n'est requis dans ce modèle." },
  { q: "Comment fonctionne le seuil de 20 ?", a: "Le compteur global utilise uniquement les cotisations au statut VALIDATED. De 0 à 19, l'établissement reste en mode RESTRICTED ; à partir de 20, il passe en mode FULL." },
  { q: "Un élève est-il automatiquement débloqué à 20 cotisations ?", a: "Non. Le seuil global et le dossier individuel sont indépendants. Le dossier d'un élève reste verrouillé tant que sa propre cotisation n'est pas VALIDATED." },
  { q: "Comment payer avec Orange Money ?", a: "Le transfert se fait vers le 628 49 98 12, bénéficiaire MBGEduGuinée, via #144#. La référence déclarée est ensuite contrôlée ; elle ne constitue pas à elle seule une preuve automatique de paiement." },
  { q: "Qui peut utiliser MBGEduGuinée ?", a: "La plateforme est conçue pour la Maternelle, les écoles primaires, collèges, lycées et centres de formation, avec des espaces adaptés aux différents rôles." },
  { q: "Les données des établissements sont-elles séparées ?", a: "L'application prévoit une séparation des données par établissement, des contrôles d'accès par rôle et des vérifications côté serveur pour les opérations sensibles." },
];

function LoginChoice({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="login-choice-title">
      <button className="absolute inset-0 cursor-default" aria-label="Fermer" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl sm:p-7">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <School className="size-6" />
          </div>
          <h2 id="login-choice-title" className="font-display text-2xl font-bold">Accéder à MBGEduGuinée</h2>
          <p className="mt-2 text-sm text-muted-foreground">Choisissez votre espace</p>
        </div>
        <div className="grid gap-3">
          <Link to="/auth" onClick={onClose} className="group rounded-xl border p-4 transition hover:border-primary/40 hover:bg-muted/40">
            <div className="flex items-center gap-4"><span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><School className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block">Établissement</strong><span className="text-sm text-muted-foreground">Direction, enseignants et personnel</span></span><ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-1" /></div>
          </Link>
          <Link to="/auth" onClick={onClose} className="group rounded-xl border p-4 transition hover:border-primary/40 hover:bg-muted/40">
            <div className="flex items-center gap-4"><span className="flex size-11 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Users className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block">Parent / Tuteur</strong><span className="text-sm text-muted-foreground">Suivre la scolarité de vos enfants</span></span><ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-1" /></div>
          </Link>
          <Link to="/auth" onClick={onClose} className="group rounded-xl border p-4 transition hover:border-primary/40 hover:bg-muted/40">
            <div className="flex items-center gap-4"><span className="flex size-11 items-center justify-center rounded-xl bg-muted text-primary"><GraduationCap className="size-5" /></span><span className="min-w-0 flex-1"><strong className="block">Élève</strong><span className="text-sm text-muted-foreground">Accéder à votre espace scolaire</span></span><ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-1" /></div>
          </Link>
        </div>
        <div className="mt-6 border-t pt-5 text-center text-sm">
          <Link to="/auth" onClick={onClose} className="font-medium text-primary hover:underline">Vous n'avez pas encore accès ? Demander un accès</Link>
        </div>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Fermer">×</button>
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-primary/10 blur-3xl" />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2"><div className="size-2 rounded-full bg-destructive/60" /><div className="size-2 rounded-full bg-warning/70" /><div className="size-2 rounded-full bg-success/70" /></div>
          <div className="text-xs font-medium text-muted-foreground">Aperçu de votre espace</div>
          <LayoutDashboard className="size-4 text-primary" />
        </div>
        <div className="grid md:grid-cols-[180px_1fr]">
          <div className="hidden border-r bg-muted/20 p-4 md:block">
            <div className="mb-5 flex items-center gap-2 font-semibold"><span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><School className="size-4" /></span> MBGEduGuinée</div>
            <div className="space-y-2 text-xs text-muted-foreground">
              {['Tableau de bord', 'Élèves', 'Classes', 'Notes', 'Présences', 'Paiements'].map((item, index) => <div key={item} className={`rounded-lg px-3 py-2 ${index === 0 ? 'bg-primary/10 font-medium text-primary' : ''}`}>{item}</div>)}
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <div className="mb-5 flex items-center justify-between"><div><div className="text-xs text-muted-foreground">Tableau de bord</div><div className="font-display text-xl font-bold">Vue de l'établissement</div></div><Badge variant="secondary">Espace sécurisé</Badge></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[{ label: 'Élèves', icon: Users }, { label: 'Classes', icon: School }, { label: 'Notes', icon: ClipboardList }, { label: 'Paiements', icon: CreditCard }].map(({ label, icon: Icon }) => <div key={label} className="rounded-xl border p-3"><Icon className="mb-2 size-4 text-primary" /><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 h-2 w-14 rounded bg-muted" /></div>)}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border p-4 sm:col-span-2"><div className="mb-4 flex items-center justify-between"><span className="font-semibold">Suivi scolaire</span><span className="text-xs text-muted-foreground">Cette année</span></div><div className="space-y-3">{['Élèves et classes', 'Présences', 'Notes & bulletins'].map((item) => <div key={item} className="flex items-center gap-3"><div className="size-2 rounded-full bg-primary" /><span className="text-sm">{item}</span><div className="ml-auto h-2 w-20 rounded bg-muted" /></div>)}</div></div>
              <div className="rounded-xl border bg-primary/[0.04] p-4"><Receipt className="mb-3 size-5 text-primary" /><div className="text-xs text-muted-foreground">Cotisation annuelle</div><div className="mt-1 font-display text-lg font-bold">50 000 GNF</div><div className="mt-2 text-xs text-muted-foreground">par élève / an</div></div>
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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <Link to="/" className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><School className="size-5" /></div><div><div className="font-display font-bold leading-none">MBGEduGuinée</div><div className="mt-1 text-xs text-muted-foreground">Gestion scolaire</div></div></Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground lg:flex"><a href="#fonctionnalites" className="hover:text-foreground">Fonctionnalités</a><a href="#comment-ca-marche" className="hover:text-foreground">Comment ça marche</a><a href="#tarifs" className="hover:text-foreground">Tarifs</a><a href="#faq" className="hover:text-foreground">FAQ</a></nav>
          <div className="flex items-center gap-2"><Button variant="ghost" onClick={() => setLoginOpen(true)}>Connexion</Button><Button asChild className="hidden sm:inline-flex"><Link to="/auth">Créer mon établissement <ArrowRight className="ml-2 size-4" /></Link></Button></div>
        </div>
      </header>

      <main>
        <section className="overflow-hidden border-b bg-gradient-to-b from-primary/[0.07] via-background to-background">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-24">
            <div>
              <Badge variant="secondary" className="mb-5 gap-2 px-3 py-1.5"><Sparkles className="size-3.5 text-primary" /> Une plateforme pensée pour l'école</Badge>
              <h1 className="max-w-2xl font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">La gestion scolaire qui <span className="text-primary">simplifie</span> le quotidien de votre établissement.</h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">MBGEduGuinée digitalise inscriptions, notes, paiements, comptabilité et communication. La Maternelle, écoles primaires, collèges, lycées et centres de formation.</p>
              <div className="mt-8 flex flex-wrap gap-3"><Button size="lg" asChild><Link to="/auth">Créer mon établissement <ArrowRight className="ml-2 size-4" /></Link></Button><Button size="lg" variant="outline" onClick={() => setLoginOpen(true)}>Accéder à mon espace</Button></div>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground"><span className="flex items-center gap-2"><Check className="size-4 text-primary" /> Maternelle à formation</span><span className="flex items-center gap-2"><Check className="size-4 text-primary" /> Paiements contrôlés</span><span className="flex items-center gap-2"><Check className="size-4 text-primary" /> Accès par rôle</span></div>
            </div>
            <DashboardPreview />
          </div>
        </section>

        <section className="border-b bg-card"><div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:grid-cols-3 lg:px-8"><div className="flex items-center gap-3"><ShieldCheck className="size-5 text-primary" /><div><div className="text-sm font-semibold">Contrôles d'accès</div><div className="text-xs text-muted-foreground">Rôles et vérifications côté serveur</div></div></div><div className="flex items-center gap-3"><School className="size-5 text-primary" /><div><div className="text-sm font-semibold">Pour tous les niveaux</div><div className="text-xs text-muted-foreground">Maternelle, primaire, collège, lycée, formation</div></div></div><div className="flex items-center gap-3"><Receipt className="size-5 text-primary" /><div><div className="text-sm font-semibold">Un modèle simple</div><div className="text-xs text-muted-foreground">50 000 GNF par élève et par an</div></div></div></div></section>

        <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8" id="fonctionnalites">
          <div className="max-w-2xl"><Badge variant="outline">Une seule plateforme</Badge><h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Tout ce qu'il faut pour piloter l'école</h2><p className="mt-4 text-muted-foreground">Des modules organisés autour des vrais besoins de l'établissement, sans multiplier les outils.</p></div>
          <div className="mt-10 space-y-10">{FEATURE_GROUPS.map((group) => <div key={group.title}><div className="mb-5"><h3 className="font-display text-xl font-bold">{group.title}</h3><p className="mt-1 text-sm text-muted-foreground">{group.desc}</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{group.items.map((f) => { const Icon = f.icon; return <Card key={f.title} className="hover-lift border-border/80"><CardContent className="p-5"><div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></div><div className="font-semibold">{f.title}</div><p className="mt-1 text-sm leading-6 text-muted-foreground">{f.desc}</p></CardContent></Card>; })}</div></div>)}</div>
        </section>

        <section className="border-y bg-muted/30"><div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 lg:grid-cols-2 lg:px-8"><div><Badge variant="secondary">Une vision centralisée</Badge><h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Moins de dispersion. Plus de visibilité.</h2><p className="mt-4 max-w-xl leading-7 text-muted-foreground">MBGEduGuinée réunit les informations scolaires, administratives et financières dans des espaces adaptés aux différents utilisateurs de l'établissement.</p><div className="mt-7 space-y-4">{["Une plateforme unique pour les opérations scolaires.", "Des espaces adaptés aux rôles de l'établissement.", "Un suivi structuré des cotisations et des accès.", "Une expérience conçue pour les établissements en Guinée."].map((item) => <div key={item} className="flex gap-3"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" /></span><span className="text-sm leading-6">{item}</span></div>)}</div></div><div className="rounded-3xl border bg-card p-4 shadow-lg sm:p-6"><div className="rounded-2xl border bg-muted/30 p-5"><div className="mb-5 flex items-center justify-between"><div><div className="text-xs text-muted-foreground">Organisation</div><div className="font-display text-lg font-bold">Votre établissement</div></div><Badge>Rôles</Badge></div><div className="grid gap-3 sm:grid-cols-2">{AUDIENCES.map((a) => { const Icon=a.icon; return <div key={a.title} className="rounded-xl border bg-card p-4"><Icon className="mb-3 size-5 text-primary" /><div className="font-semibold">{a.title}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{a.desc}</p></div>; })}</div></div></div></div></section>

        <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8"><div className="mb-10 text-center"><Badge variant="outline">Pour chaque utilisateur</Badge><h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Une expérience adaptée à votre rôle</h2><p className="mx-auto mt-3 max-w-2xl text-muted-foreground">Direction, enseignants, administration, parents et élèves n'ont pas les mêmes besoins. La plateforme organise les accès en conséquence.</p></div><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{AUDIENCES.map((a) => { const Icon=a.icon; return <Card key={a.title} className="hover-lift"><CardContent className="p-6"><Icon className="mb-5 size-6 text-primary" /><h3 className="font-display text-lg font-bold">{a.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{a.desc}</p></CardContent></Card>; })}</div></section>

        <section className="border-y bg-primary/[0.04]" id="comment-ca-marche"><div className="mx-auto max-w-7xl px-4 py-20 lg:px-8"><div className="max-w-2xl"><Badge variant="secondary">Simple à comprendre</Badge><h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Comment ça fonctionne</h2><p className="mt-3 text-muted-foreground">Un parcours clair pour démarrer et suivre le fonctionnement de votre établissement.</p></div><div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">{STEPS.map((s,i)=>{const Icon=s.icon;return <Card key={s.title}><CardContent className="p-6"><div className="mb-5 flex items-center justify-between"><div className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i+1}</div><Icon className="size-5 text-primary" /></div><div className="font-display font-bold">{s.title}</div><p className="mt-2 text-sm leading-6 text-muted-foreground">{s.desc}</p></CardContent></Card>})}</div></div></section>

        <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8" id="tarifs"><div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center"><div><Badge variant="secondary">Tarification claire</Badge><h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Une cotisation. Pas de formule compliquée.</h2><p className="mt-4 leading-7 text-muted-foreground">Le modèle est centré sur une cotisation annuelle par élève, avec une part destinée à l'établissement pour chaque cotisation validée.</p><div className="mt-7 space-y-3 text-sm text-muted-foreground"><div className="flex gap-3"><Check className="mt-0.5 size-4 text-primary" /> 50 000 GNF / élève / année scolaire</div><div className="flex gap-3"><Check className="mt-0.5 size-4 text-primary" /> 15 000 GNF de part école par cotisation VALIDATED</div><div className="flex gap-3"><Check className="mt-0.5 size-4 text-primary" /> 20 cotisations VALIDATED pour le mode FULL</div></div></div><Card className="overflow-hidden border-primary/20 shadow-xl"><CardContent className="p-0"><div className="grid sm:grid-cols-[1.2fr_0.8fr]"><div className="p-7 sm:p-9"><div className="text-sm font-medium text-muted-foreground">Cotisation annuelle</div><div className="mt-2 font-display text-4xl font-bold sm:text-5xl">50 000 <span className="text-xl">GNF</span></div><div className="mt-1 text-sm text-muted-foreground">par élève / an</div><div className="mt-7 rounded-xl bg-muted/60 p-4 text-sm leading-6">À partir de <strong>20 cotisations VALIDATED</strong>, l'établissement passe en mode <strong>FULL</strong>. En dessous, l'accès reste <strong>RESTRICTED</strong>.</div></div><div className="border-t bg-primary p-7 text-primary-foreground sm:border-l sm:border-t-0 sm:p-9"><div className="text-sm opacity-80">Part établissement</div><div className="mt-2 font-display text-3xl font-bold">15 000 GNF</div><div className="mt-1 text-sm opacity-80">par cotisation validée</div><div className="mt-7 border-t border-primary-foreground/20 pt-5 text-sm leading-6">Le seuil global et le déblocage individuel restent deux contrôles distincts.</div></div></div></CardContent></Card></div></section>

        <section className="border-y bg-muted/30"><div className="mx-auto max-w-5xl px-4 py-16 text-center lg:px-8"><Badge variant="secondary">Orange Money</Badge><h2 className="mt-4 font-display text-3xl font-bold">Un parcours de paiement simple à déclarer</h2><p className="mx-auto mt-3 max-w-2xl text-muted-foreground">Effectuez le transfert puis déclarez la référence dans la plateforme pour permettre son contrôle.</p><div className="mx-auto mt-8 grid max-w-3xl gap-4 text-left sm:grid-cols-3"><div className="rounded-2xl border bg-card p-5"><div className="text-xs text-muted-foreground">Numéro</div><div className="mt-1 font-display text-xl font-bold">628 49 98 12</div></div><div className="rounded-2xl border bg-card p-5"><div className="text-xs text-muted-foreground">Bénéficiaire</div><div className="mt-1 font-display text-xl font-bold">MBGEduGuinée</div></div><div className="rounded-2xl border bg-card p-5"><div className="text-xs text-muted-foreground">Code</div><div className="mt-1 font-display text-xl font-bold">#144#</div></div></div><p className="mx-auto mt-5 max-w-2xl text-xs text-muted-foreground">La référence déclarée est une déclaration tant qu'elle n'a pas été vérifiée. Aucun montant ou statut ne doit être considéré comme validé sur la seule saisie côté utilisateur.</p></div></section>

        <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8"><div className="grid gap-10 lg:grid-cols-2"><div><Badge variant="outline">Sécurité & contrôle</Badge><h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Des accès pensés autour des responsabilités.</h2><p className="mt-4 leading-7 text-muted-foreground">Les opérations sensibles reposent sur des contrôles d'accès et des validations côté serveur afin de limiter les modifications non autorisées.</p></div><div className="grid gap-4 sm:grid-cols-2"><Card><CardContent className="p-6"><ShieldCheck className="mb-4 size-6 text-primary" /><h3 className="font-semibold">Accès par rôle</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Les espaces sont organisés selon les fonctions de l'utilisateur.</p></CardContent></Card><Card><CardContent className="p-6"><LockKeyhole className="mb-4 size-6 text-primary" /><h3 className="font-semibold">Contrôles serveur</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Les opérations sensibles ne reposent pas uniquement sur les données envoyées par le navigateur.</p></CardContent></Card><Card><CardContent className="p-6"><School className="mb-4 size-6 text-primary" /><h3 className="font-semibold">Séparation des établissements</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Les règles d'accès sont conçues pour éviter les accès croisés entre établissements.</p></CardContent></Card><Card><CardContent className="p-6"><Receipt className="mb-4 size-6 text-primary" /><h3 className="font-semibold">Traçabilité des paiements</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Les déclarations et validations sont distinguées pour garder un contrôle clair du processus.</p></CardContent></Card></div></div></section>

        <section className="border-y bg-primary text-primary-foreground"><div className="mx-auto max-w-5xl px-4 py-20 text-center lg:px-8"><Sparkles className="mx-auto size-7 opacity-80" /><h2 className="mt-5 font-display text-3xl font-bold sm:text-4xl">Prêt à digitaliser votre établissement ?</h2><p className="mx-auto mt-4 max-w-2xl text-primary-foreground/80">Centralisez votre gestion scolaire dans un environnement unique, avec un modèle de cotisation clair et des accès adaptés à chaque utilisateur.</p><div className="mt-8 flex flex-wrap justify-center gap-3"><Button size="lg" variant="secondary" asChild><Link to="/auth">Créer mon établissement <ArrowRight className="ml-2 size-4" /></Link></Button><Button size="lg" variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" onClick={() => setLoginOpen(true)}>Accéder à mon espace</Button></div></div></section>

        <section className="mx-auto max-w-4xl px-4 py-20 lg:px-8" id="faq"><div className="mb-10 text-center"><Badge variant="outline">FAQ</Badge><h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Questions fréquentes</h2></div><Accordion type="single" collapsible>{FAQ.map((f,i)=><AccordionItem key={f.q} value={`faq-${i}`}><AccordionTrigger className="text-left">{f.q}</AccordionTrigger><AccordionContent className="leading-7 text-muted-foreground">{f.a}</AccordionContent></AccordionItem>)}</Accordion></section>
      </main>

      <footer className="border-t bg-muted/20"><div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4 lg:px-8"><div className="sm:col-span-2"><Link to="/" className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><School className="size-4" /></div><span className="font-display font-bold">MBGEduGuinée</span></Link><p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">Une plateforme de gestion scolaire pensée pour les établissements en Guinée.</p></div><div><div className="font-semibold">Plateforme</div><div className="mt-4 space-y-2 text-sm text-muted-foreground"><a href="#fonctionnalites" className="block hover:text-foreground">Fonctionnalités</a><a href="#tarifs" className="block hover:text-foreground">Tarifs</a><a href="#comment-ca-marche" className="block hover:text-foreground">Comment ça marche</a></div></div><div><div className="font-semibold">Accès</div><div className="mt-4 space-y-2 text-sm text-muted-foreground"><button onClick={() => setLoginOpen(true)} className="block hover:text-foreground">Connexion</button><Link to="/auth" className="block hover:text-foreground">Créer un établissement</Link><a href="#faq" className="block hover:text-foreground">FAQ</a></div></div></div><div className="border-t"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground lg:px-8"><span>© {new Date().getFullYear()} MBGEduGuinée</span><span>Gestion scolaire numérique</span></div></div></footer>
      {loginOpen && <LoginChoice onClose={() => setLoginOpen(false)} />}
    </div>
  );
}
