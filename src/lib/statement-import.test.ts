import { describe, expect, it } from "vitest";
import { parseAmount, parseScheduleInput, parseStatement } from "./statement-import";

describe("parseAmount", () => {
  it("lit les formats usuels", () => {
    expect(parseAmount("101000.00")).toBe(101000);
    expect(parseAmount("101 000,00")).toBe(101000);
    expect(parseAmount("101,000.00")).toBe(101000);
    expect(parseAmount("101.000")).toBe(101000);
    expect(parseAmount("abc")).toBeNaN();
  });
});

describe("parseStatement", () => {
  it("lit un SMS collé", () => {
    const r = parseStatement("Bonjour, recepption de: 101000.00GNF de la part du 628499812,Nouveau Solde:101000.00GNF,reference:PP261102.0647.A80739.Orange Money vous remercie");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ ref: "PP261102.0647.A80739", amount: 101000, phone: "628499812" });
  });
  it("lit un CSV avec en-tête et ignore les sorties, doublons et lignes sans montant", () => {
    const csv = [
      "Date;Type;Référence;Montant;Solde",
      "05/11/2026;Réception;PP261105.1000.B11111;150 000;300 000",
      "05/11/2026;Retrait;PP261105.1001.B22222;20 000;280 000",
      "05/11/2026;Réception;PP261105.1000.B11111;150 000;300 000",
      "05/11/2026;Réception;sans reference;5 000;285 000",
    ].join("\n");
    const r = parseStatement(csv);
    expect(r.rows.map((x) => [x.ref, x.amount])).toEqual([["PP261105.1000.B11111", 150000]]);
    expect(r.ignored).toBe(3);
  });
  it("renvoie vide pour un texte vide", () => {
    expect(parseStatement("")).toEqual({ rows: [], ignored: 0 });
  });
});

describe("parseScheduleInput", () => {
  it("accepte un calendrier croissant finissant à 12", () => {
    expect(parseScheduleInput("1, 3, 5, 7, 9, 11, 12")).toEqual([1, 3, 5, 7, 9, 11, 12]);
  });
  it("refuse les calendriers invalides", () => {
    expect(parseScheduleInput("1,3,5")).toBeNull();
    expect(parseScheduleInput("1,5,3,12")).toBeNull();
    expect(parseScheduleInput("1,13")).toBeNull();
    expect(parseScheduleInput("a,12")).toBeNull();
  });
});
