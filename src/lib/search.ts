/** Minuscules, sans accents, espaces simples : « Élève  Dîallo » → « eleve diallo ». */
export function normalizeSearch(s: unknown): string {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Vrai si chaque mot saisi se retrouve dans l'un des champs (nom, matricule, classe…), sans tenir compte des accents ni de l'ordre. */
export function matchesSearch(query: string, ...fields: unknown[]): boolean {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = normalizeSearch(fields.filter((f) => f != null && f !== "").join(" "));
  return tokens.every((t) => hay.includes(t));
}
