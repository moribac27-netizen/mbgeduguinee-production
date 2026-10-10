import { describe, expect, it } from "vitest";
import { normName, pickNurseryClass } from "../src/lib/nursery-class";

const cls = [
  { id: "m1", name: "Petite Section", level: "Maternelle" },
  { id: "m2", name: "Grand Section", level: "Maternelle" },
  { id: "p1", name: "Cp", level: "Primaire" },
];
describe("section = classe", () => {
  it("normName ignore casse, accents, espaces", () => expect(normName("  Moyenne  SÉCTION")).toBe("moyenne section"));
  it("relie la classe Maternelle du même nom", () => {
    expect(pickNurseryClass({ name: "petite section", classes: cls, sections: [] })).toEqual({ action: "link", id: "m1" });
  });
  it("ne relie jamais une classe hors Maternelle du même nom", () => {
    expect(pickNurseryClass({ name: "Cp", classes: cls, sections: [] })).toEqual({ action: "create" });
  });
  it("cas « Petite Section » rattachée à « Grand Section » : relie la bonne classe", () => {
    expect(pickNurseryClass({ name: "Petite Section", classes: cls, sections: [{ id: "s1", class_id: "m2" }], sectionId: "s1", currentClassId: "m2" })).toEqual({ action: "link", id: "m1" });
  });
  it("renomme la classe actuelle si elle n'est utilisée que par cette section", () => {
    expect(pickNurseryClass({ name: "Moyenne Section", classes: cls, sections: [{ id: "s1", class_id: "m1" }], sectionId: "s1", currentClassId: "m1" })).toEqual({ action: "rename", id: "m1" });
  });
  it("ne renomme pas une classe partagée avec une autre section : en crée une", () => {
    expect(pickNurseryClass({ name: "Moyenne Section", classes: cls, sections: [{ id: "s1", class_id: "m1" }, { id: "s2", class_id: "m1" }], sectionId: "s1", currentClassId: "m1" })).toEqual({ action: "create" });
  });
  it("section sur une classe de primaire : crée une classe Maternelle", () => {
    expect(pickNurseryClass({ name: "Moyenne Section", classes: cls, sections: [{ id: "s1", class_id: "p1" }], sectionId: "s1", currentClassId: "p1" })).toEqual({ action: "create" });
  });
});
