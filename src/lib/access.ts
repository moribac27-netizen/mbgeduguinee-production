import type { AppRole } from "@/hooks/useAuth";

/** Rôles de direction pédagogique ajoutés (rattachés à une école). */
export const PEDAGOGIC_DIRECTION: AppRole[] = ["directeur_etudes", "proviseur"];

// Route -> roles allowed to access it. Longer prefixes win.
// "*" means all authenticated users. Super admin bypasses all rules.
export const ROUTE_ACCESS: Array<{ prefix: string; roles: AppRole[] | "*" }> = [
  { prefix: "/super-admin", roles: [] }, // super admin only
  { prefix: "/directeur", roles: ["admin"] },
  { prefix: "/sauvegarde", roles: ["admin", "directeur"] },
  { prefix: "/journal", roles: ["admin", "directeur"] },
  { prefix: "/parametres", roles: ["admin", "directeur"] },
  { prefix: "/collaborateurs", roles: ["admin", "directeur", "directeur_etudes", "proviseur"] }, // écran Collaborateurs (Prompt 2)
  { prefix: "/personnalisation-recu", roles: ["admin", "directeur", "comptable"] },
  { prefix: "/comptabilite", roles: ["admin", "directeur", "comptable"] },
  { prefix: "/salaires", roles: ["admin", "directeur", "comptable", "rh"] },
  { prefix: "/paiements", roles: ["admin", "directeur", "comptable"] },
  { prefix: "/cotisations", roles: ["admin", "directeur", "comptable"] },
  { prefix: "/resultats-generaux", roles: ["admin", "directeur", "directeur_etudes", "proviseur"] },
  { prefix: "/analyse-scolaire", roles: ["admin", "directeur", "directeur_etudes", "proviseur"] },
  { prefix: "/rapports", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "comptable"] },
  { prefix: "/direction-etudes", roles: ["admin", "directeur", "directeur_etudes", "proviseur"] },
  { prefix: "/eleves", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "enseignant", "surveillant", "secretariat"] },
  { prefix: "/sortie-eleve", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "secretariat"] },
  { prefix: "/maternelle", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "enseignant", "educatrice_maternelle"] },
  { prefix: "/enseignants", roles: ["admin", "directeur", "directeur_etudes", "proviseur"] },
  { prefix: "/matieres", roles: ["admin", "directeur", "directeur_etudes", "proviseur"] },
  { prefix: "/cartes", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "surveillant", "secretariat"] },
  { prefix: "/classes", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "secretariat"] },
  { prefix: "/affectations", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "secretariat"] },
  { prefix: "/emploi-du-temps", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "enseignant", "surveillant", "secretariat"] },
  { prefix: "/presences", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "enseignant", "surveillant"] },
  { prefix: "/notes", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "enseignant"] },
  { prefix: "/examens", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "enseignant"] },
  { prefix: "/bulletins", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "enseignant"] },
  { prefix: "/bibliotheque", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "bibliothecaire"] },
  { prefix: "/discipline", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "surveillant"] }, // module Discipline (Prompt 1)
  { prefix: "/infirmerie", roles: ["admin", "directeur", "enseignant", "infirmerie"] },
  { prefix: "/transport", roles: ["admin", "directeur", "comptable", "responsable_transport"] },
  { prefix: "/cantine", roles: ["admin", "directeur", "comptable", "responsable_cantine"] },
  { prefix: "/annonces", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "enseignant", "surveillant", "secretariat"] },
  { prefix: "/dashboard", roles: ["admin", "directeur", "directeur_etudes", "proviseur", "enseignant", "comptable", "surveillant"] },
  { prefix: "/parent", roles: ["parent"] },
  { prefix: "/eleve", roles: ["eleve"] },
  { prefix: "/evenements", roles: "*" },
  { prefix: "/calendrier", roles: "*" },
  { prefix: "/messagerie", roles: "*" },
];

// Garde-fou : un préfixe dupliqué fait taire silencieusement la seconde règle
// (Array.find() ne renvoie que la première correspondance). Erreur immédiate
// en dev/CI plutôt qu'une régression de permissions découverte en production.
if (import.meta.env?.DEV) {
  const seen = new Set<string>();
  for (const rule of ROUTE_ACCESS) {
    if (seen.has(rule.prefix)) {
      throw new Error(`ROUTE_ACCESS: préfixe dupliqué "${rule.prefix}" — fusionnez les deux règles.`);
    }
    seen.add(rule.prefix);
  }
}

function matchRule(pathname: string) {
  const sorted = [...ROUTE_ACCESS].sort((a, b) => b.prefix.length - a.prefix.length);
  return sorted.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
}

export function canAccess(pathname: string, roles: AppRole[], isSuperAdmin: boolean): boolean {
  if (isSuperAdmin) return true;
  const rule = matchRule(pathname);
  if (!rule) return true; // unknown route -> let router handle 404
  if (rule.roles === "*") return roles.length > 0;
  if (rule.roles.length === 0) return false;
  return roles.some((r) => (rule.roles as AppRole[]).includes(r));
}

export function homeForRoles(roles: AppRole[], isSuperAdmin: boolean): string {
  if (isSuperAdmin) return "/super-admin";
  if (roles.includes("admin") || roles.includes("directeur")) return "/dashboard";
  if (roles.includes("directeur_etudes") || roles.includes("proviseur")) return "/direction-etudes";
  if (roles.includes("comptable")) return "/paiements";
  if (roles.includes("rh")) return "/salaires";
  if (roles.includes("enseignant") || roles.includes("surveillant")) return "/dashboard";
  if (roles.includes("educatrice_maternelle")) return "/maternelle";
  if (roles.includes("secretariat")) return "/eleves";
  if (roles.includes("bibliothecaire")) return "/bibliotheque";
  if (roles.includes("infirmerie")) return "/infirmerie";
  if (roles.includes("responsable_transport")) return "/transport";
  if (roles.includes("responsable_cantine")) return "/cantine";
  if (roles.includes("parent")) return "/parent";
  if (roles.includes("eleve")) return "/eleve";
  return "/dashboard";
}

/** Peut publier des événements inter-écoles pour son établissement. */
export function canPublishEvents(roles: AppRole[], isSuperAdmin: boolean): boolean {
  return isSuperAdmin || roles.some((r) => ["admin", "directeur", "directeur_etudes", "proviseur"].includes(r));
}
