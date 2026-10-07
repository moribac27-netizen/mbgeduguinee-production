import { describe, expect, it } from "vitest";
import {
  buildCells,
  classProgress,
  diffDrafts,
  gradeKey,
  isLargeChange,
  markKey,
  needsAttention,
  nextStudentId,
  parseScoreInput,
  previousStudentId,
  progressBar,
  reviewItems,
  studentProgress,
  workItems,
  type EntryContext,
  type MarkStatus,
} from "@/lib/grade-entry";

const ctx: EntryContext = {
  classId: "c1",
  subjectIds: ["math"],
  period: "T1",
  evaluationType: "composition",
  academicYear: "2026-2027",
  maxScore: 20,
};

const students = ["a", "b", "c", "d"].map((id) => ({ id }));
let n = 0;
const g = (student_id: string, score: number, extra: Record<string, any> = {}) => ({
  id: `g${++n}`,
  student_id,
  subject_id: "math",
  period: "T1",
  evaluation_type: "composition",
  academic_year: "2026-2027",
  score,
  max_score: 20,
  ...extra,
});

describe("saisie : vide ≠ 0", () => {
  it("un champ vide n'est jamais un zéro", () => {
    expect(parseScoreInput("", 20)).toEqual({ kind: "empty" });
    expect(parseScoreInput("   ", 20)).toEqual({ kind: "empty" });
    expect(parseScoreInput(null, 20)).toEqual({ kind: "empty" });
  });

  it("un zéro réel est une note", () => {
    expect(parseScoreInput("0", 20)).toEqual({ kind: "ok", value: 0 });
    expect(parseScoreInput(0, 20)).toEqual({ kind: "ok", value: 0 });
    expect(parseScoreInput("0,0", 20)).toEqual({ kind: "ok", value: 0 });
  });

  it("accepte la virgule décimale", () => {
    expect(parseScoreInput("14,5", 20)).toEqual({ kind: "ok", value: 14.5 });
  });

  it("refuse hors barème, négatif et texte — selon le barème donné", () => {
    expect(parseScoreInput("25", 20).kind).toBe("invalid");
    expect(parseScoreInput("11", 10).kind).toBe("invalid"); // primaire /10
    expect(parseScoreInput("10", 10).kind).toBe("ok");
    expect(parseScoreInput("-1", 20).kind).toBe("invalid");
    expect(parseScoreInput("abc", 20).kind).toBe("invalid");
    expect(parseScoreInput("1e3", 20).kind).toBe("invalid");
  });

  it("modification importante = au moins 25 % du barème", () => {
    expect(isLargeChange(10, 16, 20)).toBe(true);
    expect(isLargeChange(10, 12, 20)).toBe(false);
    expect(isLargeChange(5, 8, 10)).toBe(true);
  });
});

describe("cellules et statuts", () => {
  const grades = [g("a", 15), g("b", 12)];
  const cells = buildCells({ ctx, students, grades });

  it("distingue saisi et manquant", () => {
    expect(cells.find((c) => c.studentId === "a")!.state).toBe("filled");
    expect(cells.find((c) => c.studentId === "c")!.state).toBe("missing");
  });

  it("ignore les notes d'une autre période, évaluation ou année", () => {
    const other = [g("c", 9, { period: "T2" }), g("d", 9, { evaluation_type: "devoir" }), g("a", 9, { academic_year: "2025-2026" })];
    const c = buildCells({ ctx, students, grades: [...grades, ...other] });
    expect(c.find((x) => x.studentId === "c")!.state).toBe("missing");
    expect(c.find((x) => x.studentId === "d")!.state).toBe("missing");
    expect(c.find((x) => x.studentId === "a")!.rows).toHaveLength(1);
  });

  it("statuts élèves : terminé / non commencé", () => {
    expect(studentProgress("a", cells).status).toBe("termine");
    expect(studentProgress("c", cells).status).toBe("non_commence");
  });

  it("en cours = une partie des matières saisie", () => {
    const two = { ...ctx, subjectIds: ["math", "fr"] };
    const cs = buildCells({ ctx: two, students, grades: [g("a", 10)] });
    const p = studentProgress("a", cs);
    expect(p.expected).toBe(2);
    expect(p.filled).toBe(1);
    expect(p.missing).toBe(1);
    expect(p.percent).toBe(50);
    expect(p.status).toBe("en_cours");
  });

  it("progression de classe et barre de progression", () => {
    const cp = classProgress(students.map((s) => s.id), cells);
    expect(cp.expected).toBe(4);
    expect(cp.filled).toBe(2);
    expect(cp.missing).toBe(2);
    expect(cp.percent).toBe(50);
    expect(cp.complete).toBe(false);
    expect(progressBar(90)).toBe("█████████░ 90 %");
    expect(progressBar(null)).toBe("—");
  });

  it("« zéro note manquante » seulement si tout est saisi et sans anomalie", () => {
    const full = buildCells({ ctx, students, grades: students.map((s) => g(s.id, 12)) });
    expect(classProgress(students.map((s) => s.id), full).complete).toBe(true);
    const withDup = buildCells({ ctx, students, grades: [...students.map((s) => g(s.id, 12)), g("a", 13)] });
    expect(classProgress(students.map((s) => s.id), withDup).complete).toBe(false);
  });
});

