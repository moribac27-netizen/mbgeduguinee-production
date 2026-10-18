/**
 * Facturation des établissements : 2 forfaits selon l'effectif, paiement mensuel ou annuel.
 *
 * Les valeurs réelles (prix, seuils, mois offerts) viennent de Supabase (tables billing_plans / billing_settings) et sont
 * modifiables par le Super Admin. Ce fichier ne contient que la logique pure, qui reproduit la formule du serveur
 * (fonctions SQL billing_compute / billing_plan_for_headcount) POUR L'AFFICHAGE : le montant réellement dû est toujours
 * recalculé par le serveur au moment de la déclaration du paiement.
 */

export type BillingCycle = "monthly" | "yearly";

export interface BillingPlan {
  code: string;
  name: string;
  monthly_price: number;
  max_students: number;
  is_active: boolean;
  sort_order: number;
}

export interface BillingAmounts {
  /** Prix mensuel de référence. */
  monthly: number;
  /** Montant avant réduction (mensuel : 1 mois ; annuel : 12 mois). */
  gross: number;
  /** Réduction accordée (annuel : prix mensuel × mois offerts). */
  discount: number;
  /** Montant final à payer. */
  amount: number;
  /** Nombre de mois réellement facturés. */
  billedMonths: number;
}

/** Valeurs affichées si Supabase est illisible : valeurs initiales proposées, jamais utilisées pour un paiement. */
export const DEFAULT_ANNUAL_FREE_MONTHS = 2;

/** Prix mensuel maximal accepté (exclusif) : même borne que le serveur (contrôle anti NaN / Infinity / valeurs absurdes). */
export const MAX_MONTHLY_PRICE = 1e12;

/** Mois offerts valides : entier de 0 à 12. */
export const isValidFreeMonths = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 12;

/** Calcul des montants. Mensuel : prix × 1. Annuel : brut = prix × 12, réduction = prix × mois offerts, net = brut − réduction. */
export function computeBilling(monthly: number, cycle: BillingCycle, freeMonths: number): BillingAmounts {
  if (!Number.isFinite(monthly) || monthly < 0 || monthly >= MAX_MONTHLY_PRICE) throw new Error("INVALID_PRICE");
  if (cycle !== "monthly" && cycle !== "yearly") throw new Error("INVALID_CYCLE");
  if (!isValidFreeMonths(freeMonths)) throw new Error("INVALID_FREE_MONTHS");
  if (cycle === "monthly") return { monthly, gross: monthly, discount: 0, amount: monthly, billedMonths: 1 };
  const gross = monthly * 12;
  const discount = monthly * freeMonths;
  return { monthly, gross, discount, amount: gross - discount, billedMonths: 12 - freeMonths };
}

/** Forfaits actifs triés par effectif maximal croissant. */
export const activePlans = (plans: BillingPlan[]): BillingPlan[] =>
  plans.filter((p) => p.is_active).sort((a, b) => a.max_students - b.max_students || a.sort_order - b.sort_order);

/** Forfait applicable : forfait actif au plus petit maximum qui couvre l'effectif. null si aucun forfait ne couvre. */
export function planForHeadcount(plans: BillingPlan[], students: number): BillingPlan | null {
  const n = Math.max(0, Math.floor(Number.isFinite(students) ? students : 0));
  return activePlans(plans).find((p) => p.max_students >= n) ?? null;
}

/** Plage d'effectif couverte par chaque forfait actif (minimum = maximum du forfait actif précédent + 1 : aucun chevauchement). */
export function planRanges(plans: BillingPlan[]): Array<{ plan: BillingPlan; min: number; max: number }> {
  let prev = -1;
  return activePlans(plans).map((plan) => {
    const r = { plan, min: prev + 1, max: plan.max_students };
    prev = plan.max_students;
    return r;
  });
}

export interface BillingConfigInput {
  plans: Array<{ code: string; monthly_price: number | string; max_students: number | string; is_active: boolean }>;
  free_months: number | string;
}

