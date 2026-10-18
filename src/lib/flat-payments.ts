/** Mois de l'année académique « AAAA-AAAA+1 » : septembre → août, au format 1er du mois. */
export function monthsOfAcademicYear(year: string): Array<{ value: string; label: string }> {
  const y = Number(String(year).split("-")[0]);
  if (!Number.isFinite(y)) return [];
  const out: Array<{ value: string; label: string }> = [];
  for (let i = 0; i < 12; i++) {
    const m = ((8 + i) % 12) + 1; // 9,10,11,12,1,...,8
    const yy = m >= 9 ? y : y + 1;
    const value = `${yy}-${String(m).padStart(2, "0")}-01`;
    const label = new Date(Date.UTC(yy, m - 1, 1)).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
    out.push({ value, label });
  }
  return out;
}

const MESSAGES: Record<string, string> = {
  FORBIDDEN: "Vous n'avez pas le droit d'effectuer cette action.",
  NO_FLAT_OFFER: "Votre établissement n'est pas sous une offre établissement.",
  REFERENCE_REQUIRED: "La référence du paiement est obligatoire (au moins 4 caractères).",
  MONTH_REQUIRED: "Choisissez le mois payé.",
  MONTH_OUTSIDE_YEAR: "Ce mois n'appartient pas à l'année académique de votre offre.",
  MONTHLY_ALREADY_DECLARED: "Des paiements mensuels existent déjà pour cette année : le paiement annuel n'est plus possible.",
  ANNUAL_ALREADY_DECLARED: "Le paiement annuel est déjà déclaré pour cette année.",
  DUPLICATE_PAYMENT: "Ce paiement existe déjà (même période ou même référence).",
  PERIOD_INVALID: "Type de paiement invalide.",
  PAYMENT_NOT_FOUND: "Paiement introuvable.",
  ALREADY_REVIEWED: "Ce paiement a déjà été traité.",
};

export function flatPaymentErrorMessage(raw: string | undefined | null): string {
  const text = String(raw ?? "");
  for (const k of Object.keys(MESSAGES)) if (text.includes(k)) return MESSAGES[k];
  return "Opération impossible pour le moment. Réessayez ou contactez l'administration.";
}
