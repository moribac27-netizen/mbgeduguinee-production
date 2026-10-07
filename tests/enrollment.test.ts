import { describe, expect, it } from "vitest";
import {
  buildSummary,
  emptyForm,
  findDuplicates,
  generateMatricule,
  hasBlocking,
  isUniqueViolation,
  nameKey,
  nextForm,
  phoneKey,
  searchStudents,
  stepErrors,
  suggestParents,
  toStudentRow,
  validateForm,
  type EnrollmentForm,
  type KnownStudent,
} from "../src/lib/enrollment";

const ok = (o: Partial<EnrollmentForm> = {}): EnrollmentForm => ({
  ...emptyForm("EDG-AAAA1111"),
  full_name: "Amadou Condé",
  gender: "M",
  class_id: "c1",
  ...o,
});

const known: KnownStudent[] = [
  { id: "1", matricule: "EDG-0001", full_name: "Mariama Diallo", birth_date: "2015-04-02", parent_name: "Oumar Diallo", parent_phone: "+224 628 49 98 12" },
  { id: "2", matricule: "EDG-0002", full_name: "Ibrahima Diallo", birth_date: "2013-01-10", parent_name: "Oumar Diallo", parent_phone: "628499812" },
  { id: "3", matricule: "EDG-0003", full_name: "Fatoumata Bah", birth_date: null },
];

describe("validation", () => {
  it("accepte un formulaire complet", () => expect(validateForm(ok())).toEqual({}));
  it("signale les champs obligatoires manquants", () => {
    const e = validateForm(emptyForm(""));
    expect(Object.keys(e).sort()).toEqual(["class_id", "full_name", "gender", "matricule"]);
  });
  it("exige prénom et nom", () => expect(validateForm(ok({ full_name: "Amadou" })).full_name).toBeTruthy());
  it("refuse une naissance dans le futur", () => expect(validateForm(ok({ birth_date: "2999-01-01" })).birth_date).toBeTruthy());
  it("refuse un matricule avec espace et un téléphone trop court", () => {
    expect(validateForm(ok({ matricule: "A B" })).matricule).toBeTruthy();
    expect(validateForm(ok({ parent_phone: "123" })).parent_phone).toBeTruthy();
  });
  it("stepErrors ne renvoie que l'étape demandée", () => {
    const f = ok({ full_name: "", class_id: "" });
    expect(Object.keys(stepErrors(1, f))).toEqual(["full_name"]);
    expect(Object.keys(stepErrors(2, f))).toEqual(["class_id"]);
  });
});

describe("doublons", () => {
  it("matricule identique = bloquant, insensible à la casse", () => {
    const m = findDuplicates(ok({ matricule: "edg-0001" }), known);
    expect(hasBlocking(m)).toBe(true);
    expect(m[0].student.id).toBe("1");
  });
  it("même nom (ordre inversé, accents) + même naissance = probable", () => {
    const m = findDuplicates(ok({ full_name: "DIALLO mariama", birth_date: "2015-04-02" }), known);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ kind: "identity", blocking: false });
  });
  it("homonymes de naissance différente ne sont pas signalés", () => {
    expect(findDuplicates(ok({ full_name: "Mariama Diallo", birth_date: "2010-01-01" }), known)).toEqual([]);
  });
  it("même nom sans date comparable = possible", () => {
    const m = findDuplicates(ok({ full_name: "Fatoumata BAH", birth_date: "2014-05-05" }), known);
    expect(m[0].kind).toBe("name");
  });
  it("aucun doublon pour un nouvel élève", () => expect(findDuplicates(ok(), known)).toEqual([]));
  it("nameKey / phoneKey", () => {
    expect(nameKey("Amadou  CONDÉ")).toBe(nameKey("conde amadou"));
    expect(phoneKey("+224 628-49-98-12")).toBe("628499812");
  });
});

describe("« Inscrire un autre élève »", () => {
  it("garde la classe, vide l'identité ET le responsable", () => {
    const n = nextForm(ok({ parent_name: "X", parent_phone: "628499812", birth_date: "2015-01-01" }), "EDG-NEW00000");
    expect(n.class_id).toBe("c1");
    expect(n.matricule).toBe("EDG-NEW00000");
    expect([n.full_name, n.gender, n.birth_date, n.parent_name, n.parent_phone]).toEqual(["", "", "", "", ""]);
  });
});

describe("recherche et responsables", () => {
  it("recherche par nom partiel / matricule", () => {
    expect(searchStudents(known, "dial")).toHaveLength(2);
    expect(searchStudents(known, "edg-0003")[0].id).toBe("3");
    expect(searchStudents(known, "d")).toEqual([]);
  });
  it("regroupe un responsable ayant plusieurs enfants (même téléphone, formats différents)", () => {
    const r = suggestParents(known, "oumar");
    expect(r).toHaveLength(1);
    expect(r[0].children).toBe(2);
    expect(suggestParents(known, "628 49")).toHaveLength(1);
  });
});

describe("enregistrement", () => {
  it("toStudentRow normalise et n'invente rien", () => {
    const r = toStudentRow(ok({ full_name: "  Amadou   Condé ", address: "  ", parent_phone: "" }));
    expect(r).toMatchObject({ full_name: "Amadou Condé", address: null, parent_phone: null, birth_date: null, status: "actif", class_id: "c1" });
    expect(r).not.toHaveProperty("school_id");
  });
  it("résumé", () => {
    const s = buildSummary(ok(), { academicYear: "2026-2027", className: "6ème A", level: "Collège" });
    expect(s.lines.map((l) => l.label)).toEqual(["Élève", "Matricule", "Sexe", "Né(e) le", "Année scolaire", "Niveau", "Classe"]);
  });
  it("matricule au format existant et détection d'unicité", () => {
    expect(generateMatricule()).toMatch(/^EDG-[0-9A-F]{8}$/);
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ message: "autre" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
