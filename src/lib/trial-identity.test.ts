import { describe, expect, test } from "bun:test";
import { normalizeEmail, normalizePhone, trialIdentities } from "./trial-identity";

describe("trial-identity", () => {
  test("e-mail : alias et points Gmail ignorés", () => {
    expect(normalizeEmail(" Moriba.C+essai@Gmail.com ")).toBe("moribac@gmail.com");
    expect(normalizeEmail("a.b+x@googlemail.com")).toBe("ab@gmail.com");
    expect(normalizeEmail("a.b+x@ecole.org")).toBe("a.b@ecole.org");
    expect(normalizeEmail("pas-un-email")).toBeNull();
  });
  test("téléphone : indicatif Guinée retiré", () => {
    expect(normalizePhone("+224 628 49 98 12")).toBe("628499812");
    expect(normalizePhone("00224628499812")).toBe("628499812");
    expect(normalizePhone("628499812")).toBe("628499812");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
  test("identités : dédoublonnées", () => {
    const ids = trialIdentities({ email: "A@x.com", phone: "628499812", schoolPhone: "+224628499812" });
    expect(ids).toEqual([{ kind: "email", value: "a@x.com" }, { kind: "phone", value: "628499812" }]);
  });
});
