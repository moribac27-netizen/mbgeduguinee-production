/**
 * Saisie intelligente des notes — logique pure (sans React, sans Supabase).
 *
 * Ce fichier N'ÉCRIT RIEN et NE CALCULE AUCUNE MOYENNE : les moyennes restent
 * calculées par `computeRanking` (src/lib/rankings.ts), source unique des
 * bulletins. Ici on ne fait que décrire l'avancement de la saisie :
 * ce qui est saisi, ce qui manque, ce qui semble anormal, qui traiter ensuite.
 *
 * Clé d'unicité d'une note (alignée sur le modèle existant de `grades`) :
 *   élève + matière + période + type d'évaluation + année scolaire.
 */

/* ------------------------------------------------------------------ */
/* Saisie : vide ≠ 0 ≠ absent                                          */
/* ------------------------------------------------------------------ */

export type ParsedScore =
  | { kind: "empty" }
  | { kind: "invalid"; reason: string }
  | { kind: "ok"; value: number };

/**
 * Interprète le texte d'un champ de note.
 *  - champ vide  → "empty" (JAMAIS converti en 0) ;
 *  - "0" ou "0,0" → note 0 réelle ;
 *  - virgule décimale acceptée (« 14,5 ») ;
 *  - hors barème ou illisible → "invalid" avec un motif clair.
 */
export function parseScoreInput(raw: string | number | null | undefined, maxScore: number): ParsedScore {
  if (raw == null) return { kind: "empty" };
  const text = String(raw).trim().replace(",", ".");
  if (text === "") return { kind: "empty" };
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return { kind: "invalid", reason: "Valeur non numérique." };
  const value = Number(text);
  if (!Number.isFinite(value)) return { kind: "invalid", reason: "Valeur non numérique." };
  if (value < 0) return { kind: "invalid", reason: "Une note ne peut pas être négative." };
  if (value > maxScore) return { kind: "invalid", reason: `Valeur invalide : maximum autorisé ${maxScore} (barème actuel).` };
  return { kind: "ok", value };
}

/** Changement jugé important (≥ 25 % du barème) : demande confirmation. */
export const LARGE_CHANGE_RATIO = 0.25;
export function isLargeChange(oldValue: number, newValue: number, maxScore: number): boolean {
  return Math.abs(newValue - oldValue) >= maxScore * LARGE_CHANGE_RATIO;
}

/* ------------------------------------------------------------------ */
/* Contexte et clé d'unicité                                           */
/* ------------------------------------------------------------------ */

export interface EntryContext {
  classId: string;
  /** Matières concernées (une seule en saisie intensive, plusieurs en vue classe). */
  subjectIds: string[];
  period: string;
  evaluationType: string;
  academicYear: string;
  maxScore: number;
}

export function gradeKey(g: { student_id: string; subject_id: string; period: string; evaluation_type?: string | null; academic_year?: string | null }): string {
  return [g.student_id, g.subject_id, g.period, g.evaluation_type ?? "", g.academic_year ?? ""].join("|");
}

/** Notes existantes correspondant EXACTEMENT au contexte (période, évaluation, année). */
export function gradesInContext(grades: any[], ctx: Pick<EntryContext, "period" | "evaluationType" | "academicYear">): any[] {
  return grades.filter(
    (g) =>
      g.period === ctx.period &&
      String(g.evaluation_type ?? "") === ctx.evaluationType &&
      (!g.academic_year || g.academic_year === ctx.academicYear),
  );
}

/* ------------------------------------------------------------------ */
/* Statuts de saisie optionnels (absent, non concerné…)                */
/* ------------------------------------------------------------------ */

export type MarkStatus = "absent" | "non_concerne" | "annule" | "en_attente";
export const MARK_LABELS: Record<MarkStatus, string> = {
  absent: "Absent",
  non_concerne: "Non concerné",
  annule: "Annulé",
  en_attente: "En attente",
};

/**
 * Un statut « absent / non concerné / annulé » signifie qu'AUCUNE note n'est
 * attendue : la case n'est ni manquante ni un zéro. « en attente » reste à saisir.
 */
