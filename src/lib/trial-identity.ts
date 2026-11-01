/** Identités de contact servant à limiter l'essai gratuit : un seul essai par e-mail et par numéro de téléphone. */

/** E-mail normalisé : minuscules, sans « +alias » ; pour Gmail, points ignorés. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  const at = s.lastIndexOf("@");
  if (at < 1 || at === s.length - 1) return null;
  let local = s.slice(0, at);
  let domain = s.slice(at + 1);
  local = local.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return local ? `${local}@${domain}` : null;
}

/** Téléphone normalisé : chiffres seulement, indicatif Guinée (224 / 00224) retiré ; nul si moins de 8 chiffres. */
export function normalizePhone(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00224")) d = d.slice(5);
  else if (d.startsWith("224") && d.length > 9) d = d.slice(3);
  return d.length >= 8 ? d : null;
}

export interface TrialIdentity { kind: "email" | "phone"; value: string }

/** Identités distinctes à réserver pour une inscription (e-mail, téléphone du compte, téléphone de l'école). */
export function trialIdentities(input: { email?: string | null; phone?: string | null; schoolPhone?: string | null }): TrialIdentity[] {
  const out: TrialIdentity[] = [];
  const add = (kind: "email" | "phone", value: string | null) => {
    if (value && !out.some((o) => o.kind === kind && o.value === value)) out.push({ kind, value });
  };
  add("email", normalizeEmail(input.email));
  add("phone", normalizePhone(input.phone));
  add("phone", normalizePhone(input.schoolPhone));
  return out;
}
