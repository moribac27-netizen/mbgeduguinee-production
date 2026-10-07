import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, ClipboardList,
  CreditCard, Megaphone, LogOut, Menu, X, School, FileText, CalendarDays, UserCheck,
  Calculator, Wallet, ScrollText, Library, Link2, Settings, MessageSquare, BarChart3, History, DatabaseBackup, ShieldCheck,
  Coins, Home, IdCard, BookMarked, HeartPulse, Bus, UtensilsCrossed, Baby, Briefcase, ShieldAlert, Users2, Trophy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth, useRoles, primaryRole } from "@/hooks/useAuth";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { canAccess, homeForRoles } from "@/lib/access";
import { NotificationsBell } from "@/components/NotificationsBell";
import { logLogout } from "@/lib/audit";
import { InstallPWA } from "@/components/InstallPWA";
import { useSchool } from "@/hooks/useSchool";
import { SchoolIdentityHeader } from "@/components/SchoolIdentityHeader";
import { ConakryClock } from "@/components/ConakryClock";


const STAFF_NAV = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/directeur", label: "Directeur", icon: Briefcase },
  { to: "/direction-etudes", label: "Direction des études", icon: GraduationCap },
  { to: "/evenements", label: "Événements", icon: CalendarDays },
  { to: "/eleves", label: "Élèves", icon: Users },
  { to: "/maternelle", label: "Maternelle", icon: Baby },
  { to: "/classes", label: "Classes", icon: BookOpen },
  { to: "/enseignants", label: "Enseignants", icon: GraduationCap },
  { to: "/matieres", label: "Matières", icon: BookMarked },
  { to: "/cartes", label: "Cartes scolaires", icon: IdCard },
  { to: "/affectations", label: "Affectations", icon: Link2 },
  { to: "/emploi-du-temps", label: "Emploi du temps", icon: CalendarDays },
  { to: "/calendrier", label: "Calendrier", icon: CalendarDays },
  { to: "/presences", label: "Présences", icon: UserCheck },
  { to: "/notes", label: "Notes", icon: ClipboardList },
  { to: "/examens", label: "Examens", icon: ScrollText },
  { to: "/bulletins", label: "Bulletins", icon: FileText },
  { to: "/resultats-generaux", label: "Listes générales", icon: Trophy },
  { to: "/analyse-scolaire", label: "Analyse scolaire", icon: BarChart3 },
  { to: "/sortie-eleve", label: "Fiches de sortie", icon: FileText },
  { to: "/paiements", label: "Paiements", icon: CreditCard },
  { to: "/cotisations", label: "Cotisations", icon: Coins },
  { to: "/comptabilite", label: "Comptabilité", icon: Calculator },
  { to: "/salaires", label: "Salaires", icon: Wallet },
  { to: "/bibliotheque", label: "Bibliothèque", icon: Library },
  { to: "/infirmerie", label: "Infirmerie", icon: HeartPulse },
  { to: "/transport", label: "Transport", icon: Bus },
  { to: "/cantine", label: "Cantine", icon: UtensilsCrossed },
  { to: "/discipline", label: "Discipline", icon: ShieldAlert },

  { to: "/annonces", label: "Annonces", icon: Megaphone },
  { to: "/messagerie", label: "Messagerie", icon: MessageSquare },
  { to: "/rapports", label: "Rapports", icon: BarChart3 },
  { to: "/journal", label: "Journal d'activité", icon: History },
  { to: "/sauvegarde", label: "Sauvegarde", icon: DatabaseBackup },
  { to: "/super-admin", label: "Super Admin", icon: ShieldCheck },
  { to: "/personnalisation-recu", label: "Personnalisation reçu", icon: FileText },
  { to: "/parametres", label: "Paramètres", icon: Settings },
  { to: "/collaborateurs", label: "Collaborateurs", icon: Users2 },
] as const;

const PARENT_NAV = [
  { to: "/parent", label: "Mon espace", icon: Home },
  { to: "/calendrier", label: "Calendrier", icon: CalendarDays },
  { to: "/messagerie", label: "Messagerie", icon: MessageSquare },
] as const;

const STUDENT_NAV = [
  { to: "/eleve", label: "Mon espace", icon: Home },
  { to: "/calendrier", label: "Calendrier", icon: CalendarDays },
  { to: "/messagerie", label: "Messagerie", icon: MessageSquare },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuth();
  const { roles } = useRoles();
  const { isSuperAdmin } = useSuperAdmin();
  const { school } = useSchool();
  const role = primaryRole(roles);
  const BASE_NAV = role === "parent" ? PARENT_NAV : role === "eleve" ? STUDENT_NAV : STAFF_NAV;
  const NAV = BASE_NAV.filter((item) => canAccess(item.to, roles, isSuperAdmin));
  const homePath = homeForRoles(roles, isSuperAdmin);

  async function handleSignOut() {
    await logLogout();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }


  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-sidebar text-sidebar-foreground flex flex-col transform transition-transform lg:translate-x-0 lg:static lg:inset-auto",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="px-6 py-6 border-b border-sidebar-border flex items-center justify-between">
          <Link to={homePath} className="flex items-center gap-3" onClick={() => setOpen(false)}>
            <div className="size-10 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center">
              <School className="size-5" />
            </div>
            <div>
              <div className="font-display font-bold text-lg leading-none">MBGEduGuinée</div>
              <div className="text-xs text-sidebar-foreground/60 mt-1">Gestion scolaire</div>
            </div>
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <InstallPWA className="mb-2" />
          <div className="text-xs text-sidebar-foreground/60 mb-2 truncate">{user?.email}</div>
          <Button variant="outline" size="sm" className="w-full justify-start gap-2 bg-transparent text-sidebar-foreground border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" onClick={handleSignOut}>
            <LogOut className="size-4" /> Se déconnecter
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card/60 backdrop-blur flex items-center px-4 lg:px-8 gap-3 sticky top-0 z-30">
          <button className="lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <div className="text-sm text-muted-foreground hidden sm:block">
            Année scolaire <span className="font-medium text-foreground">{school?.academic_year ?? "—"}</span>
          </div>
          <ConakryClock />
          <NotificationsBell />
        </header>
        <main key={pathname} className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto page-fade-in">
          <SchoolIdentityHeader />
          {children}
        </main>
      </div>
    </div>
  );
}
