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
  caisse: "Caisse", banque: "Banque", mobile_money: "Mobile Money", orange_money: "Orange Money", mtn_momo: "MTN MoMo", autre: "Autre",
};

export interface AccountTemplate { name: string; type: string; description: string; base?: boolean }

/** Comptes que la plupart des établissements scolaires tiennent. `base` = recommandés pour démarrer. */
export const ACCOUNT_CATALOG: AccountTemplate[] = [
  { name: "Caisse principale", type: "caisse", description: "Espèces encaissées au bureau (scolarité, inscriptions).", base: true },
  { name: "Banque — compte courant", type: "banque", description: "Compte bancaire de l'établissement.", base: true },
  { name: "Orange Money", type: "orange_money", description: "Paiements reçus par Orange Money.", base: true },
  { name: "Caisse économat (petites dépenses)", type: "caisse", description: "Fournitures, entretien et petites dépenses courantes.", base: true },
  { name: "Caisse de la direction", type: "caisse", description: "Fonds gardés par la direction pour les urgences." },
  { name: "MTN Mobile Money", type: "mtn_momo", description: "Paiements reçus par MTN MoMo." },
  { name: "Autre portefeuille mobile", type: "mobile_money", description: "Tout autre service de paiement mobile." },
  { name: "Compte d'épargne / réserve", type: "banque", description: "Argent mis de côté (réserve de sécurité)." },
  { name: "Fonds de construction / investissement", type: "banque", description: "Projets de construction, achat de matériel." },
  { name: "Compte subventions et dons", type: "banque", description: "Aides, subventions et dons reçus." },
  { name: "Caisse cantine", type: "caisse", description: "Recettes et achats de la cantine." },
  { name: "Caisse transport scolaire", type: "caisse", description: "Abonnements de transport, carburant et entretien du bus." },
  { name: "Caisse examens et concours", type: "caisse", description: "Frais d'examens reçus et dépensés." },
  { name: "Caisse activités et événements", type: "caisse", description: "Fêtes, sorties, kermesse." },
  { name: "Caisse bibliothèque", type: "caisse", description: "Pénalités, ventes et achats de livres." },
  { name: "Caisse infirmerie", type: "caisse", description: "Achats de médicaments et de matériel de soin." },
  { name: "Caisse avances au personnel", type: "caisse", description: "Avances sur salaire et prêts au personnel." },
];

/** Modèles pas encore créés (comparaison sans tenir compte de la casse ni des espaces). */
export function missingTemplates(existingNames: string[], catalog: AccountTemplate[] = ACCOUNT_CATALOG): AccountTemplate[] {
  const have = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  return catalog.filter((t) => !have.has(t.name.trim().toLowerCase()));
}
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

// ---- Montant en lettres (français) -------------------------------------------------------------------------------------
const UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

function below100(n: number, final: boolean): string {
  if (n < 17) return UNITS[n];
  if (n < 20) return "dix-" + UNITS[n - 10];
  if (n < 70) {
    const t = TENS[Math.floor(n / 10)], u = n % 10;
    return u === 0 ? t : u === 1 ? `${t} et un` : `${t}-${UNITS[u]}`;
  }
  if (n < 80) return n === 71 ? "soixante et onze" : "soixante-" + below100(n - 60, final);
  if (n === 80) return final ? "quatre-vingts" : "quatre-vingt";
  return "quatre-vingt-" + below100(n - 80, final);
}

function below1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100), rest = n % 100;
  if (h === 0) return below100(rest, final);
  const hundred = h === 1 ? "cent" : `${UNITS[h]} cent`;
  if (rest === 0) return h > 1 && final ? hundred + "s" : hundred;
  return `${hundred} ${below100(rest, final)}`;
}

/** 1 500 000 → « un million cinq cent mille ». Valide de 0 à 999 999 999 999 ; au-delà, retourne une chaîne vide. */
export function amountInWordsFr(value: number): string {
  const n = Math.floor(Math.abs(Number(value)));
  if (!Number.isFinite(n) || n > 999_999_999_999) return "";
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const billions = Math.floor(n / 1e9), millions = Math.floor((n % 1e9) / 1e6), thousands = Math.floor((n % 1e6) / 1e3), rest = n % 1000;
  if (billions) parts.push(`${below1000(billions, true)} milliard${billions > 1 ? "s" : ""}`);
  if (millions) parts.push(`${below1000(millions, true)} million${millions > 1 ? "s" : ""}`);
  if (thousands) parts.push(thousands === 1 ? "mille" : `${below1000(thousands, false)} mille`);
  if (rest) parts.push(below1000(rest, true));
  return parts.join(" ");
}

// ---- Budget ----------------------------------------------------------------------------------------------------------------
/** Avancement du réalisé par rapport au prévu. Pour une dépense, dépasser le budget est une alerte ; pour une recette, être en dessous l'est moins. */
export function budgetProgress(budget: number, actual: number, kind: "revenue" | "expense"): { percent: number | null; state: "none" | "ok" | "warn" | "over" } {
  const b = Number(budget) || 0, a = Number(actual) || 0;
  if (b <= 0) return { percent: null, state: a > 0 && kind === "expense" ? "over" : "none" };
  const percent = Math.round((a / b) * 100);
  if (kind === "expense") return { percent, state: a > b ? "over" : percent >= 90 ? "warn" : "ok" };
  return { percent, state: "ok" };
}

