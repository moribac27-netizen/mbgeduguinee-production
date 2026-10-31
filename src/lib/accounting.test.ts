import { describe, expect, it } from "vitest";
import { ACCOUNT_CATALOG, accountingErrorMessage, amountInWordsFr, budgetProgress, buildEntryReceiptHtml, missingTemplates, periodRange, toCsv } from "./accounting";

describe("periodRange", () => {
  it("mois, trimestre, année civile", () => {
    expect(periodRange("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("quarter", "2026-11-05")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(periodRange("year", "2026-11-05")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("année scolaire : septembre → août", () => {
    expect(periodRange("school_year", "2026-10-30")).toEqual({ from: "2026-09-01", to: "2027-08-31" });
    expect(periodRange("school_year", "2027-03-02")).toEqual({ from: "2026-09-01", to: "2027-08-31" });
    expect(periodRange("school_year", "2026-08-31")).toEqual({ from: "2025-09-01", to: "2026-08-31" });
  });
  it("tout et personnalisé", () => {
    expect(periodRange("all", "2026-10-30")).toEqual({ from: null, to: null });
    expect(periodRange("custom", "2026-10-30", { from: "2026-01-01", to: "" })).toEqual({ from: "2026-01-01", to: null });
  });
});

describe("toCsv", () => {
  it("échappe les guillemets, points-virgules et protège les formules", () => {
    const csv = toCsv([{ a: 'dit "oui"; ok', b: "=1+1", c: 1500 }], [
      { label: "A", value: (r) => r.a }, { label: "B", value: (r) => r.b }, { label: "C", value: (r) => r.c },
    ]);
    expect(csv.startsWith("﻿A;B;C")).toBe(true);
    expect(csv).toContain('"dit ""oui""; ok"');
    expect(csv).toContain("'=1+1");
    expect(csv).toContain(";1500");
  });
});

describe("accountingErrorMessage", () => {
  it("traduit les codes et laisse passer les messages français", () => {
    expect(accountingErrorMessage("ALREADY_POSTED")).toBe("Déjà comptabilisé.");
    expect(accountingErrorMessage("Cette écriture est annulée : elle n'est plus modifiable.")).toContain("annulée");
  });
});

describe("amountInWordsFr", () => {
  const cases: Array<[number, string]> = [
    [0, "zéro"], [1, "un"], [16, "seize"], [17, "dix-sept"], [21, "vingt et un"], [71, "soixante et onze"], [77, "soixante-dix-sept"],
    [80, "quatre-vingts"], [81, "quatre-vingt-un"], [91, "quatre-vingt-onze"], [100, "cent"], [200, "deux cents"], [201, "deux cent un"],
    [1000, "mille"], [2000, "deux mille"], [80000, "quatre-vingt mille"], [200000, "deux cent mille"], [50000, "cinquante mille"],
    [1500000, "un million cinq cent mille"], [2000000, "deux millions"], [10000000, "dix millions"], [1234567, "un million deux cent trente-quatre mille cinq cent soixante-sept"],
    [1000000000, "un milliard"],
  ];
  for (const [n, w] of cases) it(`${n} → ${w}`, () => expect(amountInWordsFr(n)).toBe(w));
  it("hors plage", () => expect(amountInWordsFr(1e13)).toBe(""));
});

describe("catalogue de comptes", () => {
  it("n'a pas de doublon de nom et contient les comptes de base", () => {
    const names = ACCOUNT_CATALOG.map((a) => a.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(ACCOUNT_CATALOG.filter((a) => a.base).map((a) => a.name)).toContain("Caisse principale");
  });
  it("ignore ceux déjà créés (casse et espaces)", () => {
    const left = missingTemplates([" caisse principale "]);
    expect(left.find((a) => a.name === "Caisse principale")).toBeUndefined();
    expect(left.length).toBe(ACCOUNT_CATALOG.length - 1);
  });
});

describe("budgetProgress", () => {
  it("dépense : alerte à 90 % puis dépassement", () => {
    expect(budgetProgress(1000, 500, "expense")).toEqual({ percent: 50, state: "ok" });
    expect(budgetProgress(1000, 950, "expense").state).toBe("warn");
    expect(budgetProgress(1000, 1200, "expense").state).toBe("over");
  });
  it("sans budget", () => {
    expect(budgetProgress(0, 0, "expense")).toEqual({ percent: null, state: "none" });
    expect(budgetProgress(0, 10, "expense").state).toBe("over");
    expect(budgetProgress(0, 10, "revenue").state).toBe("none");
  });
});

describe("buildEntryReceiptHtml", () => {
  it("échappe le HTML, affiche le montant en lettres et la mention ANNULÉ", () => {
    const html = buildEntryReceiptHtml({ kind: "revenue", id: "abcdef12-0000-0000-0000-000000000000", date: "2026-10-30", amount: 50000, typeLabel: "Inscription",
      description: "<script>alert(1)</script>", voidReason: "erreur", school: { name: "École <b>X</b>" } });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("cinquante mille francs guinéens");
    expect(html).toContain("R-ABCDEF12");
    expect(html).toContain("ANNULÉ");
  });
  it("bon de dépense", () => {
    const html = buildEntryReceiptHtml({ kind: "expense", id: "11111111-2222-3333-4444-555555555555", date: "2026-10-30", amount: 120000, typeLabel: "Fournitures", beneficiary: "Fournisseur", school: {} });
    expect(html).toContain("BON DE DÉPENSE");
    expect(html).toContain("D-11111111");
    expect(html).toContain("Fournisseur");
  });
});

import { categoryLabel, selectableCategories, validateCategoryInput, type AccountingCategory } from "./accounting";
describe("plan comptable", () => {
  const mk = (o: Partial<AccountingCategory>): AccountingCategory => ({ id: "x", kind: "recette", code: "1", label: "L", legacy_type: null, is_system: true, is_active: true, sort_order: 10, ...o });
  it("categoryLabel", () => {
    expect(categoryLabel({ code: "7010", label: "Scolarité" })).toBe("7010 — Scolarité");
    expect(categoryLabel(null)).toBe("");
  });
  it("selectableCategories filtre sens/actif et trie", () => {
    const out = selectableCategories([mk({ id: "a", code: "2", sort_order: 20 }), mk({ id: "b", code: "1", sort_order: 10 }), mk({ id: "c", is_active: false }), mk({ id: "d", kind: "depense" })], "recette");
    expect(out.map((c) => c.id)).toEqual(["b", "a"]);
  });
  it("validateCategoryInput", () => {
    expect(validateCategoryInput("", "Libellé", [])).toMatch(/code/);
    expect(validateCategoryInput("A1", "x", [])).toMatch(/libellé/);
    expect(validateCategoryInput("a1", "Libellé", ["A1"])).toMatch(/existe/);
    expect(validateCategoryInput("A2", "Libellé", ["A1"])).toBeNull();
  });
});
