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

// ───────────── Lecture rapide pour le fondateur (fonctions pures, testées) ─────────────

const nf = new Intl.NumberFormat("fr-FR");
export const gnf = (n: number) => `${nf.format(Math.round(Number(n) || 0))} GNF`;

/** « 2026-11 » → « nov. 26 » (libellé court d'un mois). */
export function monthLabelFr(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const names = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${names[m - 1] ?? ym} ${String(y).slice(2)}`;
}

/** Montant court pour l'axe d'un graphique : 300 k, 1,5 M, 2 Md. */
export function compactGNF(v: number): string {
  const a = Math.abs(v);
  const f = (x: number) => nf.format(Math.round(x * 10) / 10);
  if (a >= 1e9) return `${f(v / 1e9)} Md`;
  if (a >= 1e6) return `${f(v / 1e6)} M`;
  if (a >= 1e3) return `${f(v / 1e3)} k`;
  return String(Math.round(v));
}

/** Du 1er septembre de l'année scolaire en cours jusqu'à aujourd'hui (dates AAAA-MM-JJ, heure de Conakry). */
export function schoolYearToDate(today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const startYear = m >= 9 ? y : y - 1;
  return { from: `${startYear}-09-01`, to: today };
}

/** Pourcentage encaissé de la scolarité attendue (null si rien n'est attendu). */
export function recoveryRate(expected: number, collected: number): number | null {
  if (!(expected > 0)) return null;
  return Math.max(0, Math.min(100, Math.round((collected * 100) / expected)));
}

export type FounderWatch = { level: "alert" | "warn" | "info"; text: string };

/** Points d'attention, du plus grave au moins grave, en langage simple. Liste vide = rien d'anormal. */
export function founderWatchList(d: Record<string, any>): FounderWatch[] {
  const out: FounderWatch[] = [];
  if (d.suspended) out.push({ level: "alert", text: "L'établissement est suspendu : seule la partie abonnement est consultable." });
  const sub = d.subscription;
  if (sub && !d.suspended) {
    if (sub.phase === "unpaid" || sub.phase === "overdue" || Number(sub.overdue_amount) > 0) {
      out.push({ level: "alert", text: "L'abonnement MBGEduGuinée est en retard de paiement : l'accès risque d'être suspendu." });
    } else if (sub.phase === "trial") {
      out.push({ level: "info", text: "L'établissement est en période d'essai de l'abonnement." });
    }
  }
  const rec = d.recovery, fin = d.finance, head = d.headline;
  if (fin && fin.expense > 0 && Number(fin.result) < 0) {
    out.push({ level: "alert", text: `Les dépenses dépassent les recettes sur la période : résultat de ${gnf(fin.result)}.` });
  }
  if (head && Number(head.treasury_total) < 0) out.push({ level: "alert", text: `La trésorerie est négative (${gnf(head.treasury_total)}).` });
  if (rec) {
    const rate = recoveryRate(Number(rec.fees_expected), Number(rec.fees_collected));
    if (rate !== null && rate < 50) {
      out.push({ level: "warn", text: `Seulement ${rate} % de la scolarité attendue est encaissé : ${rec.students_late} élève(s) n'ont pas fini de payer.` });
    }
  }
  const un = d.alerts?.unposted_payments;
  if (un && Number(un.count) > 0) {
    out.push({ level: "warn", text: `${un.count} paiement(s) de scolarité validé(s), pour ${gnf(un.amount)}, ne sont pas encore enregistrés en comptabilité : les recettes affichées sont plus basses que l'argent réellement reçu.` });
  }
  if (d.staff && Number(d.staff.payslips_unpaid) > 0) out.push({ level: "warn", text: `${d.staff.payslips_unpaid} bulletin(s) de paie restent à régler.` });
  if (head?.student_cap && Number(head.students) >= Number(head.student_cap)) out.push({ level: "warn", text: `Le plafond d'élèves de l'offre (${head.student_cap}) est atteint.` });
  const v = d.alerts?.voided_entries;
  if (v && Number(v.count) > 0) out.push({ level: "info", text: `${v.count} écriture(s) comptable(s) annulée(s) sur la période (${gnf(v.amount)}).` });
  const rank = { alert: 0, warn: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Phrases de synthèse (4 lignes maximum) : l'essentiel à lire en quelques secondes. */
export function founderSummary(d: Record<string, any>): string[] {
  const lines: string[] = [];
  const head = d.headline, fin = d.finance, rec = d.recovery;
  if (head) lines.push(`${head.students} élève(s) actif(s).`);
  if (rec) {
    const rate = recoveryRate(Number(rec.fees_expected), Number(rec.fees_collected));
    lines.push(rate === null
      ? "Aucun frais de scolarité n'est défini pour cette année."
      : `Scolarité ${rec.academic_year} : ${rate} % encaissée (${gnf(rec.fees_collected)} sur ${gnf(rec.fees_expected)}). Reste à recouvrer : ${gnf(rec.amount_due)} (${rec.students_late} élève(s), ${rec.families_late} famille(s)).`);
  }
  if (fin) {
    const r = Number(fin.result);
    lines.push(`Sur la période : recettes ${gnf(fin.revenue)}, dépenses ${gnf(fin.expense)}, ${r >= 0 ? "excédent" : "déficit"} de ${gnf(Math.abs(r))}.`);
  }
  if (head) {
    const none = !head.treasury_by_type || Object.keys(head.treasury_by_type).length === 0;
    lines.push(none ? "Aucun compte de trésorerie n'est encore créé en comptabilité." : `Trésorerie (caisses, banques, mobile money) : ${gnf(head.treasury_total)}.`);
  }
  return lines;
}
