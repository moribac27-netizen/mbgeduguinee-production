import { describe, expect, it } from "vitest";
import {
  canFinalizePayment, canPayWithOffer, isPendingStatus, loginAllowed, moduleOfPath, paymentErrorMessage,
  pathBlockedByOffer, summarizeCommissions,
} from "../src/lib/offers";

const basique = { parent_login: false, student_login: false, payer_roles: ["admin", "directeur", "directeur_etudes", "proviseur", "enseignant"], modules: { cantine: false, infirmerie: false, bibliotheque: false } };
const standard = { parent_login: true, student_login: false, payer_roles: ["parent", "admin", "directeur", "directeur_etudes", "proviseur"], modules: { cantine: true, infirmerie: true, bibliotheque: true } };
const premium = { parent_login: true, student_login: true, payer_roles: ["eleve", "parent", "admin", "directeur", "directeur_etudes", "proviseur"], modules: { cantine: true, infirmerie: true, bibliotheque: true } };

describe("connexion selon l'offre", () => {
  it("Basique : ni parents ni élèves, le personnel passe", () => {
    expect(loginAllowed(["parent"], false, basique)).toBe(false);
    expect(loginAllowed(["eleve"], false, basique)).toBe(false);
    expect(loginAllowed(["enseignant"], false, basique)).toBe(true);
    expect(loginAllowed(["directeur"], false, basique)).toBe(true);
  });
  it("Standard : parents oui, élèves non", () => {
    expect(loginAllowed(["parent"], false, standard)).toBe(true);
    expect(loginAllowed(["eleve"], false, standard)).toBe(false);
  });
  it("Premium : tous", () => {
    expect(loginAllowed(["parent"], false, premium)).toBe(true);
    expect(loginAllowed(["eleve"], false, premium)).toBe(true);
  });
  it("un parent qui est aussi enseignant garde l'accès staff ; le Super Admin n'est jamais bloqué", () => {
    expect(loginAllowed(["parent", "enseignant"], false, basique)).toBe(true);
    expect(loginAllowed([], true, basique)).toBe(true);
  });
});

describe("modules selon l'offre", () => {
  it("détecte le module d'une URL, y compris en direct", () => {
    expect(moduleOfPath("/cantine")).toBe("cantine");
    expect(moduleOfPath("/infirmerie/fiche/1")).toBe("infirmerie");
    expect(moduleOfPath("/bibliotheque")).toBe("bibliotheque");
    expect(moduleOfPath("/cantineX")).toBeNull();
    expect(moduleOfPath("/notes")).toBeNull();
  });
  it("Basique bloque les 3 modules, Standard/Premium non, Super Admin jamais", () => {
    for (const p of ["/cantine", "/infirmerie", "/bibliotheque"]) {
      expect(pathBlockedByOffer(p, basique)).toBe(true);
      expect(pathBlockedByOffer(p, standard)).toBe(false);
      expect(pathBlockedByOffer(p, premium)).toBe(false);
      expect(pathBlockedByOffer(p, basique, true)).toBe(false);
    }
    expect(pathBlockedByOffer("/notes", basique)).toBe(false);
  });
  it("offre inconnue : on ne bloque pas côté interface (le serveur tranche)", () => {
    expect(pathBlockedByOffer("/cantine", null)).toBe(false);
  });
});

describe("qui peut payer", () => {
  it("Basique : direction, directeur des études, admin, enseignants ; pas les parents", () => {
    expect(canPayWithOffer(["enseignant"], false, basique)).toBe(true);
    expect(canPayWithOffer(["directeur_etudes"], false, basique)).toBe(true);
    expect(canPayWithOffer(["parent"], false, basique, { parentOfStudent: true })).toBe(false);
    expect(canPayWithOffer(["comptable"], false, basique)).toBe(false);
  });
  it("Standard : parents (de leur enfant seulement), pas les élèves", () => {
    expect(canPayWithOffer(["parent"], false, standard, { parentOfStudent: true })).toBe(true);
    expect(canPayWithOffer(["parent"], false, standard, { parentOfStudent: false })).toBe(false);
    expect(canPayWithOffer(["eleve"], false, standard, { studentSelf: true })).toBe(false);
    expect(canPayWithOffer(["enseignant"], false, standard)).toBe(false);
  });
  it("Premium : l'élève paie pour lui seulement", () => {
    expect(canPayWithOffer(["eleve"], false, premium, { studentSelf: true })).toBe(true);
    expect(canPayWithOffer(["eleve"], false, premium, { studentSelf: false })).toBe(false);
  });
  it("seul le Super Admin finalise", () => {
    expect(canFinalizePayment(true)).toBe(true);
    expect(canFinalizePayment(false)).toBe(false);
  });
});

