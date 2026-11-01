import { describe, expect, it } from "vitest";
import { validateNewPassword } from "./password";

describe("validateNewPassword", () => {
  it("refuse les cas invalides", () => {
    expect(validateNewPassword("", "abcd1234", "abcd1234")).toMatch(/actuel/);
    expect(validateNewPassword("old", "abc12", "abc12")).toMatch(/8 caractères/);
    expect(validateNewPassword("old", "abcdefgh", "abcdefgh")).toMatch(/chiffres/);
    expect(validateNewPassword("abcd1234", "abcd1234", "abcd1234")).toMatch(/différent/);
    expect(validateNewPassword("old", "abcd1234", "abcd12345")).toMatch(/correspondent/);
  });
  it("accepte un bon mot de passe", () => {
    expect(validateNewPassword("old", "Nouveau2026", "Nouveau2026")).toBeNull();
  });
});
