import { describe, expect, it } from "vitest";
import { feeStatus, isLate, isTuitionPayment } from "./fees";

describe("frais de scolarité", () => {
  it("n'impute que la scolarité (comme la Vue Fondateur)", () => {
    expect(isTuitionPayment("scolarite")).toBe(true);
    expect(isTuitionPayment("Scolarité")).toBe(true);
    expect(isTuitionPayment("inscription")).toBe(false);
    expect(isTuitionPayment("cantine")).toBe(false);
    expect(isTuitionPayment("transport")).toBe(false);
  });
  it("paiement intégral, partiel, plusieurs paiements", () => {
    expect(feeStatus(1000, [{ amount: 1000, validation_status: "validé", payment_type: "scolarite" }])).toMatchObject({ paid: 1000, remaining: 0, pct: 100 });
    expect(feeStatus(1000, [{ amount: 300, validation_status: "validé", payment_type: "scolarite" }])).toMatchObject({ paid: 300, remaining: 700 });
    expect(feeStatus(1000, [{ amount: 300, validation_status: "validé", payment_type: "scolarite" }, { amount: 200, validation_status: "validé", payment_type: "scolarite" }]).paid).toBe(500);
  });
  it("ne compte pas les paiements d'une année scolaire précédente", () => {
    const s = feeStatus(1000, [{ amount: 900, validation_status: "validé", payment_type: "scolarite", paid_at: "2025-10-01T00:00:00Z" }, { amount: 100, validation_status: "validé", payment_type: "scolarite", paid_at: "2026-10-01T00:00:00Z" }], "2026-09-01");
    expect(s.paid).toBe(100);
  });
  it("ignore cantine, transport, paiements en attente ou rejetés", () => {
    const s = feeStatus(1000, [
      { amount: 400, validation_status: "validé", payment_type: "cantine" },
      { amount: 400, validation_status: "en_attente", payment_type: "scolarite" },
      { amount: 400, validation_status: "rejeté", payment_type: "scolarite" },
    ]);
    expect(s.paid).toBe(0);
  });
  it("un remboursement (montant négatif) fait remonter le reste à payer", () => {
    const s = feeStatus(1000, [{ amount: 1000, validation_status: "validé", payment_type: "scolarite" }, { amount: -250, validation_status: "validé", payment_type: "scolarite" }]);
    expect(s).toMatchObject({ paid: 750, remaining: 250 });
  });
  it("retard : moins de 50 % et frais définis", () => {
    expect(isLate(feeStatus(1000, [{ amount: 499, validation_status: "validé", payment_type: "scolarite" }]))).toBe(true);
    expect(isLate(feeStatus(1000, [{ amount: 500, validation_status: "validé", payment_type: "scolarite" }]))).toBe(false);
    expect(isLate(feeStatus(0, []))).toBe(false);
  });
});
