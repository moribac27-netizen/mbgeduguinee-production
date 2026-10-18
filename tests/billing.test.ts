import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  billingErrorMessage, computeBilling, planForHeadcount, planRanges, validateBillingConfig, type BillingPlan,
} from "../src/lib/billing";

const plans: BillingPlan[] = [
  { code: "forfait_1", name: "Forfait 1", monthly_price: 150000, max_students: 600, is_active: true, sort_order: 1 },
  { code: "forfait_2", name: "Forfait 2", monthly_price: 200000, max_students: 1000000, is_active: true, sort_order: 2 },
];
const cfg = (over: Partial<{ p1: any; m1: any; a1: boolean; p2: any; m2: any; a2: boolean; free: any }> = {}) => ({
  plans: [
    { code: "forfait_1", monthly_price: over.p1 ?? 150000, max_students: over.m1 ?? 600, is_active: over.a1 ?? true },
    { code: "forfait_2", monthly_price: over.p2 ?? 200000, max_students: over.m2 ?? 1000000, is_active: over.a2 ?? true },
  ],
  free_months: over.free ?? 2,
});

describe("calcul mensuel / annuel", () => {
  it("mensuel : prix mensuel, aucune réduction", () => {
    expect(computeBilling(150000, "monthly", 2)).toEqual({ monthly: 150000, gross: 150000, discount: 0, amount: 150000, billedMonths: 1 });
  });
  it("annuel Forfait 1 : 1 800 000 brut, 300 000 de réduction, 1 500 000 à payer", () => {
    const a = computeBilling(150000, "yearly", 2);
    expect([a.gross, a.discount, a.amount, a.billedMonths]).toEqual([1800000, 300000, 1500000, 10]);
  });
  it("annuel Forfait 2 : 2 400 000 brut, 400 000 de réduction, 2 000 000 à payer", () => {
    const a = computeBilling(200000, "yearly", 2);
    expect([a.gross, a.discount, a.amount]).toEqual([2400000, 400000, 2000000]);
  });
  it("recalcul immédiat après changement de prix ou de mois offerts", () => {
    expect(computeBilling(160000, "yearly", 2).amount).toBe(1600000);
    expect(computeBilling(150000, "yearly", 3).amount).toBe(1350000);
    expect(computeBilling(150000, "yearly", 0).amount).toBe(1800000);
    expect(computeBilling(150000, "yearly", 12).amount).toBe(0);
  });
  it("refuse prix négatif, cycle inconnu, mois offerts hors 0–12 ou non entiers", () => {
    expect(() => computeBilling(-1, "monthly", 2)).toThrow("INVALID_PRICE");
    expect(() => computeBilling(1, "weekly" as any, 2)).toThrow("INVALID_CYCLE");
    expect(() => computeBilling(1, "yearly", 13)).toThrow("INVALID_FREE_MONTHS");
    expect(() => computeBilling(1, "yearly", -1)).toThrow("INVALID_FREE_MONTHS");
    expect(() => computeBilling(1, "yearly", 1.5)).toThrow("INVALID_FREE_MONTHS");
  });
  it("refuse NaN, Infinity et prix démesuré (même borne que le serveur)", () => {
    expect(() => computeBilling(NaN, "monthly", 2)).toThrow("INVALID_PRICE");
    expect(() => computeBilling(Infinity, "yearly", 2)).toThrow("INVALID_PRICE");
    expect(() => computeBilling(1e12, "monthly", 2)).toThrow("INVALID_PRICE");
    expect(computeBilling(999999999999, "monthly", 2).amount).toBe(999999999999);
  });
});

describe("forfait applicable selon l'effectif", () => {
  it("0 à 600 → Forfait 1 ; 601 et plus → Forfait 2 ; au-delà du maximum → aucun", () => {
    expect(planForHeadcount(plans, 0)?.code).toBe("forfait_1");
    expect(planForHeadcount(plans, 600)?.code).toBe("forfait_1");
    expect(planForHeadcount(plans, 601)?.code).toBe("forfait_2");
    expect(planForHeadcount(plans, 1000000)?.code).toBe("forfait_2");
    expect(planForHeadcount(plans, 1000001)).toBeNull();
  });
  it("suit les seuils modifiés par le Super Admin", () => {
    const moved = plans.map((p) => (p.code === "forfait_1" ? { ...p, max_students: 700 } : p));
    expect(planForHeadcount(moved, 650)?.code).toBe("forfait_1");
    expect(planForHeadcount(moved, 701)?.code).toBe("forfait_2");
  });
  it("un forfait désactivé n'est plus proposé", () => {
    const off = plans.map((p) => (p.code === "forfait_1" ? { ...p, is_active: false } : p));
    expect(planForHeadcount(off, 10)?.code).toBe("forfait_2");
  });
  it("les plages ne se chevauchent pas : minimum = maximum précédent + 1", () => {
    const r = planRanges(plans).map((x) => [x.plan.code, x.min, x.max]);
    expect(r).toEqual([["forfait_1", 0, 600], ["forfait_2", 601, 1000000]]);
  });
});

