import type { AppRole } from "@/hooks/useAuth";

/** Offres d'abonnement. Les valeurs réelles (prix, droits) viennent de Supabase ; ceci n'est que le typage et la logique pure. */
export type OfferCode = "basique" | "standard" | "premium";
export type OfferModule = "cantine" | "infirmerie" | "bibliotheque";

export interface OfferConditions {
  code: OfferCode | string;
  name: string;
  unit_price: number;
  school_commission: number;
  parent_login: boolean;
  student_login: boolean;
  payer_roles: string[];
  modules: Record<OfferModule, boolean>;
}

export const OFFER_LABELS: Record<OfferCode, string> = { basique: "Basique", standard: "Standard", premium: "Premium" };

/** Routes appartenant à un module activable/désactivable par offre. */
const MODULE_ROUTES: Array<{ prefix: string; module: OfferModule }> = [
  { prefix: "/cantine", module: "cantine" },
  { prefix: "/infirmerie", module: "infirmerie" },
  { prefix: "/bibliotheque", module: "bibliotheque" },
];

export const MODULE_LABELS: Record<OfferModule, string> = { cantine: "Cantine", infirmerie: "Infirmerie", bibliotheque: "Bibliothèque" };

export function moduleOfPath(pathname: string): OfferModule | null {
  return MODULE_ROUTES.find((m) => pathname === m.prefix || pathname.startsWith(m.prefix + "/"))?.module ?? null;
}

/** Vrai si l'offre interdit cette page (module désactivé). Le Super Admin n'est jamais bloqué. */
export function pathBlockedByOffer(pathname: string, offer: Pick<OfferConditions, "modules"> | null | undefined, isSuperAdmin = false): boolean {
  if (isSuperAdmin || !offer) return false;
  const m = moduleOfPath(pathname);
  return !!m && offer.modules?.[m] === false;
}

/**
 * Connexion autorisée ? Les rôles administratifs / enseignants passent toujours ; un compte qui n'a QUE
 * des rôles Parent et/ou Élève dépend de l'offre. Un compte sans rôle n'est pas jugé ici.
 */
export function loginAllowed(roles: AppRole[], isSuperAdmin: boolean, offer: Pick<OfferConditions, "parent_login" | "student_login"> | null | undefined): boolean {
  if (isSuperAdmin || !offer) return true;
  const staff = roles.some((r) => r !== "parent" && r !== "eleve");
  if (staff) return true;
  const parent = roles.includes("parent");
  const student = roles.includes("eleve");
  if (!parent && !student) return true;
  return (parent && offer.parent_login) || (student && offer.student_login);
}

/** Message affiché quand la connexion est refusée par l'offre. */
export function loginDeniedMessage(roles: AppRole[]): string {
  return roles.includes("eleve") && !roles.includes("parent")
    ? "L'offre de votre établissement n'inclut pas la connexion des élèves."
    : "L'offre de votre établissement n'inclut pas la connexion des parents.";
}

/** Peut-il déclarer un paiement selon l'offre ? (le serveur refait ce contrôle) */
export function canPayWithOffer(
  roles: AppRole[],
  isSuperAdmin: boolean,
  offer: Pick<OfferConditions, "payer_roles"> | null | undefined,
  relation: { parentOfStudent?: boolean; studentSelf?: boolean } = {},
): boolean {
  if (isSuperAdmin) return true;
  // Pas d'offre enregistrée : conditions historiques, le serveur tranche (ne rien bloquer à tort côté interface).
  if (!offer) return true;
  const allowed = new Set(offer.payer_roles ?? []);
  return roles.some((r) => {
    if (!allowed.has(r)) return false;
    if (r === "parent") return !!relation.parentOfStudent;
    if (r === "eleve") return !!relation.studentSelf;
    return true;
  });
}

/** Seul le Super Admin valide ou refuse un paiement. */
export const canFinalizePayment = (isSuperAdmin: boolean) => isSuperAdmin === true;

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  INITIATED: "En attente de validation",
  PENDING_VERIFICATION: "En attente de validation",
  AWAITING_VALIDATION: "En attente de validation",
  VALIDATED: "Validé",
  REJECTED: "Refusé",
  FAILED: "Échec",
  CANCELLED: "Annulé",
};
export const isPendingStatus = (s?: string | null) => ["INITIATED", "PENDING_VERIFICATION", "AWAITING_VALIDATION"].includes(s ?? "");

export function summarizeCommissions(rows: Array<{ amount: number | string; status: string }>) {
  // Statuts serveur : pending (à reverser), paid (reversée), cancelled (paiement annulé : jamais comptée).
  let pending = 0, paid = 0;
  for (const r of rows) {
    const a = Number(r.amount) || 0;
    if (r.status === "paid") paid += a; else if (r.status === "pending") pending += a;
  }
  return { pending, paid, total: pending + paid };
}

