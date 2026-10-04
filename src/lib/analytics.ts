/**
 * Analyse scolaire à trois niveaux : élève, classe, niveau.
 *
 * Ce fichier NE recalcule JAMAIS une moyenne. Toute moyenne passe par
 * `computeRanking` de ./rankings (source unique, la même que les bulletins).
 * Ici on ne fait que filtrer les notes, appeler computeRanking, puis
 * agréger (médiane, taux de réussite, progression...).
 *
 * `maxScore` (10 ou 20) doit venir de `maxScoreForLevel()` (src/lib/grading.ts).
 */
import { computeRanking, periodsFor, type RankedStudent } from "./rankings";

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

export const round2 = (n: number | null | undefined): number | null =>
  n == null || Number.isNaN(n) ? null : Math.round(n * 100) / 100;

function mean(a: number[]): number | null {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
}

function median(a: number[]): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Seuil de réussite : la moitié du barème (10/20 ou 5/10). */
export const passThreshold = (maxScore: 10 | 20) => maxScore / 2;

export type Trend = "hausse" | "stable" | "baisse" | null;

export function trendOf(values: Array<number | null>, tolerance = 0.1) {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return { trend: null as Trend, delta: null as number | null };
  const delta = v[v.length - 1] - v[v.length - 2];
  const trend: Trend = delta > tolerance ? "hausse" : delta < -tolerance ? "baisse" : "stable";
  return { trend, delta: round2(delta) };
}

/**
 * Clé de regroupement par niveau scolaire à partir du nom de la classe.
 * "10e A" et "10e B" -> "10e" ; "10e Année" -> "10e" ; "Tle" -> "tle".
 * (La colonne classes.level contient seulement le cycle : Primaire/Collège/Lycée.)
 */
export function gradeKey(className: string): string {
  return (className ?? "")
    .replace(/\s+ann[ée]e/i, "")
    .trim()
    .replace(/[\s-]+[A-Za-z]$/, "")
    .trim()
    .toLowerCase();
}

/** Taux de présence en % : tout statut contenant "absent" compte comme absence. */
export function attendanceRate(rows: any[]): number | null {
  if (!rows.length) return null;
  const absent = rows.filter((r) => /absent/i.test(String(r.status ?? ""))).length;
  return round2((1 - absent / rows.length) * 100);
}

/* ------------------------------------------------------------------ */
/* Filtres                                                             */
/* ------------------------------------------------------------------ */

export interface AnalysisFilters {
  academicYear?: string | null;
  period?: string | null; // T1, T2, T3, S1, S2, ANNUAL
  evaluationType?: string | null; // ex. "composition"
  subjectId?: string | null;
}

export function filterGrades(grades: any[], f: AnalysisFilters = {}): any[] {
  const periods = f.period ? periodsFor(f.period) : null;
  return grades.filter(
    (g) =>
      (!f.academicYear || g.academic_year === f.academicYear) &&
      (!periods || periods.includes(g.period)) &&
      (!f.evaluationType || g.evaluation_type === f.evaluationType) &&
      (!f.subjectId || g.subject_id === f.subjectId),
  );
}

const BASE_PERIODS = ["T1", "T2", "T3"];

/** Périodes (T1, T2, T3) pour lesquelles il existe réellement des notes. */
export function availablePeriods(grades: any[], f: AnalysisFilters = {}): string[] {
  const present = new Set(filterGrades(grades, { ...f, period: null }).map((g) => g.period));
  return BASE_PERIODS.filter((p) => present.has(p));
}

/** Types d'évaluation réellement présents (pour alimenter le filtre). */
export function availableEvaluationTypes(grades: any[], f: AnalysisFilters = {}): string[] {
  const set = new Set(
    filterGrades(grades, { ...f, evaluationType: null })
      .map((g) => g.evaluation_type)
      .filter(Boolean),
  );
  return [...set].sort();
}

function subjectsFor(subjects: any[], f: AnalysisFilters) {
  return f.subjectId ? subjects.filter((s) => s.id === f.subjectId) : subjects;
}

