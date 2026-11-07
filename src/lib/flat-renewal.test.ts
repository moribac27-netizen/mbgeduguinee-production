import { describe, expect, test } from "bun:test";
import { flatPaymentErrorMessage } from "./flat-payments";

describe("messages de réinscription", () => {
  test("solde de l'année précédente impayé", () => {
    expect(flatPaymentErrorMessage("P0001: PREVIOUS_YEAR_UNPAID")).toContain("solde de l'année précédente");
  });
  test("déjà réinscrit / formule expirée", () => {
    expect(flatPaymentErrorMessage("ALREADY_RENEWED")).toContain("déjà réinscrit");
    expect(flatPaymentErrorMessage("OFFER_EXPIRED")).toContain("plus disponible");
  });
});
