import { describe, expect, it } from "vitest";
import { flatInvoiceNumber } from "./flat-payments";

describe("flatInvoiceNumber", () => {
  it("dérive un numéro stable de la référence", () => {
    expect(flatInvoiceNumber("fp-2026/ab12")).toBe("FAC-FP2026AB12");
    expect(flatInvoiceNumber("fp-2026/ab12")).toBe(flatInvoiceNumber("FP-2026/AB12"));
  });
});