/* ------------------------------------------------------------------ */
/* Progression (classe ou niveau)                                      */
/* ------------------------------------------------------------------ */

export interface ProgressPoint {
  period: string;
  average: number | null;
  graded: number;
}

export function groupProgression(
  students: any[],
  grades: any[],
  subjects: any[],
  maxScore: 10 | 20,
  f: AnalysisFilters = {},
): { points: ProgressPoint[]; trend: Trend; delta: number | null } {
  const subs = subjectsFor(subjects, f);
  const points = availablePeriods(grades, f).map((period) => {
    const ranked = computeRanking(students, filterGrades(grades, { ...f, period }), subs, maxScore);
    const avgs = ranked.map((r) => r.avg).filter((a): a is number => a != null);
    return { period, average: round2(mean(avgs)), graded: avgs.length };
  });
  return { points, ...trendOf(points.map((p) => p.average)) };
}

/* ------------------------------------------------------------------ */
/* Niveau CLASSE                                                       */
/* ------------------------------------------------------------------ */

export interface SubjectStat {
  subject: any;
  average: number | null;
  best: number | null;
  lowest: number | null;
  passRate: number | null; // %
  graded: number;
}

export interface GroupStats {
  effectif: number;
  graded: number;
  ranked: RankedStudent[];
  average: number | null;
  best: number | null;
  lowest: number | null;
  median: number | null;
  passCount: number;
  failCount: number;
  passRate: number | null; // %
  subjects: SubjectStat[];
  progression: ProgressPoint[];
  trend: Trend;
  deltaVsPrevious: number | null;
}

export function groupStats(
  students: any[],
  grades: any[],
  subjects: any[],
  maxScore: 10 | 20,
  f: AnalysisFilters = {},
): GroupStats {
  const subs = subjectsFor(subjects, f);
  const ranked = computeRanking(students, filterGrades(grades, f), subs, maxScore);
  const avgs = ranked.map((r) => r.avg).filter((a): a is number => a != null);
  const th = passThreshold(maxScore);
  const passCount = avgs.filter((a) => a >= th).length;

  const subjectStats: SubjectStat[] = subs.map((sub: any) => {
    const vals = ranked
      .map((r) => r.perSubject.find((p) => p.subject.id === sub.id)?.avg ?? null)
      .filter((a): a is number => a != null);
    return {
      subject: sub,
      average: round2(mean(vals)),
      best: vals.length ? round2(Math.max(...vals)) : null,
      lowest: vals.length ? round2(Math.min(...vals)) : null,
      passRate: vals.length ? round2((vals.filter((v) => v >= th).length / vals.length) * 100) : null,
      graded: vals.length,
    };
  });

  // La progression ignore le filtre de période : on veut toutes les périodes.
  const prog = groupProgression(students, grades, subjects, maxScore, { ...f, period: null });

  return {
    effectif: students.length,
    graded: avgs.length,
    ranked,
    average: round2(mean(avgs)),
    best: avgs.length ? round2(Math.max(...avgs)) : null,
    lowest: avgs.length ? round2(Math.min(...avgs)) : null,
    median: round2(median(avgs)),
    passCount,
    failCount: avgs.length - passCount,
    passRate: avgs.length ? round2((passCount / avgs.length) * 100) : null,
    subjects: subjectStats,
    progression: prog.points,
    trend: prog.trend,
    deltaVsPrevious: prog.delta,
  };
}

/* ------------------------------------------------------------------ */
/* Niveau SCOLAIRE (plusieurs classes)                                 */
/* ------------------------------------------------------------------ */

export interface ClassSummary {
  classId: string;
  name: string;
  effectif: number;
  average: number | null;
  passRate: number | null;
  stats: GroupStats;
}

export interface LevelStats {
  effectifTotal: number;
  overall: GroupStats; // toutes les classes du niveau regroupées
  classes: ClassSummary[]; // triées par moyenne décroissante
  bestClass: ClassSummary | null;
  needsSupportClass: ClassSummary | null; // seulement si 2 classes ou plus
}

