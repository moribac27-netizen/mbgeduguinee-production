import { describe, expect, it } from "vitest";
import { assignmentErrorMessage, classesForTeacherType, isTitularType, normalizeTeacherType } from "./teacher-types";

const classes = [{ name: "PS", level: "Maternelle" }, { name: "CP1", level: "Primaire" }, { name: "6e", level: "Collège" }, { name: "X", level: null }];
describe("teacher-types", () => {
  it("normalise et reconnaît les titulaires", () => {
    expect(normalizeTeacherType("bidon")).toBe("specialise");
    expect(isTitularType("instituteur")).toBe(true);
    expect(isTitularType("educatrice")).toBe(true);
    expect(isTitularType("specialise")).toBe(false);
  });
  it("filtre les classes selon le type", () => {
    expect(classesForTeacherType("instituteur", classes).map((c) => c.name)).toEqual(["CP1"]);
    expect(classesForTeacherType("educatrice", classes).map((c) => c.name)).toEqual(["PS"]);
    expect(classesForTeacherType("specialise", classes).map((c) => c.name)).toEqual(["CP1", "6e", "X"]);
  });
  it("messages d'erreur", () => {
    expect(assignmentErrorMessage('duplicate key value violates unique constraint "tca_one_titular"')).toMatch(/titulaire/);
    expect(assignmentErrorMessage("x", "23505")).toMatch(/existe déjà/);
    expect(assignmentErrorMessage("autre")).toBe("autre");
  });
});
