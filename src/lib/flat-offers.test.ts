import { describe, expect, it } from "vitest";
import { capacityState, flatAnnualPrice, flatCategoryMessage, flatCategoryTitle, isFlatOfferAvailable, studentRangeText, toFlatOffers, yearLabelOf } from "./flat-offers";
import { toPublicOffers } from "./public-offers";
import { monthsOfAcademicYear } from "./flat-payments";

const row = (o: Partial<any> = {}) => ({
  id: "1", code: "etablissement_basique", name: "Basique", offer_type: "per_school", is_active: true,
  min_students: 0, max_students: 200, monthly_price: 100000, free_months_annual: 0,
  valid_from: "2026-09-01", valid_until: "2027-08-31", features: {}, parent_login_allowed: false, student_login_allowed: false, ...o,
});
const three = () => [
  row(),
  row({ id: "2", code: "etablissement_standard", name: "Standard", max_students: 600, monthly_price: 150000 }),
  row({ id: "3", code: "etablissement_premium", name: "Premium", max_students: null, monthly_price: 200000 }),
];

describe("plans par établissement", () => {
  it("expose les trois plans avec leurs prix et capacités", () => {
    const l = toFlatOffers(three(), "2026-10-27");
    expect(l.map((o) => [o.name, o.monthlyPrice, o.maxStudents])).toEqual([["Basique", 100000, 200], ["Standard", 150000, 600], ["Premium", 200000, null]]);
  });
  it("affiche la capacité, illimitée pour le Premium", () => {
    const l = toFlatOffers(three(), "2026-10-27");
    expect(studentRangeText(l[0])).toBe("Capacité maximale : 200 élèves");
    expect(studentRangeText(l[2])).toBe("Nombre d'élèves illimité");
  });
  it("calcule le prix annuel quand des mois sont offerts", () => {
    expect(flatAnnualPrice(150000, 2)).toBe(1_500_000);
    expect(flatAnnualPrice(100000, 0)).toBe(1_200_000);
  });
  it("n'affiche les plans que dans la période de validité et s'ils sont actifs", () => {
    expect(isFlatOfferAvailable(row(), "2026-10-27")).toBe(true);
    expect(toFlatOffers(three(), "2027-09-02")).toHaveLength(0);
    expect(toFlatOffers([row({ is_active: false })], "2026-10-27")).toHaveLength(0);
  });
  it("titre et message : l'année vient de la période de validité", () => {
    const l = toFlatOffers(three(), "2026-10-27");
    expect(flatCategoryTitle(l)).toBe("PLANS PAR ÉTABLISSEMENT — OFFRE EXCEPTIONNELLE POUR L'ANNÉE SCOLAIRE 2026-2027");
    expect(flatCategoryMessage(l)).toContain("exclusivement valable pour l'année scolaire 2026-2027");
    expect(flatCategoryMessage(l)).toContain("ne seront pas reconduits");
    expect(yearLabelOf("2027-09-01", "2028-08-31")).toBe("2027-2028");
  });
  it("alerte de capacité : proche, atteinte, dépassée, illimitée", () => {
    expect(capacityState(150, 200)).toBe("ok");
    expect(capacityState(180, 200)).toBe("near");
    expect(capacityState(200, 200)).toBe("full");
    expect(capacityState(201, 200)).toBe("over");
    expect(capacityState(5000, null)).toBe("ok");
  });
  it("ne mélange jamais un plan établissement avec les trois plans par élève", () => {
    const perStudent = [{ code: "basique", name: "Basique", annual_price_per_student: 20000, school_commission_per_student: 0 }];
    const res = toPublicOffers([...perStudent, { ...row(), annual_price_per_student: 0, school_commission_per_student: 0 }]);
    expect(res.map((o) => o.code)).toEqual(["basique"]);
  });
  it("liste les 12 mois de septembre à août", () => {
    const m = monthsOfAcademicYear("2026-2027");
    expect(m).toHaveLength(12);
    expect(m[0].value).toBe("2026-09-01");
    expect(m[11].value).toBe("2027-08-01");
  });
});
