import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("landing page — modèle financier", () => {
  it("affiche les trois offres avant le détail Premium, sans retirer l'existant", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/index.tsx"), "utf8");
    expect(source).toContain("<PublicOffers />");
    expect(source.indexOf("<PublicOffers />")).toBeLessThan(source.indexOf('id="tarifs-detail"'));
    expect(source).toContain('id="faq"');
  });
  it("affiche le modèle unique de cotisation annuelle", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/index.tsx"), "utf8");
    // Les montants ne sont plus écrits en dur : ils viennent des offres (Supabase), modifiables par le Super Admin.
    expect(source).not.toMatch(/\b(20|35|50) 000 GNF|\b15 000 GNF/);
    expect(source).toContain("premium.price");
    expect(source).toContain("premium.commission");
    expect(source).toContain("20 cotisations VALIDATED");
    // Les anciennes tables d'abonnement par établissement n'existent pas : les offres sont par élève (subscription_offers).
    expect(source).not.toMatch(/school_subscriptions|subscription_plans/);
  });
});