export function statusExcusesNote(s: MarkStatus | undefined): boolean {
  return s === "absent" || s === "non_concerne" || s === "annule";
}

export const markKey = (studentId: string, subjectId: string) => `${studentId}|${subjectId}`;

/* ------------------------------------------------------------------ */
/* Cellules, anomalies                                                 */
/* ------------------------------------------------------------------ */

export type AnomalyCode =
  | "above_max"
  | "negative"
  | "duplicate"
  | "max_mismatch"
  | "note_while_absent"
  | "outlier";

export interface Anomaly {
  code: AnomalyCode;
  studentId: string;
  subjectId: string;
  message: string;
  /** Les anomalies « outlier » sont une simple recommandation de vérification. */
  severity: "error" | "warning";
}

export type CellState = "filled" | "missing" | "excused" | "anomaly";

export interface Cell {
  studentId: string;
  subjectId: string;
  state: CellState;
  grade: any | null;
  /** Toutes les lignes en base pour cette clé (>1 = doublon). */
  rows: any[];
  excusedAs?: MarkStatus;
  anomalies: Anomaly[];
}

/** Seuil de la détection statistique : écart ≥ 2,5 écarts-types, au moins 8 notes. */
export const OUTLIER_Z = 2.5;
export const OUTLIER_MIN_SAMPLE = 8;

function outlierIds(values: Array<{ id: string; v: number }>): Set<string> {
  const out = new Set<string>();
  if (values.length < OUTLIER_MIN_SAMPLE) return out;
  const mean = values.reduce((a, x) => a + x.v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, x) => a + (x.v - mean) ** 2, 0) / values.length);
  if (sd === 0) return out;
  for (const x of values) if (Math.abs(x.v - mean) / sd >= OUTLIER_Z) out.add(x.id);
  return out;
}

export interface BuildInput {
  ctx: EntryContext;
  /** Élèves de la classe (déjà privés des élèves verrouillés / non éligibles). */
  students: Array<{ id: string }>;
  /** Notes de la classe — filtrées ou non : on re-filtre sur le contexte. */
  grades: any[];
  marks?: Map<string, MarkStatus>;
}

export function buildCells({ ctx, students, grades, marks }: BuildInput): Cell[] {
  const inCtx = gradesInContext(grades, ctx);
  const byKey = new Map<string, any[]>();
  for (const g of inCtx) {
    const k = `${g.student_id}|${g.subject_id}`;
    const arr = byKey.get(k) ?? [];
    arr.push(g);
    byKey.set(k, arr);
  }

  // Détection de valeurs inhabituelles, matière par matière.
  const outliersBySubject = new Map<string, Set<string>>();
  for (const subjectId of ctx.subjectIds) {
    const vals: Array<{ id: string; v: number }> = [];
    for (const s of students) {
      const rows = byKey.get(`${s.id}|${subjectId}`);
      if (rows?.length === 1) vals.push({ id: s.id, v: Number(rows[0].score) });
    }
    outliersBySubject.set(subjectId, outlierIds(vals));
  }

  const cells: Cell[] = [];
  for (const s of students) {
    for (const subjectId of ctx.subjectIds) {
      const rows = byKey.get(`${s.id}|${subjectId}`) ?? [];
      const excusedAs = marks?.get(markKey(s.id, subjectId));
      const anomalies: Anomaly[] = [];
      const add = (code: AnomalyCode, message: string, severity: Anomaly["severity"] = "error") =>
        anomalies.push({ code, studentId: s.id, subjectId, message, severity });

      if (rows.length > 1) add("duplicate", `Note saisie ${rows.length} fois (${rows.map((r) => Number(r.score)).join(" / ")}).`);
      for (const r of rows) {
        const score = Number(r.score);
        if (score < 0) add("negative", "Note négative.");
        if (score > ctx.maxScore) add("above_max", `Note ${score} supérieure au barème (${ctx.maxScore}).`);
        if (r.max_score != null && Number(r.max_score) !== ctx.maxScore) {
          add("max_mismatch", `Barème enregistré (${Number(r.max_score)}) différent du barème de la classe (${ctx.maxScore}).`, "warning");
        }
      }
      if (rows.length && statusExcusesNote(excusedAs)) {
        add("note_while_absent", `Une note existe alors que l'élève est marqué « ${MARK_LABELS[excusedAs!]} ».`);
      }
      if (rows.length === 1 && outliersBySubject.get(subjectId)?.has(s.id)) {
        add("outlier", "Valeur inhabituelle par rapport au reste de la classe : vérification recommandée.", "warning");
      }

      let state: CellState;
      if (anomalies.length) state = "anomaly";
      else if (rows.length) state = "filled";
      else if (statusExcusesNote(excusedAs)) state = "excused";
      else state = "missing";

      cells.push({ studentId: s.id, subjectId, state, grade: rows[0] ?? null, rows, excusedAs, anomalies });
    }
  }
  return cells;
}

