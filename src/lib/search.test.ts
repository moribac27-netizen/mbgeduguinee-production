import { describe, expect, test } from "bun:test";
import { matchesSearch, normalizeSearch } from "./search";

describe("recherche d'élève", () => {
  test("normalisation", () => {
    expect(normalizeSearch("  Élève   DÎALLO ")).toBe("eleve diallo");
    expect(normalizeSearch(null)).toBe("");
  });
  test("par nom, sans accent ni casse, dans n'importe quel ordre", () => {
    expect(matchesSearch("diallo", "Fatoumata Diallo", "MAT-001")).toBe(true);
    expect(matchesSearch("fatou dia", "Fatoumata Diallo", "MAT-001")).toBe(true);
    expect(matchesSearch("diallo fatoumata", "Fatoumata Diallo")).toBe(true);
    expect(matchesSearch("Hélène", "Helene Camara")).toBe(true);
    expect(matchesSearch("barry", "Fatoumata Diallo")).toBe(false);
  });
  test("par matricule (partiel) et par classe", () => {
    expect(matchesSearch("001", "Fatoumata Diallo", "MAT-001", "6e A")).toBe(true);
    expect(matchesSearch("mat-001", "Fatoumata Diallo", "MAT-001")).toBe(true);
    expect(matchesSearch("6e", "Fatoumata Diallo", "MAT-001", "6e A")).toBe(true);
    expect(matchesSearch("002", "Fatoumata Diallo", "MAT-001")).toBe(false);
  });
  test("recherche vide : tout correspond ; champs vides ignorés", () => {
    expect(matchesSearch("", "x")).toBe(true);
    expect(matchesSearch("   ", null)).toBe(true);
    expect(matchesSearch("a", null, undefined, "")).toBe(false);
  });
});

import { fetchAll } from "./fetch-all";
describe("lecture par pages", () => {
  test("rassemble toutes les pages", async () => {
    const all = Array.from({ length: 2500 }, (_, i) => i);
    const rows = await fetchAll<number>(async (f, t) => ({ data: all.slice(f, t + 1), error: null }));
    expect(rows.length).toBe(2500);
    expect(rows[2499]).toBe(2499);
  });
  test("une seule page, et erreur remontée", async () => {
    expect((await fetchAll<number>(async () => ({ data: [1, 2], error: null }))).length).toBe(2);
    let failed = false;
    try { await fetchAll(async () => ({ data: null, error: new Error("boom") })); } catch { failed = true; }
    expect(failed).toBe(true);
  });
});
