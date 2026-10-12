import { describe, expect, test } from "vitest";
import { DEFAULT_PUBLIC_OFFERS } from "../src/lib/public-offers";
import { offerConditions, resolveSignupOffer } from "../src/lib/signup-offer";

describe("choix d'offre à la création d'un établissement", () => {
  it("sans choix ou avec un code inconnu, aucune offre n'est retenue (formulaire bloqué)", () => {
    expect(resolveSignupOffer(null, DEFAULT_PUBLIC_OFFERS)).toBeNull();
    expect(resolveSignupOffer("", DEFAULT_PUBLIC_OFFERS)).toBeNull();
    expect(resolveSignupOffer("inconnue", DEFAULT_PUBLIC_OFFERS)).toBeNull();
  });
  it("un code valide retrouve l'offre, sans tenir compte de la casse", () => {
    expect(resolveSignupOffer(" Standard ", DEFAULT_PUBLIC_OFFERS)?.code).toBe("standard");
  });
  it("une offre retirée par le Super Admin n'est plus retenue", () => {
    const sans = DEFAULT_PUBLIC_OFFERS.filter((o) => o.code !== "premium");
    expect(resolveSignupOffer("premium", sans)).toBeNull();
  });
  it("les conditions rappellent que le choix n'est pas un paiement", () => {
    for (const o of DEFAULT_PUBLIC_OFFERS) expect(offerConditions(o).join(" ")).toContain("pas un paiement");
  });
});
