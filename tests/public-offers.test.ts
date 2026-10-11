import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_OFFERS, formatPublicGNF, offerFeatures, toPublicOffers } from "../src/lib/public-offers";

describe("offres de la page publique", () => {
  it("valeurs par défaut : 20 000 / 35 000 / 50 000 GNF, commissions 0 / 5 000 / 15 000", () => {
    expect(DEFAULT_PUBLIC_OFFERS.map((o) => [o.code, o.price, o.commission])).toEqual([["basique", 20000, 0], ["standard", 35000, 5000], ["premium", 50000, 15000]]);
  });
  it("sans données (visiteur non connecté) on garde les valeurs par défaut", () => {
    expect(toPublicOffers([])).toBe(DEFAULT_PUBLIC_OFFERS);
    expect(toPublicOffers(null)).toBe(DEFAULT_PUBLIC_OFFERS);
    expect(toPublicOffers([{ code: "x", annual_price_per_student: "abc" }])).toBe(DEFAULT_PUBLIC_OFFERS);
  });
  it("lit les prix modifiés par le Super Admin et trie Basique, Standard, Premium", () => {
    const rows = [
      { code: "premium", name: "Premium", annual_price_per_student: "55000", school_commission_per_student: "16000", parent_login_allowed: true, student_login_allowed: true, features: { cantine: true, infirmerie: true, bibliotheque: true }, payer_roles: ["eleve", "parent", "admin"] },
      { code: "basique", name: "Basique", annual_price_per_student: "20000", school_commission_per_student: "0", parent_login_allowed: false, student_login_allowed: false, features: { cantine: false, infirmerie: false, bibliotheque: false }, payer_roles: ["admin"] },
    ];
    const o = toPublicOffers(rows);
    expect(o.map((x) => x.code)).toEqual(["basique", "premium"]);
    expect(o[1]).toMatchObject({ price: 55000, commission: 16000, studentPays: true, parentPays: true });
  });
  it("Basique : ni parents ni élèves ; Standard : parents seulement ; Premium : tous", () => {
    const f = (code: string) => Object.fromEntries(offerFeatures(DEFAULT_PUBLIC_OFFERS.find((o) => o.code === code)!).map((x) => [x.label, x.included]));
    expect(Object.values(f("basique")).some(Boolean)).toBe(false);
    expect(f("standard")).toMatchObject({ "Connexion des parents": true, "Paiement de la cotisation par les parents": true, "Connexion des élèves": false, "Paiement de la cotisation par les élèves": false });
    expect(Object.values(f("premium")).every(Boolean)).toBe(true);
  });
  it("format GNF avec espaces", () => expect(formatPublicGNF(35000)).toBe("35 000 GNF"));
});
