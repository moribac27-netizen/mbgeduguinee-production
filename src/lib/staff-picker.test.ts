import { describe, expect, it } from "vitest";
import { buildStaffOptions, suggestRoleFromPosition } from "./staff-picker";

describe("suggestRoleFromPosition", () => {
  it("déduit le rôle de l'intitulé", () => {
    expect(suggestRoleFromPosition("Comptable")).toBe("comptable");
    expect(suggestRoleFromPosition("Surveillant général")).toBe("surveillant");
    expect(suggestRoleFromPosition("Bibliothécaire")).toBe("bibliothecaire");
    expect(suggestRoleFromPosition("Infirmière")).toBe("infirmerie");
    expect(suggestRoleFromPosition("Chauffeur")).toBe("responsable_transport");
    expect(suggestRoleFromPosition("Directeur des études")).toBe("directeur_etudes");
    expect(suggestRoleFromPosition("Gardien")).toBe("secretariat");
    expect(suggestRoleFromPosition(null)).toBe("secretariat");
  });
});

describe("buildStaffOptions", () => {
  const teachers = [
    { id: "t1", full_name: "Mariama Diallo", email: "m@x.com", phone: "620", user_id: null, teacher_type: "educatrice" },
    { id: "t2", full_name: "Ousmane Bah", user_id: "u1", teacher_type: "instituteur" },
    { id: "t3", full_name: "Aly Camara", user_id: null, teacher_type: "instituteur" },
  ];
  const contracts = [
    { id: "c1", teacher_id: "t1", full_name: "Mariama Diallo", position: "Éducatrice" },
    { id: "c2", teacher_id: null, full_name: "Fatou Sylla", position: "Comptable" },
    { id: "c3", teacher_id: null, full_name: "Aly Camara", position: "Enseignant" },
  ];
  it("exclut ceux qui ont déjà un compte et les doublons", () => {
    const o = buildStaffOptions(teachers, contracts, ["Ousmane Bah"]);
    expect(o.map((x) => x.fullName)).toEqual(["Aly Camara", "Fatou Sylla", "Mariama Diallo"]);
    expect(o.find((x) => x.fullName === "Mariama Diallo")).toMatchObject({ role: "educatrice_maternelle", teacherId: "t1", email: "m@x.com" });
    expect(o.find((x) => x.fullName === "Fatou Sylla")).toMatchObject({ role: "comptable", teacherId: null, source: "contract" });
  });
});
