/** Lecture d'un relevé Orange Money (CSV, texte copié-collé ou SMS collés) : extrait référence + montant des seules lignes de réception. */

export interface StatementRow {
  ref: string;
  amount: number;
  phone?: string;
  label: string;
}

export interface StatementParseResult {
  rows: StatementRow[];
  ignored: number;
}

const REF_RE = /[A-Z]{1,4}\d{4,}\.\d{3,6}\.[A-Z0-9]{4,}/i;
const SMS_AMOUNT_RE = /de\s*:\s*([0-9][0-9.,]*)\s*GNF/i;
const GNF_AMOUNT_RE = /([0-9][0-9\s  .,]*)\s*GNF/i;
const OUT_RE = /d[ée]bit|retrait|envoi|sortie|paiement|achat|transfert\s*sortant/i;

/** « 101000.00 », « 101 000,00 », « 101,000.00 », « 101.000 » → nombre ; NaN si illisible. */
export function parseAmount(raw: string): number {
  let s = String(raw ?? "").replace(/[\s  ]/g, "").replace(/[^0-9.,-]/g, "");
  if (!s) return NaN;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    s = dec === "." ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    s = /,\d{1,2}$/.test(s) && (s.match(/,/g) ?? []).length === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot >= 0) {
    s = /\.\d{1,2}$/.test(s) && (s.match(/\./g) ?? []).length === 1 ? s : s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { out.push(cur.trim()); cur = ""; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function detectDelimiter(line: string): string {
  const counts = [";", "\t", ","].map((d) => [d, (line.match(new RegExp(d === "\t" ? "\\t" : `\\${d}`, "g")) ?? []).length] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ";";
}

export function parseStatement(text: string): StatementParseResult {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: StatementRow[] = [];
  let ignored = 0;
  if (!lines.length) return { rows, ignored };

  const delim = detectDelimiter(lines[0]);
  const first = splitCsvLine(lines[0], delim);
  const isHeader = !REF_RE.test(lines[0]) && first.length > 1 && first.some((c) => /montant|amount|r[ée]f|transaction|date|type|solde|cr[ée]dit/i.test(c));
  let iRef = -1, iAmt = -1, iPhone = -1, iType = -1;
  if (isHeader) {
    first.forEach((c, i) => {
      if (iRef < 0 && /r[ée]f|transaction|\bid\b/i.test(c)) iRef = i;
      if (iAmt < 0 && /montant|amount|cr[ée]dit|valeur/i.test(c) && !/solde|balance/i.test(c)) iAmt = i;
      if (iPhone < 0 && /t[ée]l|msisdn|exp[ée]diteur|from|de la part|contrepartie|num[ée]ro/i.test(c)) iPhone = i;
      if (iType < 0 && /^(type|sens|op[ée]ration|nature|libell)/i.test(c)) iType = i;
    });
  }

  const seen = new Set<string>();
  for (const line of isHeader ? lines.slice(1) : lines) {
    const cells = splitCsvLine(line, delim);
    const refCell = iRef >= 0 ? cells[iRef] ?? "" : "";
    const ref = (REF_RE.exec(refCell)?.[0] ?? REF_RE.exec(line)?.[0] ?? "").trim();
    let amount = NaN;
    if (iAmt >= 0) amount = parseAmount(cells[iAmt] ?? "");
    if (!Number.isFinite(amount)) {
      const m = SMS_AMOUNT_RE.exec(line) ?? GNF_AMOUNT_RE.exec(line);
      if (m) amount = parseAmount(m[1]);
    }
    const typeText = iType >= 0 ? cells[iType] ?? "" : "";
    if (!ref || !Number.isFinite(amount) || amount <= 0 || (typeText && OUT_RE.test(typeText)) || (!isHeader && /envoy|retrait|paiement de/i.test(line))) {
      ignored++;
      continue;
    }
    const key = ref.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (seen.has(key)) { ignored++; continue; }
    seen.add(key);
    const phone = (iPhone >= 0 ? /\b6\d{8}\b/.exec(cells[iPhone] ?? "")?.[0] : undefined) ?? /part du\s*(\d{8,12})/i.exec(line)?.[1] ?? /\b6\d{8}\b/.exec(line)?.[0];
    rows.push({ ref, amount, phone, label: line.slice(0, 300) });
  }
  return { rows, ignored };
}

const ERR: Record<string, string> = {
  FORBIDDEN: "Réservé au Super Admin.",
  ROWS_INVALID: "Fichier illisible.",
  ROWS_TOO_MANY: "Trop de lignes (2000 au maximum par import).",
  PROGRESSIVE_SETTING_INVALID: "Calendrier invalide : les nombres doivent être croissants, entre 1 et 12, et finir par 12 ; les dates doivent être valides.",
};

export function reconciliationErrorMessage(raw: string | undefined | null): string {
  const t = String(raw ?? "");
  for (const k of Object.keys(ERR)) if (t.includes(k)) return ERR[k];
  return "Opération impossible pour le moment.";
}

/** Valide la saisie « 1, 3, 5, 7, 9, 11, 12 » ; renvoie la liste ou null. */
export function parseScheduleInput(text: string, total = 12): number[] | null {
  const parts = String(text ?? "").split(/[\s,;]+/).filter(Boolean).map(Number);
  if (!parts.length || parts.length > 24 || parts.some((n) => !Number.isInteger(n))) return null;
  for (let i = 0; i < parts.length; i++) if (parts[i] < 1 || parts[i] > total || (i > 0 && parts[i] <= parts[i - 1])) return null;
  return parts[parts.length - 1] === total ? parts : null;
}
