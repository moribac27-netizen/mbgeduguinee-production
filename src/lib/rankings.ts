/**
 * Logique de calcul des moyennes et du classement — SOURCE UNIQUE.
 *
 * Extrait de BulletinDocument.tsx (qui l'utilise désormais via ce fichier)
 * pour être réutilisé par les listes générales de résultats et les
 * classements par niveau, sans dupliquer le calcul.
 *
 * Ne pas réimplémenter ce calcul ailleurs : tout nouvel écran qui a besoin
 * d'une moyenne ou d'un rang doit importer `computeRanking` d'ici.
 */

export const BULLETIN_PERIODS = [
  { v: "T1", l: "1er Trimestre" },
  { v: "T2", l: "2ème Trimestre" },
  { v: "T3", l: "3ème Trimestre" },
  { v: "S1", l: "1er Semestre" },
  { v: "S2", l: "2ème Semestre" },
  { v: "ANNUAL", l: "Année complète" },
];

export function periodLabel(period: string) {
  return BULLETIN_PERIODS.find((p) => p.v === period)?.l ?? period;
}

export function appreciation(note: number | null, max: 10 | 20 = 20): string {
  if (note == null) return "—";
  const n = max === 10 ? note * 2 : note;
  if (n >= 18) return "Excellent";
  if (n >= 16) return "Très Bien";
  if (n >= 14) return "Bien";
  if (n >= 12) return "Assez Bien";
  if (n >= 10) return "Passable";
  if (n >= 8) return "Insuffisant";
  if (n >= 5) return "Médiocre";
  return "Très faible";
}

export function decision(avg: number | null, level: string, max: 10 | 20 = 20): string {
  if (avg == null) return "—";
  const n = max === 10 ? avg * 2 : avg;
  const isExam = /terminale|3ème|3eme|cm2/i.test(level);
  if (n >= 10) return "Admis(e) en classe supérieure";
  if (n >= 8.5) return isExam ? "Autorisé(e) à composer" : "Passage conditionnel";
  if (n >= 6) return "Redoublement";
  return "Exclusion / Réorientation";
}

export function periodsFor(period: string): string[] {
  if (period === "S1") return ["T1", "T2"];
  if (period === "S2") return ["T3"];
  if (period === "ANNUAL") return ["T1", "T2", "T3"];
  return [period];
}

export interface SubjectAvg {
  subject: any;
  avg: number | null;
  appreciation: string;
}

export interface RankedStudent {
  student: any;
  perSubject: SubjectAvg[];
  avg: number | null;
  totalW: number;
  totalC: number;
  rank: number | null;
}

/**
 * Calcule, pour un ensemble d'élèves donné (une classe, un niveau entier,
 * ou plusieurs niveaux regroupés), la moyenne générale pondérée par
 * coefficient et le rang de chacun au sein de ce groupe.
 *
 * `maxScore` doit être déterminé par l'appelant via `maxScoreForLevel()`
 * (src/lib/grading.ts) — jamais recalculé ici, pour garder une seule
 * règle 10/20 dans toute l'application.
 */
export function computeRanking(
  students: any[],
  grades: any[],
  subjects: any[],
  maxScore: 10 | 20,
): RankedStudent[] {
  const computed = students
    .map((s: any) => {
      const sg = grades.filter((g: any) => g.student_id === s.id);
      let totalW = 0;
      let totalC = 0;
      const perSubject: SubjectAvg[] = subjects.map((sub: any) => {
        const gs = sg.filter((x: any) => x.subject_id === sub.id);
        const avg = gs.length ? gs.reduce((a: number, g: any) => a + Number(g.score), 0) / gs.length : null;
        if (avg != null) {
          totalW += avg * Number(sub.coefficient);
          totalC += Number(sub.coefficient);
        }
        return { subject: sub, avg, appreciation: appreciation(avg, maxScore) };
      });
      const avg = totalC > 0 ? totalW / totalC : null;
      return { student: s, perSubject, avg, totalW, totalC };
    })
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));

  return computed.map((r, i) => ({ ...r, rank: r.avg != null ? i + 1 : null }));
}
