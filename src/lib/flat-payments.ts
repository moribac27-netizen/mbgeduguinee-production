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

const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** Ouvre un reçu imprimable pour un paiement de forfait VALIDÉ (aucun reçu pour un paiement en attente ou rejeté). */
export function printFlatReceipt(p: { reference: string; period_type: string; period_month: string | null; amount: number | string; payer_reference: string; status: string; reviewed_at?: string | null; academic_year: string }, schoolName: string, offerName: string): void {
  if (p.status !== "VALIDATED" || typeof window === "undefined") return;
  const period = p.period_type === "annual" ? `Année scolaire ${p.academic_year} (paiement annuel)` : new Date(String(p.period_month) + "T00:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const amount = `${Math.round(Number(p.amount)).toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ")} GNF`;
  const w = window.open("", "_blank", "width=720,height=800");
  if (!w) return;
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Reçu ${esc(p.reference)}</title>
  <style>body{font-family:Arial,sans-serif;margin:40px;color:#0B1F3A}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin-top:20px}td{border:1px solid #cbd5e1;padding:10px}td:first-child{width:38%;background:#f1f5f9;font-weight:bold}.s{margin-top:28px;font-size:12px;color:#475569}</style></head>
  <body><h1>MBGEduGuinée — Reçu de paiement du forfait établissement</h1>
  <table><tr><td>Reçu n°</td><td>${esc(p.reference)}</td></tr><tr><td>Établissement</td><td>${esc(schoolName)}</td></tr><tr><td>Plan</td><td>${esc(offerName)}</td></tr>
  <tr><td>Période payée</td><td>${esc(period)}</td></tr><tr><td>Montant</td><td>${esc(amount)}</td></tr><tr><td>Référence du paiement</td><td>${esc(p.payer_reference)}</td></tr>
  <tr><td>Validé le</td><td>${p.reviewed_at ? esc(new Date(p.reviewed_at).toLocaleString("fr-FR")) : "—"}</td></tr></table>
  <p class="s">Paiement validé par l'administration de la plateforme MBGEduGuinée.</p><script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}
