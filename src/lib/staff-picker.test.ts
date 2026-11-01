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
  const rows: any[] = [
    { kind: "enseignant", teacher_id: "t1", contract_id: null, full_name: "Mariama Diallo", email: "m@x.com", phone: "620", job_title: "Éducatrice", teacher_type: "educatrice", user_id: null },
    { kind: "enseignant", teacher_id: "t2", contract_id: null, full_name: "Ousmane Bah", email: null, phone: null, job_title: "Instituteur", teacher_type: "instituteur", user_id: "u1" },
    { kind: "non_enseignant", teacher_id: null, contract_id: "c2", full_name: "Fatou Sylla", email: null, phone: "621", job_title: "Comptable", teacher_type: null, user_id: null },
    { kind: "non_enseignant", teacher_id: null, contract_id: "c3", full_name: "Déjà Compte", email: null, phone: null, job_title: "Gardien", teacher_type: null, user_id: null },
  ];
  it("exclut les comptes existants (lien ou même nom) et déduit les rôles", () => {
    const o = buildStaffOptions(rows, ["déjà compte"]);
    expect(o.map((x) => x.fullName)).toEqual(["Fatou Sylla", "Mariama Diallo"]);
    expect(o.find((x) => x.fullName === "Mariama Diallo")).toMatchObject({ role: "educatrice_maternelle", teacherId: "t1", contractId: null, email: "m@x.com" });
    expect(o.find((x) => x.fullName === "Fatou Sylla")).toMatchObject({ role: "comptable", teacherId: null, contractId: "c2", source: "contract", phone: "621" });
  });
});
