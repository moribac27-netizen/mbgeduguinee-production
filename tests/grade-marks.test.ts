import { describe, expect, it } from "vitest";
import { buildCells, marksFromRows, planMarks, validatedSubjectIds, type EntryContext } from "../src/lib/grade-entry";

const ctx: EntryContext = { classId: "c1", subjectIds: ["m1", "m2"], period: "T1", evaluationType: "composition", academicYear: "2026-2027", maxScore: 20 } as any;

describe("statuts en masse", () => {
  it("un élève absent n'a ni note manquante ni zéro", () => {
    const marks = marksFromRows([{ student_id: "a", subject_id: "m1", status: "absent" }]);
    const cells = buildCells({ ctx, students: [{ id: "a" }], grades: [], marks });
    expect(cells.find((c) => c.subjectId === "m1")!.state).toBe("excused");
    expect(cells.find((c) => c.subjectId === "m2")!.state).toBe("missing");
  });
  it("« en attente » reste à saisir", () => {
    const marks = marksFromRows([{ student_id: "a", subject_id: "m1", status: "en_attente" }]);
    expect(buildCells({ ctx, students: [{ id: "a" }], grades: [], marks })[0].state).toBe("missing");
  });
  it("planMarks ne masque jamais une note existante et respecte les matières validées", () => {
    const p = planMarks({
      studentIds: ["a", "b"],
      subjectIds: ["m1", "m2"],
      cells: [{ studentId: "a", subjectId: "m1", rows: [{ score: 12 }] }],
      lockedSubjectIds: new Set(["m2"]),
    });
    expect(p.targets).toEqual([{ studentId: "b", subjectId: "m1" }]);
    expect(p.skippedWithNote).toBe(1);
    expect(p.skippedValidated).toBe(2);
  });
});

describe("validation", () => {
  const rows = [
    { class_id: "c1", subject_id: "m1", period: "T1", evaluation_type: "composition", academic_year: "2026-2027" },
    { class_id: "c1", subject_id: "m2", period: "T2", evaluation_type: "composition", academic_year: "2026-2027" },
    { class_id: "c2", subject_id: "m2", period: "T1", evaluation_type: "composition", academic_year: "2026-2027" },
  ];
  it("ne retient que le contexte courant", () => expect([...validatedSubjectIds(rows, ctx)]).toEqual(["m1"]));
});