/* ------------------------------------------------------------------ */
/* Statut et progression par élève                                     */
/* ------------------------------------------------------------------ */

export type StudentStatus = "termine" | "en_cours" | "non_commence" | "a_verifier";

export const STATUS_LABELS: Record<StudentStatus, { label: string; icon: string }> = {
  termine: { label: "Terminé", icon: "🟢" },
  en_cours: { label: "En cours", icon: "🟠" },
  non_commence: { label: "Non commencé", icon: "⚪" },
  a_verifier: { label: "À vérifier", icon: "🔴" },
};

export interface StudentProgress {
  studentId: string;
  /** Notes attendues = matières du contexte − cases dispensées (absent…). */
  expected: number;
  filled: number;
  missing: number;
  excused: number;
  anomalies: Anomaly[];
  /** 0–100, null si rien n'est attendu. */
  percent: number | null;
  status: StudentStatus;
}

export function studentProgress(studentId: string, cells: Cell[]): StudentProgress {
  const mine = cells.filter((c) => c.studentId === studentId);
  const excused = mine.filter((c) => c.state === "excused").length;
  const expected = mine.length - excused;
  // Une case en anomalie compte comme « saisie » si une note existe (elle est à corriger, pas à compléter).
  const filled = mine.filter((c) => c.state === "filled" || (c.state === "anomaly" && c.rows.length > 0)).length;
  const missing = mine.filter((c) => c.state === "missing").length;
  const anomalies = mine.flatMap((c) => c.anomalies);
  const blocking = anomalies.filter((a) => a.severity === "error" || a.code === "outlier");

  let status: StudentStatus;
  if (blocking.length) status = "a_verifier";
  else if (expected === 0) status = "termine";
  else if (filled === 0) status = "non_commence";
  else if (missing > 0) status = "en_cours";
  else status = "termine";

  return {
    studentId,
    expected,
    filled,
    missing,
    excused,
    anomalies,
    percent: expected > 0 ? Math.round((filled / expected) * 100) : null,
    status,
  };
}

export interface ClassProgress {
  students: StudentProgress[];
  expected: number;
  filled: number;
  missing: number;
  anomalies: Anomaly[];
  percent: number | null;
  counts: Record<StudentStatus, number>;
  /** « Zéro note manquante » : tout est saisi et rien n'est à corriger. */
  complete: boolean;
}

export function classProgress(studentIds: string[], cells: Cell[]): ClassProgress {
  const students = studentIds.map((id) => studentProgress(id, cells));
  const counts: Record<StudentStatus, number> = { termine: 0, en_cours: 0, non_commence: 0, a_verifier: 0 };
  for (const s of students) counts[s.status]++;
  const expected = students.reduce((a, s) => a + s.expected, 0);
  const filled = students.reduce((a, s) => a + s.filled, 0);
  const missing = students.reduce((a, s) => a + s.missing, 0);
  const anomalies = students.flatMap((s) => s.anomalies);
  return {
    students,
    expected,
    filled,
    missing,
    anomalies,
    percent: expected > 0 ? Math.round((filled / expected) * 100) : null,
    counts,
    complete: expected > 0 && missing === 0 && counts.a_verifier === 0,
  };
}

