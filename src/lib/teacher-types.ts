/** Types d'enseignants et règles d'affectation (primaire, maternelle, spécialisé). */
export type TeacherType = "instituteur" | "educatrice" | "specialise";

export const TEACHER_TYPE_LABELS: Record<TeacherType, string> = {
  instituteur: "Instituteur (primaire)",
  educatrice: "Éducatrice (maternelle)",
  specialise: "Enseignant spécialisé (collège/lycée)",
};
export const TEACHER_TYPE_SHORT: Record<TeacherType, string> = { instituteur: "Instituteur", educatrice: "Éducatrice", specialise: "Spécialisé" };

export const normalizeTeacherType = (t: unknown): TeacherType => (t === "instituteur" || t === "educatrice" ? t : "specialise");

/** Un instituteur ou une éducatrice est titulaire : affecté à une classe, il/elle prend toutes les matières (ou domaines d'éveil). */
export const isTitularType = (t: unknown) => normalizeTeacherType(t) !== "specialise";

const norm = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const levelKind = (level?: string | null): "maternelle" | "primaire" | "autre" =>
  /maternelle/.test(norm(level ?? "")) ? "maternelle" : /primaire/.test(norm(level ?? "")) ? "primaire" : "autre";

/** Classes proposées selon le type d'enseignant (les spécialisés peuvent enseigner partout hors maternelle ; une classe sans niveau reste proposée). */
export function classesForTeacherType<T extends { level?: string | null }>(type: unknown, classes: T[]): T[] {
  const t = normalizeTeacherType(type);
  return classes.filter((c) => {
    const k = levelKind(c.level);
    if (t === "instituteur") return k === "primaire";
    if (t === "educatrice") return k === "maternelle";
    return k !== "maternelle";
  });
}

export function assignmentErrorMessage(raw: string | undefined | null, code?: string | null): string {
  const m = raw ?? "";
  if (m.includes("tca_one_titular")) return "Cette classe a déjà un titulaire (toutes matières) pour cette année. Retirez-le d'abord ou affectez cet enseignant à une matière précise.";
  if (m.includes("tca_unique_assignment") || code === "23505") return "Cette affectation existe déjà.";
  return m;
}
