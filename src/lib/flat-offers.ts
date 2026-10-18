/** Offres « par établissement » (forfait) : temporaires, valables pour une période réglée par le Super Admin. */
export interface FlatOffer {
  id: string;
  code: string;
  name: string;
  minStudents: number;
  maxStudents: number;
  monthlyPrice: number;
  freeMonths: number;
  annualPrice: number;
  validFrom: string;
  validUntil: string;
  /** Année académique affichée, déduite de la période de validité (ex. « 2026-2027 »). */
  yearLabel: string;
  isActive: boolean;
  modules: { cantine: boolean; infirmerie: boolean; bibliotheque: boolean };
  parentLogin: boolean;
  studentLogin: boolean;
}

/** Prix annuel calculé : (12 − mois offerts) × prix mensuel. Jamais saisi à la main. */
export function flatAnnualPrice(monthly: number, freeMonths: number): number {
  const m = Number(monthly) || 0;
  const f = Math.min(11, Math.max(0, Math.floor(Number(freeMonths) || 0)));
  return m * (12 - f);
}

/** Date du jour en Guinée (UTC+0), au format AAAA-MM-JJ. */
export function todayConakry(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** « 2026-2027 » à partir de la période de validité (pas écrit en dur). */
export function yearLabelOf(validFrom: string, validUntil: string): string {
  const a = Number(validFrom.slice(0, 4));
  const b = Number(validUntil.slice(0, 4));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
  return a === b ? String(a) : `${a}-${b}`;
}

/** Une offre est visible si elle est active ET si la date du jour est dans sa période de validité. */
export function isFlatOfferAvailable(r: any, today: string = todayConakry()): boolean {
  return !!r && r.offer_type === "per_school" && r.is_active === true
    && typeof r.valid_from === "string" && typeof r.valid_until === "string"
    && r.valid_from <= today && today <= r.valid_until;
}

export function toFlatOffers(rows: any[] | null | undefined, today: string = todayConakry()): FlatOffer[] {
  return (rows ?? [])
    .filter((r) => isFlatOfferAvailable(r, today) && Number(r.monthly_price) > 0)
    .map((r): FlatOffer => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name ?? r.code),
      minStudents: Number(r.min_students) || 0,
      maxStudents: Number(r.max_students) || 0,
      monthlyPrice: Number(r.monthly_price),
      freeMonths: Number(r.free_months_annual) || 0,
      annualPrice: flatAnnualPrice(Number(r.monthly_price), Number(r.free_months_annual)),
      validFrom: r.valid_from,
      validUntil: r.valid_until,
      yearLabel: yearLabelOf(r.valid_from, r.valid_until),
      isActive: true,
      modules: { cantine: r.features?.cantine !== false, infirmerie: r.features?.infirmerie !== false, bibliotheque: r.features?.bibliotheque !== false },
      parentLogin: !!r.parent_login_allowed,
      studentLogin: !!r.student_login_allowed,
    }))
    .sort((a, b) => a.minStudents - b.minStudents || a.monthlyPrice - b.monthlyPrice);
}

export function studentRangeText(o: Pick<FlatOffer, "minStudents" | "maxStudents">): string {
  return `de ${o.minStudents.toLocaleString("fr-FR")} à ${o.maxStudents.toLocaleString("fr-FR")} élèves`.replace(/[  ]/g, " ");
}

/** Mention affichée sous les offres par élève. L'année vient de la période de validité réglée par le Super Admin. */
export function flatOffersNotice(offers: FlatOffer[]): string {
  const y = offers[0]?.yearLabel;
  return `Offres par établissement disponibles uniquement pour l'année académique en cours${y ? ` (${y})` : ""}. Dès l'année prochaine, les établissements devront choisir l'une des trois offres par élève.`;
}

export const FLAT_OFFERS_TOP_MESSAGE =
  "Choisissez les offres par établissement uniquement pour cette année académique en cours. Dès l'année prochaine, le choix se fera parmi les trois offres par élève.";

export const FLAT_OFFERS_PATH = "/offres-etablissement";
