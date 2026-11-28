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

import { compactGNF, founderSummary, founderWatchList, monthLabelFr, recoveryRate, schoolYearToDate } from "./founder-utils";

describe("lecture rapide fondateur", () => {
  test("libellés et montants courts", () => {
    expect(monthLabelFr("2026-11")).toBe("nov. 26");
    expect(compactGNF(300000)).toBe("300 k");
    expect(compactGNF(1500000)).toBe("1,5 M");
    expect(compactGNF(0)).toBe("0");
  });
  test("année scolaire à ce jour", () => {
    expect(schoolYearToDate("2026-11-28")).toEqual({ from: "2026-09-01", to: "2026-11-28" });
    expect(schoolYearToDate("2027-03-05")).toEqual({ from: "2026-09-01", to: "2027-03-05" });
  });
  test("taux de recouvrement", () => {
    expect(recoveryRate(0, 0)).toBeNull();
    expect(recoveryRate(1000, 250)).toBe(25);
    expect(recoveryRate(1000, 2000)).toBe(100);
  });
  test("points d'attention : gravité et règles", () => {
    const d = {
      subscription: { phase: "active" }, finance: { expense: 500, result: -500, revenue: 0 }, headline: { students: 10, treasury_total: -5 },
      recovery: { fees_expected: 1000, fees_collected: 100, students_late: 3 }, alerts: { unposted_payments: { count: 1, amount: 440000 }, voided_entries: { count: 0, amount: 0 } },
      staff: { payslips_unpaid: 2 },
    };
    const w = founderWatchList(d);
    expect(w[0].level).toBe("alert");
    expect(w.some((x) => x.level === "warn" && /pas encore enregistrés/.test(x.text))).toBe(true);
    expect(w.some((x) => /bulletin/.test(x.text))).toBe(true);
    expect(founderWatchList({ subscription: { phase: "active" }, finance: { expense: 0, result: 0 }, headline: { students: 1, treasury_total: 0 }, recovery: { fees_expected: 1000, fees_collected: 900 } })).toEqual([]);
    expect(founderWatchList({ subscription: { phase: "overdue" } })[0].level).toBe("alert");
  });
  test("synthèse en phrases", () => {
    const s = founderSummary({
      headline: { students: 248, treasury_total: 0, treasury_by_type: {} },
      finance: { revenue: 300000, expense: 500000, result: -200000 },
      recovery: { academic_year: "2026-2027", fees_expected: 1000000, fees_collected: 250000, amount_due: 750000, students_late: 3, families_late: 2 },
    });
    expect(s.length).toBe(4);
    expect(s[1]).toMatch(/25 % encaissée/);
    expect(s[2]).toMatch(/déficit/);
    expect(s[3]).toMatch(/Aucun compte/);
  });
});
