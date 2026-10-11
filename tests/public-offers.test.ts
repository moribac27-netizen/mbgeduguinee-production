import { describe, expect, it } from "vitest";
import { DEFAULT_PUBLIC_OFFERS, familyFeeText, fillOfferText, formatPublicGNF, numberFr, offerFeatures, premiumOf, priceRange, toPublicOffers } from "../src/lib/public-offers";

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

describe("textes dynamiques", () => {
  const modifies = toPublicOffers([
    { code: "basique", name: "Basique", annual_price_per_student: "25000", school_commission_per_student: "0", parent_login_allowed: false, student_login_allowed: false, features: {}, payer_roles: [] },
    { code: "standard", name: "Standard", annual_price_per_student: "40000", school_commission_per_student: "6000", parent_login_allowed: true, student_login_allowed: false, features: {}, payer_roles: ["parent"] },
    { code: "premium", name: "Premium", annual_price_per_student: "60000", school_commission_per_student: "18000", parent_login_allowed: true, student_login_allowed: true, features: {}, payer_roles: ["parent", "eleve"] },
  ]);
  it("remplace les repères par les valeurs modifiées par le Super Admin", () => {
    expect(fillOfferText("Basique {prix_basique}, Standard {prix_standard}, Premium {prix_premium}, part {part_premium}", modifies)).toBe("Basique 25 000 GNF, Standard 40 000 GNF, Premium 60 000 GNF, part 18 000 GNF");
    expect(fillOfferText("{prix_liste} / de {prix_min} à {prix_max}", modifies)).toBe("25 000, 40 000 ou 60 000 GNF / de 25 000 GNF à 60 000 GNF");
  });
  it("valeurs par défaut sans données, et repère inconnu conservé tel quel", () => {
    expect(fillOfferText("{prix_premium} {inconnu}", DEFAULT_PUBLIC_OFFERS)).toBe("50 000 GNF {inconnu}");
  });
  it("une offre désactivée (absente) retombe sur sa valeur par défaut sans casser le texte", () => {
    const sansStandard = modifies.filter((o) => o.code !== "standard");
    expect(fillOfferText("{prix_standard}", sansStandard)).toBe("35 000 GNF");
  });
  it("Premium et fourchette", () => {
    expect(premiumOf(modifies).price).toBe(60000);
    expect(priceRange(modifies)).toEqual({ min: 25000, max: 60000 });
    expect(numberFr(1234567)).toBe("1 234 567");
  });
  it("montant à l'inscription d'un parent / élève : fourchette des offres avec connexion famille", () => {
    expect(familyFeeText(DEFAULT_PUBLIC_OFFERS)).toBe("35 000 à 50 000 GNF selon l'offre de l'école");
    expect(familyFeeText(modifies.filter((o) => o.code === "premium"))).toBe("60 000 GNF");
    expect(familyFeeText(modifies.filter((o) => o.code === "basique"))).toBe("selon l'offre de l'école");
  });
});