export function levelStats(
  classes: Array<{ id: string; name: string }>,
  students: any[], // chaque élève porte class_id
  grades: any[],
  subjects: any[],
  maxScore: 10 | 20,
  f: AnalysisFilters = {},
): LevelStats {
  const summaries: ClassSummary[] = classes.map((c) => {
    const stats = groupStats(
      students.filter((s) => s.class_id === c.id),
      grades,
      subjects,
      maxScore,
      f,
    );
    return { classId: c.id, name: c.name, effectif: stats.effectif, average: stats.average, passRate: stats.passRate, stats };
  });

  const sorted = [...summaries].sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  const withAvg = sorted.filter((c) => c.average != null);
  const classIds = new Set(classes.map((c) => c.id));
  const levelStudents = students.filter((s) => classIds.has(s.class_id));

  return {
    effectifTotal: levelStudents.length,
    overall: groupStats(levelStudents, grades, subjects, maxScore, f),
    classes: sorted,
    bestClass: withAvg[0] ?? null,
    needsSupportClass: withAvg.length > 1 ? withAvg[withAvg.length - 1] : null,
  };
}

/* ------------------------------------------------------------------ */
/* Niveau ÉLÈVE                                                        */
/* ------------------------------------------------------------------ */

export interface StudentSynthesis {
  student: any;
  periods: Array<{ period: string; average: number | null; rank: number | null }>;
  currentAverage: number | null;
  currentRank: number | null;
  bestAverage: number | null;
  trend: Trend;
  delta: number | null;
  subjects: Array<{
    subject: any;
    current: number | null;
    evolution: Array<{ period: string; avg: number | null }>;
  }>;
  strengths: any[]; // jusqu'à 3 matières (nom + moyenne)
  attention: any[]; // jusqu'à 3 matières sous le seuil
}

export function studentSynthesis(
  studentId: string,
  classStudents: any[], // tous les élèves de la classe (pour le rang)
  grades: any[],
  subjects: any[],
  maxScore: 10 | 20,
  f: AnalysisFilters = {},
): StudentSynthesis | null {
  const student = classStudents.find((s) => s.id === studentId);
  if (!student) return null;
  const subs = subjectsFor(subjects, f);
  const th = passThreshold(maxScore);

  const perPeriod = availablePeriods(grades, f).map((period) => {
    const ranked = computeRanking(classStudents, filterGrades(grades, { ...f, period }), subs, maxScore);
    return { period, row: ranked.find((r) => r.student.id === studentId) };
  });

  const periods = perPeriod.map(({ period, row }) => ({
    period,
    average: round2(row?.avg ?? null),
    rank: row?.rank ?? null,
  }));
  const withAvg = periods.filter((p) => p.average != null);
  const last = withAvg[withAvg.length - 1];

  const subjectRows = subs.map((sub: any) => {
    const evolution = perPeriod.map(({ period, row }) => ({
      period,
      avg: round2(row?.perSubject.find((p) => p.subject.id === sub.id)?.avg ?? null),
    }));
    const known = evolution.filter((e) => e.avg != null);
    return { subject: sub, current: known.length ? known[known.length - 1].avg : null, evolution };
  });

  const scored = subjectRows.filter((s) => s.current != null);
  return {
    student,
    periods,
    currentAverage: last?.average ?? null,
    currentRank: last?.rank ?? null,
    bestAverage: withAvg.length ? Math.max(...withAvg.map((p) => p.average as number)) : null,
    ...trendOf(periods.map((p) => p.average)),
    subjects: subjectRows,
    strengths: [...scored].filter((s) => (s.current as number) >= th).sort((a, b) => (b.current as number) - (a.current as number)).slice(0, 3),
    attention: [...scored].filter((s) => (s.current as number) < th).sort((a, b) => (a.current as number) - (b.current as number)).slice(0, 3),
  };
}
