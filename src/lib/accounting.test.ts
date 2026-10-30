import { describe, expect, it } from "vitest";
import { accountingErrorMessage, periodRange, toCsv } from "./accounting";

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
