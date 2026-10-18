import { describe, expect, it } from "vitest";
import { flatAnnualPrice, flatOffersNotice, isFlatOfferAvailable, toFlatOffers, yearLabelOf } from "./flat-offers";
import { toPublicOffers } from "./public-offers";
import { monthsOfAcademicYear } from "./flat-payments";

const row = (o: Partial<any> = {}) => ({
  id: "1", code: "etablissement_a", name: "Établissement A", offer_type: "per_school", is_active: true,
  min_students: 0, max_students: 600, monthly_price: 150000, free_months_annual: 2,
  valid_from: "2026-09-01", valid_until: "2027-08-31", features: {}, parent_login_allowed: true, student_login_allowed: true, ...o,
});

describe("offres établissement", () => {
  it("calcule le prix annuel : 1 500 000 et 2 000 000 GNF", () => {
    expect(flatAnnualPrice(150000, 2)).toBe(1_500_000);
    expect(flatAnnualPrice(200000, 2)).toBe(2_000_000);
    expect(flatAnnualPrice(200000, 0)).toBe(2_400_000);
  });
  it("affiche l'offre dans sa période de validité seulement", () => {
    expect(isFlatOfferAvailable(row(), "2026-10-18")).toBe(true);
    expect(isFlatOfferAvailable(row(), "2027-09-01")).toBe(false);
    expect(isFlatOfferAvailable(row(), "2026-08-31")).toBe(false);
  });
  it("masque une offre désactivée", () => {
    expect(toFlatOffers([row({ is_active: false })], "2026-10-18")).toHaveLength(0);
  });
  it("retire toutes les offres à la fin de validité : le lien disparaît", () => {
    expect(toFlatOffers([row(), row({ id: "2", code: "etablissement_b" })], "2027-09-02")).toHaveLength(0);
  });
  it("trie par tranche et calcule l'année affichée depuis la période", () => {
    const l = toFlatOffers([row({ id: "2", code: "etablissement_b", min_students: 601, max_students: 1000, monthly_price: 200000 }), row()], "2026-10-18");
    expect(l.map((o) => o.code)).toEqual(["etablissement_a", "etablissement_b"]);
    expect(l[1].annualPrice).toBe(2_000_000);
    expect(yearLabelOf("2026-09-01", "2027-08-31")).toBe("2026-2027");
    expect(flatOffersNotice(l)).toContain("(2026-2027)");
    const l2 = toFlatOffers([row({ valid_from: "2027-09-01", valid_until: "2028-08-31" })], "2027-10-01");
    expect(flatOffersNotice(l2)).toContain("(2027-2028)");
  });
  it("ne mélange jamais un forfait avec les trois offres par élève", () => {
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
