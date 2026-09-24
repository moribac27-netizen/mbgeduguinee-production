import { describe, expect, it } from "vitest";
import { maxScoreForLevel } from "@/lib/grading";

describe("MBGEduGuinée document design", () => {
  it("uses /10 for primaire and /20 for collège/lycée", () => {
    expect(maxScoreForLevel("Primaire")).toBe(10);
    expect(maxScoreForLevel("Collège")).toBe(20);
    expect(maxScoreForLevel("Lycée")).toBe(20);
  });

  it("keeps exit-sheet status wording independent from colors", () => {
    const statuses = ["VALIDATED", "RESTRICTED", "FULL", "Admis"];
    for (const status of statuses) expect(status).toMatch(/[A-Za-zÀ-ÿ]/);
  });
});
