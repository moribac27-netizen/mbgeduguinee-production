import type { AppRole } from "@/hooks/useAuth";

/**
 * Rôles qu'un Directeur / Directeur des études peut assigner à un
 * collaborateur depuis l'écran /collaborateurs.
 *
 * Volontairement exclus : "admin" et "directeur" (le compte de direction
 * principal est créé à l'inscription de l'école, pas depuis cet écran),
 * "parent" et "eleve" (créés via le code d'accès famille, cf. Prompt 3).
 *
 * "proviseur" est inclus en plus de "directeur_etudes" bien que le prompt
 * d'origine ne cite que "Directeur des études" : les deux rôles sont déjà
 * traités de façon identique partout ailleurs dans l'app (src/lib/access.ts,
 * PEDAGOGIC_DIRECTION) — probablement le même poste, juste renommé selon le
 * type d'établissement (collège vs lycée). À ajuster si ce n'est pas voulu.
 */
export const ASSIGNABLE_STAFF_ROLES: { value: AppRole; label: string }[] = [
  { value: "directeur_etudes", label: "Directeur des études" },
  { value: "proviseur", label: "Proviseur" },
  { value: "enseignant", label: "Enseignant" },
  { value: "secretariat", label: "Secrétariat / Administration" },
  { value: "comptable", label: "Comptabilité / Caissier" },
  { value: "surveillant", label: "Surveillant général / Discipline" },
  { value: "bibliothecaire", label: "Bibliothécaire" },
  { value: "infirmerie", label: "Infirmerie / Santé scolaire" },
  { value: "educatrice_maternelle", label: "Personnel Maternelle" },
  { value: "responsable_transport", label: "Responsable Transport" },
  { value: "responsable_cantine", label: "Responsable Cantine" },
  { value: "rh", label: "RH" },
];

export const ASSIGNABLE_STAFF_ROLE_VALUES = ASSIGNABLE_STAFF_ROLES.map((r) => r.value);

export function isAssignableStaffRole(role: string): role is AppRole {
  return (ASSIGNABLE_STAFF_ROLE_VALUES as string[]).includes(role);
}
