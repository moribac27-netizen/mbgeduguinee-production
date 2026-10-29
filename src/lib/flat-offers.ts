/** Offres « par établissement » (forfait) : temporaires, valables pour une période réglée par le Super Admin. */
export interface FlatOffer {
  id: string;
  code: string;
  name: string;
  minStudents: number;
  /** null = nombre d'élèves illimité. */
  maxStudents: number | null;
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
  /** Description libre saisie par le Super Admin (facultative). */
  description: string;
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
      maxStudents: r.max_students === null || r.max_students === undefined ? null : Number(r.max_students),
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
      description: typeof r.description === "string" ? r.description.trim() : "",
    }))
    .sort((a, b) => a.minStudents - b.minStudents || a.monthlyPrice - b.monthlyPrice);
}

/** Capacité affichée : « Capacité maximale : 200 élèves » ou « Nombre d'élèves illimité ». */
export function studentRangeText(o: Pick<FlatOffer, "maxStudents">): string {
  return o.maxStudents === null ? "Nombre d'élèves illimité" : `Capacité maximale : ${o.maxStudents.toLocaleString("fr-FR")} élèves`.replace(/[\u202f\u00a0]/g, " ");
}

/** Titre de la catégorie ; l'année vient de la période de validité réglée par le Super Admin. */
export function flatCategoryTitle(offers: FlatOffer[]): string {
  const y = offers[0]?.yearLabel;
  return `PLANS PAR ÉTABLISSEMENT — OFFRE EXCEPTIONNELLE POUR L'ANNÉE SCOLAIRE ${y ?? ""}`.trim();
}

/** Message affiché juste sous le titre de la catégorie. */
export const FLAT_CATEGORY_MESSAGE =
  "Cette offre exceptionnelle est exclusivement valable pour l'année scolaire en cours. À la fin de cette année scolaire, les établissements devront obligatoirement choisir l'un des plans d'abonnement par élève pour poursuivre leur utilisation de MBGEduGuinée. Les plans par établissement ne seront pas reconduits pour l'année scolaire suivante.";

export function flatCategoryMessage(offers: FlatOffer[]): string {
  const y = offers[0]?.yearLabel;
  return y ? FLAT_CATEGORY_MESSAGE.replace("l'année scolaire en cours", `l'année scolaire ${y}`) : FLAT_CATEGORY_MESSAGE;
}

/** Alerte de capacité : proche du plafond (90 %) ou atteint. */
export function capacityState(count: number, max: number | null): "ok" | "near" | "full" | "over" {
  if (max === null) return "ok";
  if (count > max) return "over";
  if (count === max) return "full";
  return count >= Math.floor(max * 0.9) ? "near" : "ok";
}

export const FLAT_OFFERS_PATH = "/offres-etablissement";

/** Date lisible (« 1 septembre 2026 ») à partir de AAAA-MM-JJ, sans décalage de fuseau. */
export function formatDateFr(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
