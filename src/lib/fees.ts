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

export interface FeeStatus { due: number; paid: number; remaining: number; pct: number; adjustment: number }

/**
 * `adjustment` = réductions / bourses / exonérations non annulées de l'année : le dû net est « frais de la classe − réductions ».
 * Un élève totalement exonéré a un dû de 0 : il n'est jamais « en retard ».
 */
export function feeStatus(annualFee: number | string | null | undefined, payments: PaymentLike[] | null | undefined, since?: string, adjustment: number | string | null | undefined = 0): FeeStatus {
  const adj = Math.max(Number(adjustment ?? 0) || 0, 0);
  const due = Math.max((Number(annualFee ?? 0) || 0) - adj, 0);
  const paid = tuitionPaid(payments, since);
  return { due, paid, remaining: Math.max(due - paid, 0), pct: due > 0 ? (paid / due) * 100 : 0, adjustment: adj };
}

/** Somme des réductions par élève à partir des lignes { student_id, amount } (les lignes annulées sont déjà exclues par la requête). */
export function adjustmentsByStudent(rows: { student_id: string; amount: number | string }[] | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows ?? []) m.set(r.student_id, (m.get(r.student_id) ?? 0) + Number(r.amount ?? 0));
  return m;
}

export const ADJUSTMENT_LABELS: Record<string, string> = { reduction: "Réduction", bourse: "Bourse", exoneration: "Exonération" };

/** Message lisible pour une erreur de réduction (les messages de la base sont déjà en français). */
export function feeAdjustmentErrorMessage(raw: string | undefined | null): string {
  const text = String(raw ?? "");
  if (/SCHOOL_SUSPENDED|SCHOOL_BLOCKED/.test(text)) return "Établissement suspendu : aucune écriture possible.";
  if (/row-level security|permission denied/i.test(text)) return "Droits insuffisants pour cette action.";
  return text || "Opération impossible pour le moment.";
}

/** Élève « en retard » : frais définis et moins de la moitié payée. */
export const LATE_THRESHOLD_PCT = 50;
export const isLate = (s: FeeStatus) => s.due > 0 && s.pct < LATE_THRESHOLD_PCT;
