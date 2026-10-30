/** Fonctions pures de la comptabilité (périodes, export CSV, libellés, messages d'erreur). */

export type PeriodPreset = "month" | "quarter" | "year" | "school_year" | "all" | "custom";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Bornes AAAA-MM-JJ (incluses) d'une période ; null = pas de borne. `today` = AAAA-MM-JJ (date du jour en Guinée). */
export function periodRange(preset: PeriodPreset, today: string, custom?: { from?: string; to?: string }): { from: string | null; to: string | null } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  switch (preset) {
    case "month": return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) };
    case "quarter": {
      const q0 = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: iso(y, q0, 1), to: iso(y, q0 + 2, lastDay(y, q0 + 2)) };
    }
    case "year": return { from: iso(y, 1, 1), to: iso(y, 12, 31) };
    // Année scolaire guinéenne : 1er septembre → 31 août.
    case "school_year": {
      const start = m >= 9 ? y : y - 1;
      return { from: iso(start, 9, 1), to: iso(start + 1, 8, 31) };
    }
    case "custom": return { from: custom?.from || null, to: custom?.to || null };
    default: return { from: null, to: null };
  }
}

export interface CsvColumn<T> { label: string; value: (row: T) => string | number | null | undefined }

/** CSV compatible Excel français : séparateur « ; », BOM UTF-8, guillemets échappés, protection contre l'injection de formules. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = "'" + s;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map((c) => cell(c.label)).join(";"), ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(";"))];
  return "﻿" + lines.join("\r\n");
}

export const REVENUE_LABELS: Record<string, string> = {
  inscription: "Inscription", reinscription: "Réinscription", scolarite: "Scolarité", transport: "Transport",
  cantine: "Cantine", uniforme: "Uniforme", examens: "Examens", autres: "Autres",
};
export const EXPENSE_LABELS: Record<string, string> = {
  salaires: "Salaires", fournitures: "Fournitures", eau: "Eau", electricite: "Électricité",
  internet: "Internet", entretien: "Entretien", carburant: "Carburant", autres: "Autres",
};
export const ACCOUNT_LABELS: Record<string, string> = {
  caisse: "Caisse", banque: "Banque", mobile_money: "Mobile Money", orange_money: "Orange Money", autre: "Autre",
};
export const METHOD_LABELS: Record<string, string> = {
  especes: "Espèces", cheque: "Chèque", virement: "Virement", mobile_money: "Mobile Money", orange_money: "Orange Money", autre: "Autre",
};

const MESSAGES: Record<string, string> = {
  FORBIDDEN: "Vous n'avez pas le droit d'effectuer cette action.",
  PAYMENT_NOT_FOUND: "Paiement introuvable.",
  PAYMENT_NOT_VALIDATED: "Seuls les paiements validés peuvent être comptabilisés.",
  PAYSLIP_NOT_FOUND: "Bulletin de paie introuvable.",
  PAYSLIP_NOT_PAID: "Seuls les bulletins marqués « payé » peuvent être comptabilisés.",
  ALREADY_POSTED: "Déjà comptabilisé.",
};

/** Message lisible pour une erreur de la base (les messages de l'intégrité comptable sont déjà en français). */
export function accountingErrorMessage(raw: string | undefined | null): string {
  const text = String(raw ?? "");
  for (const k of Object.keys(MESSAGES)) if (text.includes(k)) return MESSAGES[k];
  if (/row-level security|permission denied/i.test(text)) return "Droits insuffisants ou établissement en accès limité.";
  if (/violates check constraint .*amount/i.test(text)) return "Le montant doit être supérieur à 0.";
  return text || "Opération impossible pour le moment.";
}

/** Solde négatif ? (alerte visuelle sur les comptes) */
export const isNegative = (n: number) => Number(n) < 0;
