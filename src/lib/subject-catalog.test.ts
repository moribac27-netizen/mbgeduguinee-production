import { describe, expect, test } from "bun:test";
import { missingSubjects, PRIMARY_SUBJECTS } from "./subject-catalog";

describe("missingSubjects", () => {
  test("tout est manquant sur une école vide", () => {
    expect(missingSubjects(PRIMARY_SUBJECTS, []).length).toBe(PRIMARY_SUBJECTS.length);
  });
  test("ignore accents et casse", () => {
    const left = missingSubjects(PRIMARY_SUBJECTS, [{ name: "FRANCAIS" }, { name: "mathématiques" }]);
    expect(left.length).toBe(PRIMARY_SUBJECTS.length - 2);
    expect(left.some((s) => s.name === "Français")).toBe(false);
  });
});