describe("commissions et libellés", () => {
  it("somme en attente / reversée", () => {
    expect(summarizeCommissions([{ amount: 5000, status: "pending" }, { amount: "15000", status: "paid" }, { amount: 5000, status: "pending" }, { amount: 5000, status: "cancelled" }])).toEqual({ pending: 10000, paid: 15000, total: 25000 });
  });
  it("statuts en attente", () => {
    expect(isPendingStatus("AWAITING_VALIDATION")).toBe(true);
    expect(isPendingStatus("VALIDATED")).toBe(false);
    expect(isPendingStatus(null)).toBe(false);
  });
  it("messages d'erreur serveur lisibles", () => {
    expect(paymentErrorMessage("SUPER_ADMIN_VALIDATION_REQUIRED")).toMatch(/Super Admin/);
    expect(paymentErrorMessage("REFERENCE_ALREADY_USED")).toMatch(/déjà/);
    expect(paymentErrorMessage("autre")).toBe("autre");
  });
});

import { aggregateFinance, validateOfferForm } from "../src/lib/offers";

describe("formulaire d'offre", () => {
  it("refuse nom vide, prix négatif, commission > prix", () => {
    expect(validateOfferForm({ name: " ", annual_price: 1, school_commission: 0 })).toMatch(/nom/);
    expect(validateOfferForm({ name: "X", annual_price: -1, school_commission: 0 })).toMatch(/tarif/);
    expect(validateOfferForm({ name: "X", annual_price: 20000, school_commission: 25000 })).toMatch(/dépasser/);
    expect(validateOfferForm({ name: "X", annual_price: "abc", school_commission: 0 })).toMatch(/tarif/);
  });
  it("accepte un formulaire valide (commission 0 incluse)", () => {
    expect(validateOfferForm({ name: "Basique", annual_price: 20000, school_commission: 0 })).toBeNull();
    expect(validateOfferForm({ name: "Premium", annual_price: "50000", school_commission: "15000" })).toBeNull();
  });
});

describe("statistiques financières", () => {
  it("ne compte en revenu que les paiements validés ; sépare par établissement et par année", () => {
    const rows = aggregateFinance(
      [
        { school_id: "A", academic_year: "2026-2027", status: "VALIDATED", amount: 50000 },
        { school_id: "A", academic_year: "2026-2027", status: "AWAITING_VALIDATION", amount: 50000 },
        { school_id: "A", academic_year: "2026-2027", status: "REJECTED", amount: 50000 },
        { school_id: "A", academic_year: "2025-2026", status: "VALIDATED", amount: 35000 },
        { school_id: "B", academic_year: "2026-2027", status: "VALIDATED", amount: 20000 },
      ],
      [
        { school_id: "A", academic_year: "2026-2027", status: "pending", amount: 15000 },
        { school_id: "A", academic_year: "2025-2026", status: "paid", amount: 5000 },
      ],
    );
    const a26 = rows.find((r) => r.schoolId === "A" && r.academicYear === "2026-2027")!;
    expect(a26).toMatchObject({ validated: 1, pending: 1, refused: 1, revenue: 50000, commissionDue: 15000, commissionPaid: 0 });
    const a25 = rows.find((r) => r.schoolId === "A" && r.academicYear === "2025-2026")!;
    expect(a25).toMatchObject({ revenue: 35000, commissionPaid: 5000 });
    expect(rows.find((r) => r.schoolId === "B")).toMatchObject({ revenue: 20000, commissionDue: 0 });
  });
});