/** Traduit les codes d'erreur des fonctions SQL en messages lisibles. */
export function paymentErrorMessage(raw?: string | null): string {
  const m = raw ?? "";
  const map: Record<string, string> = {
    SUPER_ADMIN_VALIDATION_REQUIRED: "Seul le Super Admin peut valider un paiement.",
    FORBIDDEN: "Action non autorisée : votre rôle ne le permet pas avec l'offre de l'établissement.",
    AUTH_REQUIRED: "Veuillez vous reconnecter.",
    REFERENCE_ALREADY_USED: "Cette référence de transaction a déjà été utilisée.",
    REFERENCE_REQUIRED: "La référence de transaction est obligatoire.",
    ALREADY_VALIDATED: "Ce paiement est déjà validé.",
    ALREADY_PENDING: "Un paiement est déjà en attente de validation pour cet élève.",
    FLAT_OFFER_NO_STUDENT_PAYMENT: "Votre établissement est sous un plan par établissement : aucune cotisation par élève n'est nécessaire.",
    REASON_REQUIRED: "Le motif du refus est obligatoire.",
    INVALID_AMOUNT: "Le montant du paiement ne correspond pas aux conditions de l'offre.",
    INVALID_STATUS: "Ce paiement n'est plus en attente de validation.",
    GROUP_CONTAINS_VALIDATED_STUDENT: "Le lot contient un élève dont la cotisation est déjà validée.",
    GROUP_CONTAINS_PENDING_STUDENT: "Le lot contient un élève dont le paiement est déjà en attente.",
    INVALID_COMMISSIONS: "Une des commissions est déjà reversée, annulée ou ne concerne pas cet établissement.",
    COMMISSIONS_REQUIRED: "Sélectionnez au moins une commission.",
    OFFER_INACTIVE: "Cette offre est désactivée : activez-la avant de l'attribuer.",
  };
  for (const k of Object.keys(map)) if (m.includes(k)) return map[k];
  return m || "Opération impossible.";
}

export const ALL_PAYER_ROLES: Array<{ value: string; label: string }> = [
  { value: "admin", label: "Administrateur" },
  { value: "directeur", label: "Directeur" },
  { value: "directeur_etudes", label: "Directeur des études" },
  { value: "proviseur", label: "Proviseur" },
  { value: "enseignant", label: "Enseignant" },
  { value: "comptable", label: "Comptable" },
  { value: "secretariat", label: "Secrétariat" },
  { value: "parent", label: "Parent" },
  { value: "eleve", label: "Élève" },
];

/** Contrôle d'un formulaire d'offre avant enregistrement (le serveur contrôle aussi : prix ≥ 0, commission ≤ prix). */
export function validateOfferForm(f: { name: string; annual_price: number | string; school_commission: number | string }): string | null {
  if (!f.name.trim()) return "Le nom de l'offre est obligatoire.";
  const price = Number(f.annual_price), com = Number(f.school_commission);
  if (!Number.isFinite(price) || price < 0) return "Le tarif annuel doit être un nombre positif ou nul.";
  if (!Number.isFinite(com) || com < 0) return "La commission doit être un nombre positif ou nul.";
  if (com > price) return "La commission ne peut pas dépasser le tarif annuel.";
  return null;
}

export interface FinanceRow {
  schoolId: string; academicYear: string;
  validated: number; pending: number; refused: number;
  revenue: number; commissionDue: number; commissionPaid: number;
}

/** Statistiques financières par établissement et par année scolaire. Seuls les paiements validés comptent. */
export function aggregateFinance(
  payments: Array<{ school_id: string; academic_year: string; status: string; amount: number | string }>,
  commissions: Array<{ school_id: string; academic_year: string; status: string; amount: number | string }>,
): FinanceRow[] {
  const m = new Map<string, FinanceRow>();
  const row = (schoolId: string, academicYear: string) => {
    const k = `${schoolId}|${academicYear}`;
    let r = m.get(k);
    if (!r) { r = { schoolId, academicYear, validated: 0, pending: 0, refused: 0, revenue: 0, commissionDue: 0, commissionPaid: 0 }; m.set(k, r); }
    return r;
  };
  for (const p of payments) {
    const r = row(p.school_id, p.academic_year);
    if (p.status === "VALIDATED") { r.validated++; r.revenue += Number(p.amount) || 0; }
    else if (isPendingStatus(p.status)) r.pending++;
    else if (p.status === "REJECTED") r.refused++;
  }
  for (const c of commissions) {
    const r = row(c.school_id, c.academic_year);
    if (c.status === "paid") r.commissionPaid += Number(c.amount) || 0; else if (c.status === "pending") r.commissionDue += Number(c.amount) || 0;
  }
  return [...m.values()].sort((a, b) => a.schoolId.localeCompare(b.schoolId) || b.academicYear.localeCompare(a.academicYear));
}
