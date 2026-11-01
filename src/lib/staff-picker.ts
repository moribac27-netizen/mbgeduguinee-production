/** Personnel déjà enregistré (enseignants, RH) proposé à la création d'un compte collaborateur. */
import type { AppRole } from "@/hooks/useAuth";
import { normalizeTeacherType } from "@/lib/teacher-types";

export interface StaffOption {
  key: string;
  source: "teacher" | "contract";
  teacherId: string | null;
  contractId: string | null;
  fullName: string;
  email: string;
  phone: string;
  role: AppRole;
  detail: string;
}

const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Rôle conseillé d'après l'intitulé du poste (modifiable ensuite). */
export function suggestRoleFromPosition(position?: string | null): AppRole {
  const p = norm(position ?? "");
  if (/directeur.*etude|prefet/.test(p)) return "directeur_etudes";
  if (/proviseur/.test(p)) return "proviseur";
  if (/comptab|caiss|econom|intend/.test(p)) return "comptable";
  if (/surveill|discipline/.test(p)) return "surveillant";
  if (/biblio/.test(p)) return "bibliothecaire";
  if (/infirm|sante|medec/.test(p)) return "infirmerie";
  if (/chauffeur|transport/.test(p)) return "responsable_transport";
  if (/cantine|cuisin/.test(p)) return "responsable_cantine";
  if (/ressources humaines|\brh\b/.test(p)) return "rh";
  if (/educatrice|maternelle|monitrice/.test(p)) return "educatrice_maternelle";
  if (/enseignant|instituteur|professeur|maitre/.test(p)) return "enseignant";
  return "secretariat";
}

export function teacherRole(type: unknown): AppRole {
  return normalizeTeacherType(type) === "educatrice" ? "educatrice_maternelle" : "enseignant";
}

/** Ligne de l'annuaire du personnel (RPC staff_directory). */
export interface StaffRow {
  kind: "enseignant" | "non_enseignant"; teacher_id: string | null; contract_id: string | null;
  full_name: string; email: string | null; phone: string | null; job_title: string | null; teacher_type: string | null; user_id: string | null;
}

/** Personnel sans compte de connexion, proposé à la création d'un collaborateur ; on écarte les noms déjà utilisés par un compte existant. */
export function buildStaffOptions(rows: StaffRow[], existingNames: string[] = []): StaffOption[] {
  const taken = new Set(existingNames.map(norm));
  const out: StaffOption[] = [];
  for (const r of rows) {
    if (r.user_id || !r.full_name || taken.has(norm(r.full_name))) continue;
    taken.add(norm(r.full_name));
    out.push({
      key: (r.teacher_id ? "t:" + r.teacher_id : "c:" + r.contract_id), source: r.kind === "enseignant" ? "teacher" : "contract",
      teacherId: r.teacher_id, contractId: r.contract_id, fullName: r.full_name, email: r.email ?? "", phone: r.phone ?? "",
      role: r.kind === "enseignant" ? teacherRole(r.teacher_type) : suggestRoleFromPosition(r.job_title), detail: r.job_title || (r.kind === "enseignant" ? "Enseignant" : "Personnel"),
    });
  }
  return out.sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));
}

/** Postes usuels du personnel non enseignant (liste de choix à l'enregistrement). */
export const NON_TEACHING_POSITIONS = [
  "Secrétaire", "Comptable", "Caissier", "Surveillant général", "Bibliothécaire", "Infirmier(ère)", "Chauffeur", "Responsable cantine",
  "Responsable transport", "Directeur des études", "Proviseur", "Ressources humaines", "Gardien", "Agent d'entretien",
] as const;