/** Barre de progression en texte (« █████████░ 90 % »), lisible sans couleur. */
export function progressBar(percent: number | null, width = 10): string {
  if (percent == null) return "—";
  const n = Math.round((Math.min(100, Math.max(0, percent)) / 100) * width);
  return `${"█".repeat(n)}${"░".repeat(width - n)} ${percent} %`;
}

/* ------------------------------------------------------------------ */
/* Filtre « À traiter » et liste des corrections                       */
/* ------------------------------------------------------------------ */

export function needsAttention(p: StudentProgress): boolean {
  return p.missing > 0 || p.status === "a_verifier" || p.anomalies.length > 0;
}

export interface ReviewItem {
  studentId: string;
  subjectId: string;
  kind: "missing" | AnomalyCode;
  message: string;
}

/** Liste « Correction rapide » : une ligne par case à traiter, notes manquantes incluses. */
export function reviewItems(cells: Cell[]): ReviewItem[] {
  const items: ReviewItem[] = [];
  for (const c of cells) {
    if (c.state === "missing") items.push({ studentId: c.studentId, subjectId: c.subjectId, kind: "missing", message: "Note manquante" });
    for (const a of c.anomalies) items.push({ studentId: c.studentId, subjectId: c.subjectId, kind: a.code, message: a.message });
  }
  // erreurs d'abord, puis notes manquantes, puis simples recommandations
  const rank = (i: ReviewItem) => (i.kind === "missing" ? 1 : i.kind === "outlier" || i.kind === "max_mismatch" ? 2 : 0);
  return items.sort((a, b) => rank(a) - rank(b));
}

/* ------------------------------------------------------------------ */
/* Élève suivant                                                       */
/* ------------------------------------------------------------------ */

export type NextMode = "sequential" | "smart";

/**
 * Élève suivant.
 *  - "sequential" : l'élève d'après dans l'ordre de la liste (boucle à la fin).
 *  - "smart" : « prochain élève à traiter », par priorité
 *      1. notes manquantes, 2. brouillon non enregistré, 3. anomalies, 4. complets.
 *    À priorité égale, on garde l'ordre de la liste en partant de l'élève courant.
 * Retourne null s'il n'y a personne d'autre (un seul élève).
 */
export function nextStudentId(opts: {
  orderedIds: string[];
  currentId: string | null;
  progress: Map<string, StudentProgress>;
  draftIds?: Set<string>;
  mode?: NextMode;
}): string | null {
  const { orderedIds, currentId, progress, draftIds, mode = "smart" } = opts;
  if (!orderedIds.length) return null;
  const start = currentId ? orderedIds.indexOf(currentId) : -1;
  const rotated = [...orderedIds.slice(start + 1), ...orderedIds.slice(0, Math.max(start + 1, 0))].filter((id) => id !== currentId);
  if (!rotated.length) return null;
  if (mode === "sequential") return rotated[0];

  const priority = (id: string) => {
    const p = progress.get(id);
    if (p && p.missing > 0) return 1;
    if (draftIds?.has(id)) return 2;
    if (p && (p.status === "a_verifier" || p.anomalies.length)) return 3;
    return 4;
  };
  let best = rotated[0];
  let bestP = priority(best);
  for (const id of rotated) {
    const pr = priority(id);
    if (pr < bestP) {
      best = id;
      bestP = pr;
    }
  }
  return best;
}

export function previousStudentId(orderedIds: string[], currentId: string | null): string | null {
  if (!orderedIds.length) return null;
  const i = currentId ? orderedIds.indexOf(currentId) : -1;
  if (orderedIds.length === 1 && i === 0) return null;
  return orderedIds[(i <= 0 ? orderedIds.length : i) - 1];
}