describe("anomalies — uniquement sur règles existantes", () => {
  it("détecte un doublon existant et le signale « à vérifier »", () => {
    const cells = buildCells({ ctx, students, grades: [g("a", 20), g("a", 19)] });
    const a = cells.find((c) => c.studentId === "a")!;
    expect(a.state).toBe("anomaly");
    expect(a.anomalies[0].code).toBe("duplicate");
    expect(studentProgress("a", cells).status).toBe("a_verifier");
  });

  it("détecte note au-dessus du barème et note négative déjà en base", () => {
    const cells = buildCells({ ctx, students, grades: [g("a", 25, { max_score: 25 }), g("b", -2)] });
    expect(cells.find((c) => c.studentId === "a")!.anomalies.map((x) => x.code)).toContain("above_max");
    expect(cells.find((c) => c.studentId === "b")!.anomalies.map((x) => x.code)).toContain("negative");
  });

  it("signale un barème enregistré différent de celui de la classe (avertissement)", () => {
    const cells = buildCells({ ctx, students, grades: [g("a", 8, { max_score: 10 })] });
    const an = cells.find((c) => c.studentId === "a")!.anomalies;
    expect(an[0]).toMatchObject({ code: "max_mismatch", severity: "warning" });
  });

  it("note saisie alors que l'élève est marqué absent", () => {
    const marks = new Map<string, MarkStatus>([[markKey("a", "math"), "absent"]]);
    const cells = buildCells({ ctx, students, grades: [g("a", 12)], marks });
    expect(cells.find((c) => c.studentId === "a")!.anomalies[0].code).toBe("note_while_absent");
  });

  it("un élève absent n'a ni note manquante ni zéro attendu", () => {
    const marks = new Map<string, MarkStatus>([[markKey("c", "math"), "absent"]]);
    const cells = buildCells({ ctx, students, grades: [], marks });
    const c = cells.find((x) => x.studentId === "c")!;
    expect(c.state).toBe("excused");
    const p = studentProgress("c", cells);
    expect(p.expected).toBe(0);
    expect(p.missing).toBe(0);
  });

  it("« en attente » reste une note à saisir", () => {
    const marks = new Map<string, MarkStatus>([[markKey("c", "math"), "en_attente"]]);
    const cells = buildCells({ ctx, students, grades: [], marks });
    expect(cells.find((x) => x.studentId === "c")!.state).toBe("missing");
  });

  it("valeur inhabituelle : seulement avec assez de notes", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}` }));
    const base = many.map((s, i) => g(s.id, i === 9 ? 1 : 14 + (i % 2)));
    const cells = buildCells({ ctx, students: many, grades: base });
    const odd = cells.find((c) => c.studentId === "s9")!;
    expect(odd.anomalies.some((x) => x.code === "outlier" && x.severity === "warning")).toBe(true);
    // petit échantillon : jamais d'alerte statistique
    const small = buildCells({ ctx, students, grades: [g("a", 14), g("b", 14), g("c", 1)] });
    expect(small.flatMap((c) => c.anomalies)).toHaveLength(0);
  });
});

describe("filtre « À traiter » et correction rapide", () => {
  const cells = buildCells({ ctx, students, grades: [g("a", 20), g("a", 19), g("b", 12)] });
  const progress = students.map((s) => studentProgress(s.id, cells));

  it("ne garde que les élèves incomplets ou en anomalie", () => {
    expect(progress.filter(needsAttention).map((p) => p.studentId)).toEqual(["a", "c", "d"]);
  });

  it("liste de correction : erreurs d'abord, puis notes manquantes", () => {
    const items = reviewItems(cells);
    expect(items[0]).toMatchObject({ studentId: "a", kind: "duplicate" });
    expect(items.filter((i) => i.kind === "missing").map((i) => i.studentId)).toEqual(["c", "d"]);
  });
});

describe("élève suivant", () => {
  const cells = buildCells({ ctx, students, grades: [g("a", 12), g("b", 12), g("d", 11)] }); // c manque
  const map = new Map(students.map((s) => [s.id, studentProgress(s.id, cells)]));
  const ids = students.map((s) => s.id);

  it("mode séquentiel : suivant dans la liste, avec retour au début", () => {
    expect(nextStudentId({ orderedIds: ids, currentId: "a", progress: map, mode: "sequential" })).toBe("b");
    expect(nextStudentId({ orderedIds: ids, currentId: "d", progress: map, mode: "sequential" })).toBe("a");
  });

  it("mode intelligent : va droit à l'élève qui a des notes manquantes", () => {
    expect(nextStudentId({ orderedIds: ids, currentId: "a", progress: map, mode: "smart" })).toBe("c");
  });

  it("à égalité, garde l'ordre de la liste en partant de l'élève courant", () => {
    const two = buildCells({ ctx, students, grades: [g("a", 12)] }); // b, c, d manquent
    const m = new Map(students.map((s) => [s.id, studentProgress(s.id, two)]));
    expect(nextStudentId({ orderedIds: ids, currentId: "b", progress: m })).toBe("c");
  });

  it("priorité : manquantes, puis brouillon, puis anomalies, puis complets", () => {
    const all = buildCells({ ctx, students, grades: [g("a", 12), g("b", 12), g("b", 13), g("c", 12), g("d", 12)] });
    const m = new Map(students.map((s) => [s.id, studentProgress(s.id, all)]));
    // plus personne de manquant : le brouillon de d passe avant l'anomalie de b
    expect(nextStudentId({ orderedIds: ids, currentId: "a", progress: m, draftIds: new Set(["d"]) })).toBe("d");
    expect(nextStudentId({ orderedIds: ids, currentId: "a", progress: m })).toBe("b");
  });

  it("un seul élève : pas de suivant", () => {
    expect(nextStudentId({ orderedIds: ["a"], currentId: "a", progress: map })).toBeNull();
    expect(previousStudentId(["a"], "a")).toBeNull();
  });

  it("élève précédent, avec retour à la fin", () => {
    expect(previousStudentId(ids, "b")).toBe("a");
    expect(previousStudentId(ids, "a")).toBe("d");
  });
});

describe("enregistrement : seulement ce qui a changé", () => {
  const cells = buildCells({ ctx, students, grades: [g("a", 15), g("b", 12), g("d", 8), g("d", 9)] });
  const diff = (entries: Array<[string, string]>) =>
    diffDrafts({ drafts: new Map(entries.map(([s, v]) => [markKey(s, "math"), v])), cells, maxScore: 20 });

  it("nouvelle note = insertion ; zéro réel inclus", () => {
    const d = diff([["c", "0"]]);
    expect(d.ops).toEqual([{ type: "insert", studentId: "c", subjectId: "math", score: 0 }]);
  });

  it("case vide : rien envoyé, jamais de zéro", () => {
    const d = diff([["c", ""]]);
    expect(d.ops).toHaveLength(0);
    expect(d.untouched).toBe(1);
  });

  it("valeur inchangée : aucune requête", () => {
    expect(diff([["a", "15"], ["b", "12,0"]]).ops).toHaveLength(0);
  });

  it("modification = mise à jour avec ancienne valeur et alerte si changement important", () => {
    const d = diff([["a", "5"]]);
    expect(d.ops[0]).toMatchObject({ type: "update", previous: 15, score: 5, large: true });
    expect(diff([["a", "16"]]).ops[0]).toMatchObject({ large: false });
  });

  it("valeurs invalides rejetées avec motif, sans bloquer les autres", () => {
    const d = diff([["c", "25"], ["a", "16"]]);
    expect(d.invalid).toHaveLength(1);
    expect(d.ops).toHaveLength(1);
  });

  it("refuse de modifier une note déjà en doublon sans résolution explicite", () => {
    const d = diff([["d", "10"]]);
    expect(d.ops).toHaveLength(0);
    expect(d.invalid[0].reason).toMatch(/plusieurs fois/);
  });
});

describe("clé d'unicité et mes travaux", () => {
  it("la clé combine élève, matière, période, évaluation, année", () => {
    expect(gradeKey(g("a", 10))).toBe("a|math|T1|composition|2026-2027");
  });

  it("avancement par classe × matière", () => {
    const grades = [g("a", 10), g("b", 11)];
    const items = workItems({
      pairs: [{ classId: "c1", subjectId: "math" }, { classId: "c2", subjectId: "math" }],
      classStudents: new Map([["c1", students], ["c2", [{ id: "x" }]]]),
      grades,
      ctx,
    });
    expect(items[0]).toMatchObject({ expected: 4, filled: 2, missing: 2, percent: 50, done: false });
    expect(items[1]).toMatchObject({ expected: 1, filled: 0, done: false });
  });
});
