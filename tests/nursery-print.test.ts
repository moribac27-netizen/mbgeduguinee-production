import { describe, expect, it } from "vitest";
import { childRecordHtml, sectionListHtml } from "../src/lib/nursery-print";

const meta = { schoolName: "École <Test> \"A\"", academicYear: "2026-2027", logoUrl: 'x" onerror="alert(1)', accent: "#1f6f5c" };

describe("fiche de renseignements", () => {
  const html = childRecordHtml({
    meta,
    autoPrint: false,
    child: {
      fullName: "Aïssatou <b>Bah</b>",
      matricule: "EDG-1234",
      gender: "F",
      birthDate: "02/04/2022",
      className: "Petite section",
      sectionName: "PS A",
      parentName: "Oumar Bah",
      parentPhone: "628499812",
      pickupPerson: "Tante Mariama",
      allergies: "Arachide",
      napNeeded: true,
      toiletTrained: false,
    },
  });
  it("contient l'identité, le responsable, la santé et l'année scolaire", () => {
    for (const t of ["Aïssatou", "EDG-1234", "Féminin", "02/04/2022", "Oumar Bah", "Tante Mariama", "Arachide", "2026-2027", "Petite section"]) expect(html).toContain(t);
  });
  it("échappe le HTML et les guillemets (logo compris)", () => {
    expect(html).not.toContain("<b>Bah</b>");
    expect(html).toContain("&lt;b&gt;Bah&lt;/b&gt;");
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain("&quot;");
  });
  it("n'affiche jamais undefined/null et n'imprime pas si autoPrint=false", () => {
    expect(html).not.toMatch(/undefined|null/);
    expect(html).not.toContain("window.print");
  });
  it("une fiche vide reste imprimable (champs à compléter à la main)", () => {
    const h = childRecordHtml({ meta: {}, child: { fullName: "Enfant" } });
    expect(h).toContain("window.print");
    expect(h).not.toMatch(/undefined|null/);
  });
});

describe("liste de section", () => {
  it("numérote, met les allergies en évidence et affiche l'effectif", () => {
    const h = sectionListHtml({
      meta: {},
      autoPrint: false,
      sectionName: "PS A",
      capacity: 20,
      rows: [
        { fullName: "A B", allergies: "Lait" },
        { fullName: "C D" },
      ],
    });
    expect(h).toContain("2 / 20");
    expect(h).toContain('class="alert">Lait');
    expect(h.match(/<td>1<\/td>/g)).toHaveLength(1);
  });
  it("section vide", () => {
    expect(sectionListHtml({ meta: {}, autoPrint: false, sectionName: "X", rows: [] })).toContain("Aucun enfant");
  });
});

import { STANDARD_COMPETENCIES, NURSERY_DOMAINS } from "../src/lib/nursery-defaults";

describe("référentiel par défaut", () => {
  it("20 compétences, domaines valides, libellés et ordres uniques", () => {
    expect(STANDARD_COMPETENCIES).toHaveLength(20);
    expect(STANDARD_COMPETENCIES.every((c) => (NURSERY_DOMAINS as readonly string[]).includes(c.domain))).toBe(true);
    expect(new Set(STANDARD_COMPETENCIES.map((c) => c.label)).size).toBe(20);
    expect(new Set(STANDARD_COMPETENCIES.map((c) => c.display_order)).size).toBe(20);
  });
});

describe("fiche vierge et photo", () => {
  it("fiche d'inscription vierge : titre dédié, champs vides imprimables", () => {
    const h = childRecordHtml({ meta: { schoolName: "École" }, title: "Fiche d'inscription", child: { fullName: "" }, autoPrint: false });
    expect(h).toContain("Fiche d&#39;inscription");
    expect(h).not.toMatch(/undefined|null/);
  });
  it("n'accepte que les photos en http(s)", () => {
    const ok = childRecordHtml({ meta: {}, child: { fullName: "A B", photoUrl: "https://x.test/p.jpg" }, autoPrint: false });
    const bad = childRecordHtml({ meta: {}, child: { fullName: "A B", photoUrl: "javascript:alert(1)" }, autoPrint: false });
    expect(ok).toContain('src="https://x.test/p.jpg"');
    expect(bad).not.toContain("javascript:");
  });
});