/* ------------------------------------------------------------------ */
/* Enregistrement : ne transmettre que ce qui a changé                 */
/* ------------------------------------------------------------------ */

export type SaveOp =
  | { type: "insert"; studentId: string; subjectId: string; score: number }
  | { type: "update"; studentId: string; subjectId: string; id: string; score: number; previous: number; large: boolean };

export interface DraftDiff {
  ops: SaveOp[];
  invalid: Array<{ studentId: string; subjectId: string; reason: string }>;
  /** Cases laissées vides : jamais envoyées, jamais converties en 0. */
  untouched: number;
}

/**
 * Compare les valeurs saisies (texte) à ce qui est déjà enregistré.
 * Seules les cases réellement modifiées produisent une opération.
 * `drafts` : clé « élève|matière » → texte du champ (absent de la map = pas touché).
 */
export function diffDrafts(opts: {
  drafts: Map<string, string>;
  cells: Cell[];
  maxScore: number;
}): DraftDiff {
  const { drafts, cells, maxScore } = opts;
  const byKey = new Map(cells.map((c) => [markKey(c.studentId, c.subjectId), c]));
  const ops: SaveOp[] = [];
  const invalid: DraftDiff["invalid"] = [];
  let untouched = 0;

  for (const [key, raw] of drafts) {
    const cell = byKey.get(key);
    if (!cell) continue;
    const parsed = parseScoreInput(raw, maxScore);
    if (parsed.kind === "empty") {
      untouched++;
      continue;
    }
    if (parsed.kind === "invalid") {
      invalid.push({ studentId: cell.studentId, subjectId: cell.subjectId, reason: parsed.reason });
      continue;
    }
    if (cell.rows.length === 0) {
      ops.push({ type: "insert", studentId: cell.studentId, subjectId: cell.subjectId, score: parsed.value });
    } else if (cell.rows.length === 1) {
      const previous = Number(cell.rows[0].score);
      if (previous === parsed.value) continue; // inchangé : rien à envoyer
      ops.push({
        type: "update",
        studentId: cell.studentId,
        subjectId: cell.subjectId,
        id: cell.rows[0].id,
        score: parsed.value,
        previous,
        large: isLargeChange(previous, parsed.value, maxScore),
      });
    } else {
      // Doublon existant : la case doit d'abord être résolue explicitement.
      invalid.push({
        studentId: cell.studentId,
        subjectId: cell.subjectId,
        reason: "Cette note existe déjà plusieurs fois : corrigez le doublon avant de la modifier.",
      });
    }
  }
  return { ops, invalid, untouched };
}

/* ------------------------------------------------------------------ */
/* Mes travaux                                                         */
/* ------------------------------------------------------------------ */

export interface WorkItem {
  classId: string;
  subjectId: string;
  expected: number;
  filled: number;
  missing: number;
  percent: number | null;
  done: boolean;
}

/**
 * Avancement par couple classe × matière (pour « Mes travaux »).
 * `classStudents` : classId → élèves éligibles ; `grades` : toutes les notes
 * (déjà limitées par la RLS à ce que l'utilisateur peut voir).
 */
export function workItems(opts: {
  pairs: Array<{ classId: string; subjectId: string }>;
  classStudents: Map<string, Array<{ id: string }>>;
  grades: any[];
  ctx: Pick<EntryContext, "period" | "evaluationType" | "academicYear">;
}): WorkItem[] {
  const { pairs, classStudents, grades, ctx } = opts;
  const inCtx = gradesInContext(grades, ctx);
  const have = new Set(inCtx.map((g) => `${g.student_id}|${g.subject_id}`));
  return pairs.map(({ classId, subjectId }) => {
    const studs = classStudents.get(classId) ?? [];
    const expected = studs.length;
    const filled = studs.filter((s) => have.has(`${s.id}|${subjectId}`)).length;
    const missing = expected - filled;
    return {
      classId,
      subjectId,
      expected,
      filled,
      missing,
      percent: expected ? Math.round((filled / expected) * 100) : null,
      done: expected > 0 && missing === 0,
    };
  });
}
