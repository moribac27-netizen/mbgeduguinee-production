/** Premier et dernier jour d'un mois « AAAA-MM » (sans fuseau : dates de calendrier). */
export function monthBounds(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Mois en cours à Conakry (UTC+0). */
export function currentMonthConakry(): string {
  return new Date().toISOString().slice(0, 7);
}

export const FOUNDER_ERRORS: Record<string, string> = {
  FORBIDDEN: "Accès non autorisé pour cet établissement.",
  SCHOOL_NOT_FOUND: "Établissement introuvable.",
  PERIOD_INVALID: "La date de fin précède la date de début.",
  PERIOD_TOO_LONG: "Période trop longue (400 jours maximum).",
  NOT_LINKED: "Ce fondateur n'est pas rattaché à cet établissement.",
  USER_NOT_FOUND: "Utilisateur introuvable.",
  SUPER_ADMIN_NOT_ALLOWED: "Un Super Admin ne peut pas être fondateur.",
};

export function founderErrorMessage(e: unknown): string {
  const msg = String((e as any)?.message ?? e ?? "");
  const code = Object.keys(FOUNDER_ERRORS).find((k) => msg.includes(k));
  return code ? FOUNDER_ERRORS[code] : "Une erreur est survenue. Réessayez.";
}
