/** Matières courantes proposées à une école qui démarre (coefficients modifiables ensuite). */
export interface SubjectTemplate { name: string; coefficient: number }

export const PRIMARY_SUBJECTS: SubjectTemplate[] = [
  { name: "Français", coefficient: 3 },
  { name: "Mathématiques", coefficient: 3 },
  { name: "Éveil scientifique", coefficient: 2 },
  { name: "Histoire-Géographie", coefficient: 2 },
  { name: "Éducation civique et morale", coefficient: 1 },
  { name: "Éducation artistique", coefficient: 1 },
  { name: "Éducation physique et sportive", coefficient: 1 },
];

export const SECONDARY_SUBJECTS: SubjectTemplate[] = [
  { name: "Français", coefficient: 4 },
  { name: "Mathématiques", coefficient: 4 },
  { name: "Anglais", coefficient: 2 },
  { name: "Physique-Chimie", coefficient: 3 },
  { name: "Sciences de la vie et de la terre", coefficient: 3 },
  { name: "Histoire-Géographie", coefficient: 3 },
  { name: "Éducation civique et morale", coefficient: 1 },
  { name: "Éducation physique et sportive", coefficient: 1 },
  { name: "Informatique", coefficient: 1 },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Matières du modèle qui n'existent pas encore (comparaison sans accents ni casse). */
export function missingSubjects(template: SubjectTemplate[], existing: { name: string }[]): SubjectTemplate[] {
  const have = new Set(existing.map((s) => norm(s.name)));
  return template.filter((t) => !have.has(norm(t.name)));
}