/** Contrôle d'un formulaire de configuration avant envoi (le serveur refait les mêmes contrôles). */
export function validateBillingConfig(input: BillingConfigInput): string | null {
  const free = Number(input.free_months);
  if (String(input.free_months).trim() === "" || !isValidFreeMonths(free)) return "La réduction annuelle doit être un nombre entier de mois compris entre 0 et 12.";
  let active = 0;
  let prev = 0;
  for (const p of input.plans) {
    const price = Number(p.monthly_price), max = Number(p.max_students);
    if (String(p.monthly_price).trim() === "" || !Number.isFinite(price) || price < 0 || price >= MAX_MONTHLY_PRICE) return "Le prix mensuel doit être un nombre positif ou nul, d'une valeur raisonnable.";
    if (String(p.max_students).trim() === "" || !Number.isInteger(max) || max < 1) return "Le seuil d'effectif maximal doit être un nombre entier supérieur ou égal à 1.";
    if (p.is_active) {
      active++;
      if (max <= prev) return "Les seuils se chevauchent : l'effectif maximal doit augmenter d'un forfait actif au suivant.";
      prev = max;
    }
  }
  if (active === 0) return "Au moins un forfait doit rester actif.";
  return null;
}

/** Traduit les codes d'erreur des fonctions SQL en messages lisibles. */
export function billingErrorMessage(raw?: string | null): string {
  const m = raw ?? "";
  const map: Record<string, string> = {
    SUPER_ADMIN_REQUIRED: "Seul le Super Admin peut effectuer cette action.",
    AUTH_REQUIRED: "Veuillez vous reconnecter.",
    FORBIDDEN: "Action non autorisée pour votre rôle ou votre établissement.",
    INVALID_PRICE: "Le prix mensuel doit être un nombre positif ou nul, d'une valeur raisonnable.",
    INVALID_THRESHOLD: "Le seuil d'effectif maximal doit être un nombre entier supérieur ou égal à 1.",
    INVALID_VALUES: "Une des valeurs saisies n'est pas un nombre valide.",
    INVALID_FREE_MONTHS: "La réduction annuelle doit être comprise entre 0 et 12 mois.",
    INVALID_CYCLE: "Cycle de paiement invalide.",
    INVALID_PLANS: "Configuration des forfaits invalide.",
    UNKNOWN_PLAN: "Forfait inconnu.",
    THRESHOLDS_OVERLAP: "Les seuils se chevauchent : l'effectif maximal doit augmenter d'un forfait actif au suivant.",
    NO_ACTIVE_PLAN: "Au moins un forfait doit rester actif.",
    NO_PLAN_FOR_HEADCOUNT: "Aucun forfait actif ne couvre l'effectif de cet établissement. Contactez l'administration de la plateforme.",
    REFERENCE_REQUIRED: "La référence de transaction est obligatoire.",
    REFERENCE_ALREADY_USED: "Cette référence de transaction a déjà été utilisée.",
    ALREADY_PENDING: "Un paiement est déjà en attente de validation pour cet établissement.",
    INVALID_STATUS: "Ce paiement n'est plus en attente de validation.",
    PAYMENT_NOT_FOUND: "Paiement introuvable.",
    PAYMENT_IMMUTABLE: "Un paiement validé ou refusé ne peut plus être modifié.",
    REASON_REQUIRED: "Le motif du refus est obligatoire.",
  };
  for (const k of Object.keys(map)) if (m.includes(k)) return map[k];
  return m || "Opération impossible.";
}

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = { monthly: "Mensuel", yearly: "Annuel" };
export const BILLING_STATUS_LABELS: Record<string, string> = { PENDING: "En attente de validation", VALIDATED: "Validé", REJECTED: "Refusé" };

export const BILLING_FIELD_LABELS: Record<string, string> = {
  monthly_price: "Prix mensuel", max_students: "Effectif maximal", is_active: "Forfait actif", annual_free_months: "Mois offerts (paiement annuel)",
};

/** Convertit une ligne SQL en forfait typé (nombres garantis). */
export function toBillingPlan(r: any): BillingPlan {
  return {
    code: String(r.code), name: String(r.name ?? r.code),
    monthly_price: Number(r.monthly_price), max_students: Number(r.max_students),
    is_active: r.is_active !== false, sort_order: Number(r.sort_order) || 0,
  };
}

export const formatBillingGNF = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/[  ]/g, " ")} GNF`;
