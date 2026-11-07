import { describe, expect, test } from "bun:test";
import { canAccess, homeForRoles } from "./access";
import { monthBounds, shiftMonth, founderErrorMessage } from "./founder-utils";

describe("accès fondateur", () => {
  test("un fondateur n'accède qu'à sa vue", () => {
    expect(canAccess("/fondateur", ["fondateur"], false)).toBe(true);
    for (const p of ["/dashboard", "/eleves", "/paiements", "/comptabilite", "/salaires", "/notes", "/super-admin", "/mon-forfait"]) {
      expect(canAccess(p, ["fondateur"], false)).toBe(false);
    }
  });
  test("les autres rôles n'accèdent pas à /fondateur (hors Super Admin)", () => {
    for (const r of ["admin", "directeur", "comptable", "enseignant", "parent", "eleve"] as const) expect(canAccess("/fondateur", [r], false)).toBe(false);
    expect(canAccess("/fondateur", [], true)).toBe(true);
  });
  test("la priorité d'accueil des autres rôles est inchangée", () => {
    expect(homeForRoles(["fondateur"], false)).toBe("/fondateur");
    expect(homeForRoles(["fondateur", "admin"], false)).toBe("/dashboard");
    expect(homeForRoles(["fondateur", "comptable"], false)).toBe("/paiements");
    expect(homeForRoles(["fondateur", "parent"], false)).toBe("/parent");
    expect(homeForRoles(["admin"], true)).toBe("/super-admin");
  });
});

describe("période", () => {
  test("bornes de mois", () => {
    expect(monthBounds("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds("2028-02").to).toBe("2028-02-29");
    expect(monthBounds("2026-12").to).toBe("2026-12-31");
  });
  test("décalage de mois", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  test("messages d'erreur lisibles", () => {
    expect(founderErrorMessage({ message: "FORBIDDEN" })).toContain("non autorisé");
    expect(founderErrorMessage({ message: "boom" })).toContain("erreur");
  });
});