describe("contrôles de configuration", () => {
  it("accepte la configuration initiale", () => expect(validateBillingConfig(cfg())).toBeNull());
  it("refuse prix négatif ou vide ou non numérique", () => {
    expect(validateBillingConfig(cfg({ p1: -1 }))).toMatch(/prix mensuel/);
    expect(validateBillingConfig(cfg({ p1: "" }))).toMatch(/prix mensuel/);
    expect(validateBillingConfig(cfg({ p1: "abc" }))).toMatch(/prix mensuel/);
  });
  it("refuse Infinity, NaN et prix démesuré", () => {
    for (const bad of ["Infinity", "NaN", 1e12, "1e15"]) expect(validateBillingConfig(cfg({ p1: bad }))).toMatch(/prix mensuel/);
  });
  it("refuse seuil nul, négatif, décimal", () => {
    expect(validateBillingConfig(cfg({ m1: 0 }))).toMatch(/seuil/);
    expect(validateBillingConfig(cfg({ m1: -5 }))).toMatch(/seuil/);
    expect(validateBillingConfig(cfg({ m1: 10.5 }))).toMatch(/seuil/);
  });
  it("refuse des seuils qui se chevauchent ou ne croissent pas", () => {
    expect(validateBillingConfig(cfg({ m1: 1000000 }))).toMatch(/chevauchent/);
    expect(validateBillingConfig(cfg({ m1: 2000000 }))).toMatch(/chevauchent/);
  });
  it("refuse de désactiver tous les forfaits, accepte d'en désactiver un", () => {
    expect(validateBillingConfig(cfg({ a1: false, a2: false }))).toMatch(/actif/);
    expect(validateBillingConfig(cfg({ a1: false }))).toBeNull();
  });
  it("réduction annuelle : entier de 0 à 12", () => {
    for (const ok of [0, 2, 12, "3"]) expect(validateBillingConfig(cfg({ free: ok }))).toBeNull();
    for (const bad of [-1, 13, 1.5, "", "x"]) expect(validateBillingConfig(cfg({ free: bad }))).toMatch(/réduction/);
  });
  it("traduit les codes d'erreur serveur", () => {
    expect(billingErrorMessage("SUPER_ADMIN_REQUIRED")).toMatch(/Super Admin/);
    expect(billingErrorMessage("THRESHOLDS_OVERLAP")).toMatch(/chevauchent/);
    expect(billingErrorMessage("REFERENCE_ALREADY_USED")).toMatch(/déjà été utilisée/);
  });
});

describe("cohérence du code : aucun prix codé en dur, droits réservés au Super Admin", () => {
  const read = (f: string) => readFileSync(resolve(process.cwd(), f), "utf8");
  const files = ["src/lib/billing.ts", "src/hooks/useBillingPlans.ts", "src/components/SchoolBillingAdmin.tsx", "src/components/PublicBillingPlans.tsx", "src/routes/_authenticated/facturation.tsx", "src/lib/billing-print.ts"];
  it("aucun tarif ou seuil du prompt écrit en dur dans l'interface ou la logique", () => {
    for (const f of files) expect(read(f), f).not.toMatch(/\b150[ _.]?000\b|\b200[ _.]?000\b|\b1[ _.]?000[ _.]?000\b|\b600\b/);
  });
  it("la migration protège la configuration (Super Admin) et fige les paiements validés", () => {
    const sql = read("supabase/migrations/20261017120000_school_billing_plans.sql");
    expect(sql).toMatch(/save_billing_config[\s\S]*SUPER_ADMIN_REQUIRED/);
    expect(sql).toMatch(/review_school_billing_payment[\s\S]*SUPER_ADMIN_REQUIRED/);
    expect(sql).toContain("PAYMENT_IMMUTABLE");
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)[^;]*TO\s+(anon|authenticated)/i);
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|TRUNCATE/i);
  });
  it("la migration de durcissement borne les prix et ne supprime aucune donnée", () => {
    const sql = read("supabase/migrations/20261018120000_billing_numeric_hardening.sql");
    expect(sql).toMatch(/NaN/);
    expect(sql).toContain("INVALID_THRESHOLD");
    expect(sql).toMatch(/NOT VALID/);
    expect(sql).toMatch(/save_billing_config[\s\S]*SUPER_ADMIN_REQUIRED/);
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL)[^;]*TO\s+(anon|authenticated)/i);
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|TRUNCATE/i);
  });
  it("la route /offres reste réservée au Super Admin ; /facturation exclut parents, élèves et enseignants", async () => {
    const { canAccess } = await import("../src/lib/access");
    expect(canAccess("/offres", ["admin"], false)).toBe(false);
    expect(canAccess("/offres", [], true)).toBe(true);
    expect(canAccess("/facturation", ["directeur"], false)).toBe(true);
    expect(canAccess("/facturation", ["comptable"], false)).toBe(true);
    for (const r of ["parent", "eleve", "enseignant"] as const) expect(canAccess("/facturation", [r], false)).toBe(false);
  });
});
