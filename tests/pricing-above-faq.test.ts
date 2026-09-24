import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("landing page — modèle financier", () => {
  it("affiche le modèle unique de cotisation annuelle", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/index.tsx"), "utf8");
    expect(source).toContain("50 000 GNF");
    expect(source).toContain("15 000 GNF");
    expect(source).toContain("20 VALIDATED");
    expect(source).not.toMatch(/Basic|Standard|Premium|school_subscriptions|subscription_plans/);
  });
});
