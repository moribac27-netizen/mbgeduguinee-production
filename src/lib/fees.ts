import { getCurrentAcademicYear } from "./academic-year";

/**
 * Frais de scolarité : ce qui est dû, ce qui est payé et ce qui reste, calculés de la même façon partout
 * (paiements, tableau de bord, relances) et comme dans la Vue Fondateur : paiements de type « scolarité »,
 * validés, de l'année scolaire en cours (rentrée le 1er septembre), remboursements déduits.
 */

/** Seul le type « scolarité » s'impute sur les frais annuels de la classe. Inscription, cantine, transport… sont des paiements à part. */
export const TUITION_PAYMENT_TYPES = ["scolarite", "scolarité"] as const;

/** Début (AAAA-MM-JJ) de l'année scolaire en cours. */
export function academicYearStart(date = new Date()): string {
  return `${getCurrentAcademicYear(date).slice(0, 4)}-09-01`;
}

const norm = (t: unknown) => String(t ?? "").trim().toLowerCase();
export const isTuitionPayment = (type: unknown) => (TUITION_PAYMENT_TYPES as readonly string[]).includes(norm(type));

export interface PaymentLike { amount: number | string | null; validation_status?: string | null; payment_type?: string | null; paid_at?: string | null }

/** Total validé imputé sur les frais annuels (les remboursements, négatifs, sont déduits). */
export function tuitionPaid(payments: PaymentLike[] | null | undefined, since: string = academicYearStart()): number {
  return (payments ?? [])
    .filter((p) => p.validation_status === "validé" && isTuitionPayment(p.payment_type) && (!p.paid_at || String(p.paid_at).slice(0, 10) >= since))
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);
}

export interface FeeStatus { due: number; paid: number; remaining: number; pct: number }

export function feeStatus(annualFee: number | string | null | undefined, payments: PaymentLike[] | null | undefined, since?: string): FeeStatus {
  const due = Number(annualFee ?? 0) || 0;
  const paid = tuitionPaid(payments, since);
  return { due, paid, remaining: Math.max(due - paid, 0), pct: due > 0 ? (paid / due) * 100 : 0 };
}

/** Élève « en retard » : frais définis et moins de la moitié payée. */
export const LATE_THRESHOLD_PCT = 50;
export const isLate = (s: FeeStatus) => s.due > 0 && s.pct < LATE_THRESHOLD_PCT;
