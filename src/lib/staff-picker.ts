/** Personnel déjà enregistré (enseignants, RH) proposé à la création d'un compte collaborateur. */
import type { AppRole } from "@/hooks/useAuth";
import { normalizeTeacherType } from "@/lib/teacher-types";

export interface StaffOption {
  key: string;
  source: "teacher" | "contract";
  teacherId: string | null;
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

/**
 * Construit la liste : enseignants sans compte, puis personnel RH non enseignant (sans fiche enseignant) dont le nom
 * n'est pas déjà celui d'un compte ou d'un enseignant proposé.
 */
export function buildStaffOptions(
  teachers: Array<{ id: string; full_name: string; email?: string | null; phone?: string | null; user_id?: string | null; teacher_type?: string | null; matricule?: string | null }>,
  contracts: Array<{ id: string; teacher_id?: string | null; full_name: string; position?: string | null }>,
  existingNames: string[] = [],
): StaffOption[] {
  const taken = new Set(existingNames.map(norm));
  const out: StaffOption[] = [];
  for (const t of teachers) {
    if (t.user_id) continue;
    out.push({
      key: "t:" + t.id, source: "teacher", teacherId: t.id, fullName: t.full_name, email: t.email ?? "", phone: t.phone ?? "",
      role: teacherRole(t.teacher_type), detail: normalizeTeacherType(t.teacher_type) === "educatrice" ? "Éducatrice" : normalizeTeacherType(t.teacher_type) === "instituteur" ? "Instituteur" : "Enseignant",
    });
    taken.add(norm(t.full_name));
  }
  for (const c of contracts) {
    if (c.teacher_id || !c.full_name || taken.has(norm(c.full_name))) continue;
    taken.add(norm(c.full_name));
    out.push({ key: "c:" + c.id, source: "contract", teacherId: null, fullName: c.full_name, email: "", phone: "", role: suggestRoleFromPosition(c.position), detail: c.position || "Personnel" });
  }
  return out.sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));
}