// ---- Reçu de recette / bon de dépense ----------------------------------------------------------------------------------
const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const money = (n: number) => new Intl.NumberFormat("fr-FR").format(Math.round(n)).replace(/[\u202f\u00a0]/g, " ") + " GNF";

export interface ReceiptInput {
  kind: "revenue" | "expense";
  id: string;
  date: string;
  amount: number;
  typeLabel: string;
  accountName?: string | null;
  methodLabel?: string | null;
  reference?: string | null;
  description?: string | null;
  beneficiary?: string | null;
  voidReason?: string | null;
  school: { name?: string | null; address?: string | null; phone?: string | null };
}

/** HTML imprimable d'un reçu de recette (« REÇU ») ou d'un bon de dépense. Toutes les valeurs sont échappées. */
export function buildEntryReceiptHtml(r: ReceiptInput): string {
  const isRev = r.kind === "revenue";
  const number = (isRev ? "R-" : "D-") + r.id.replace(/-/g, "").slice(0, 8).toUpperCase();
  const words = amountInWordsFr(r.amount);
  const row = (k: string, v?: string | null) => (v ? `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>` : "");
  const date = new Date(String(r.date).slice(0, 10) + "T00:00:00").toLocaleDateString("fr-FR");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${isRev ? "Reçu" : "Bon de dépense"} ${esc(number)}</title>
<style>body{font-family:Arial,sans-serif;margin:36px;color:#0B1F3A}h1{font-size:20px;margin:0}h2{font-size:16px;margin:18px 0 0}.head{border-bottom:2px solid #0B1F3A;padding-bottom:10px;margin-bottom:14px}
table{border-collapse:collapse;width:100%;margin-top:14px}td{border:1px solid #cbd5e1;padding:9px}td:first-child{width:34%;background:#f1f5f9;font-weight:bold}
.amount{font-size:22px;font-weight:bold}.sig{display:flex;justify-content:space-between;margin-top:60px;font-size:13px}.void{color:#b91c1c;font-weight:bold;border:2px solid #b91c1c;display:inline-block;padding:4px 10px;margin-top:10px}</style></head>
<body><div class="head"><h1>${esc(r.school.name || "Établissement")}</h1><div style="font-size:12px">${esc([r.school.address, r.school.phone].filter(Boolean).join(" — "))}</div></div>
<h2>${isRev ? "REÇU DE RECETTE" : "BON DE DÉPENSE"} n° ${esc(number)}</h2>
${r.voidReason ? `<div class="void">ANNULÉ — ${esc(r.voidReason)}</div>` : ""}
<table>${row("Date", date)}${row("Catégorie", r.typeLabel)}${row("Compte", r.accountName)}${row(isRev ? "Reçu de / objet" : "Bénéficiaire", isRev ? r.description : r.beneficiary)}${isRev ? "" : row("Objet", r.description)}${row("Mode de paiement", r.methodLabel)}${row("Référence", r.reference)}
<tr><td>Montant</td><td class="amount">${esc(money(r.amount))}</td></tr></table>
${words ? `<p style="margin-top:14px">Arrêté à la somme de : <strong>${esc(words)} francs guinéens</strong>.</p>` : ""}
<div class="sig"><div>Le comptable<br><br><br>Signature</div><div>${isRev ? "Le payeur" : "Le bénéficiaire"}<br><br><br>Signature</div></div>
<script>window.onload=function(){window.print()}</script></body></html>`;
}

export function printEntryReceipt(r: ReceiptInput): void {
  if (typeof window === "undefined") return;
  const w = window.open("", "_blank", "width=760,height=860");
  if (!w) return;
  w.document.write(buildEntryReceiptHtml(r));
  w.document.close();
}

// ---- Plan comptable (catégories par établissement) ---------------------------------------------------------------------------
export interface AccountingCategory {
  id: string; kind: "recette" | "depense"; code: string; label: string; legacy_type: string | null;
  is_system: boolean; is_active: boolean; sort_order: number;
}
export const categoryLabel = (c: { code?: string | null; label?: string | null } | null | undefined) =>
  c && (c.code || c.label) ? [c.code, c.label].filter(Boolean).join(" — ") : "";

/** Catégories sélectionnables pour une saisie : actives, du bon sens, dans l'ordre du plan comptable. */
export function selectableCategories(all: AccountingCategory[], kind: "recette" | "depense"): AccountingCategory[] {
  return all.filter((c) => c.kind === kind && c.is_active).sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
}

/** Erreurs de saisie d'une catégorie personnalisée (null = valide). */
export function validateCategoryInput(code: string, label: string, existingCodes: string[]): string | null {
  const c = code.trim(), l = label.trim();
  if (c.length < 1 || c.length > 12) return "Le code doit faire entre 1 et 12 caractères.";
  if (l.length < 2 || l.length > 120) return "Le libellé doit faire entre 2 et 120 caractères.";
  if (existingCodes.some((x) => x.trim().toLowerCase() === c.toLowerCase())) return "Ce code existe déjà.";
  return null;
}
