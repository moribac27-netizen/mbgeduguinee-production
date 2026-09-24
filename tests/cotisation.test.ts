import { describe, it, expect, vi } from "vitest";
import { registerStudentPayment } from "@/lib/cotisation";
import { PER_STUDENT_ACCESS_THRESHOLD, PER_STUDENT_PLATFORM_SHARE_GNF, PER_STUDENT_SCHOOL_SHARE_GNF, PER_STUDENT_UNIT_PRICE_GNF } from "@/lib/pricing";

function makeFakeSupabase() {
  return { rpc: vi.fn(async () => ({ data: { id: "payment-1", status: "AWAITING_VALIDATION", amount: 50000, school_share: 15000 }, error: null })) } as any;
}

describe("cotisation annuelle unique", () => {
  it("fixe le tarif officiel", () => {
    expect(PER_STUDENT_UNIT_PRICE_GNF).toBe(50000);
    expect(PER_STUDENT_SCHOOL_SHARE_GNF).toBe(15000);
    expect(PER_STUDENT_PLATFORM_SHARE_GNF).toBe(35000);
    expect(PER_STUDENT_ACCESS_THRESHOLD).toBe(20);
  });

  it("déclare le paiement via la fonction serveur sans accepter un montant du navigateur", async () => {
    const sup = makeFakeSupabase();
    const res = await registerStudentPayment({ studentId: "s1", reference: "OM-123", transferDate: "2026-09-21T12:00:00.000Z", payerPhone: "621234567", supabase: sup });
    expect(res.status).toBe("created");
    expect(sup.rpc).toHaveBeenCalledWith("declare_cotisation_payment", {
      _student_id: "s1", _reference: "OM-123", _transfer_date: "2026-09-21T12:00:00.000Z", _payer_phone: "621234567",
    });
  });
});
