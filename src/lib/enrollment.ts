/**
 * Inscription rapide d'un élève : logique pure (aucun accès réseau), testable.
 *
 * Elle ne remplace rien : l'écran enregistre dans la table `students` existante
 * (une ligne = un élève ; `class_id` = affectation à la classe, lue par Notes,
 * Présences, Bulletins, etc.). Ici : contrôles, détection de doublons, résumé.
 */

export interface EnrollmentForm {
  matricule: string;
  full_name: string;
  gender: "M" | "F" | "";
  birth_date: string; // AAAA-MM-JJ ou ""
  birth_place: string;
  address: string;
  class_id: string;
  parent_name: string;
  parent_phone: string;
}

export interface KnownStudent {
  id: string;
  matricule: string | null;
  full_name: string | null;
  birth_date?: string | null;
  class_id?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
}

/** Minuscules, sans accents, espaces et ponctuation compactés. */
export function normalizeText(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** « Amadou CONDÉ » et « conde amadou » donnent la même clé (ordre indifférent). */
export function nameKey(s: string | null | undefined): string {
  return normalizeText(s).split(" ").filter(Boolean).sort().join(" ");
}

/** Téléphone réduit aux chiffres (les 9 derniers : indicatif pays ignoré). */
export function phoneKey(s: string | null | undefined): string {
  const d = String(s ?? "").replace(/\D+/g, "");
  return d.length > 9 ? d.slice(-9) : d;
}

export const emptyForm = (matricule = ""): EnrollmentForm => ({
  matricule,
  full_name: "",
  gender: "",
  birth_date: "",
  birth_place: "",
  address: "",
  class_id: "",
  parent_name: "",
  parent_phone: "",
});

/**
 * Après « Inscrire un autre élève » : on garde la classe (et le matricule est
 * régénéré par l'appelant) ; TOUT ce qui identifie une personne est vidé, y
 * compris le responsable, pour ne jamais rattacher un élève à la mauvaise famille.
 */
export function nextForm(prev: EnrollmentForm, newMatricule: string): EnrollmentForm {
  return { ...emptyForm(newMatricule), class_id: prev.class_id };
}

export type FieldErrors = Partial<Record<keyof EnrollmentForm, string>>;

/** Étape 1 = classe (année, classe, matricule), étape 2 = identité, étape 3 = compléments. */
export const STEP_FIELDS: Record<1 | 2 | 3, Array<keyof EnrollmentForm>> = {
  1: ["class_id", "matricule"],
  2: ["full_name", "gender", "birth_date"],
  3: ["parent_phone"],
};

export function validateForm(f: EnrollmentForm, today = new Date()): FieldErrors {
  const e: FieldErrors = {};
  if (!f.full_name.trim()) e.full_name = "Le nom complet est obligatoire.";
  else if (f.full_name.trim().length < 3 || !/\s/.test(f.full_name.trim()))
    e.full_name = "Saisissez le prénom et le nom.";
  if (!f.gender) e.gender = "Choisissez le sexe.";
  if (f.birth_date) {
    const d = new Date(f.birth_date + "T00:00:00");
    if (Number.isNaN(d.getTime())) e.birth_date = "Date invalide.";
    else if (d > today) e.birth_date = "La date de naissance est dans le futur.";
    else if (today.getFullYear() - d.getFullYear() > 40) e.birth_date = "Date de naissance peu plausible.";
  }
  if (!f.class_id) e.class_id = "Choisissez la classe.";
  if (!f.matricule.trim()) e.matricule = "Le matricule est obligatoire.";
  else if (/\s/.test(f.matricule.trim())) e.matricule = "Le matricule ne doit pas contenir d'espace.";
  if (f.parent_phone.trim() && phoneKey(f.parent_phone).length < 8) e.parent_phone = "Numéro de téléphone incomplet.";
  return e;
}

/** Erreurs concernant uniquement les champs d'une étape donnée. */
export function stepErrors(step: 1 | 2 | 3, f: EnrollmentForm, today = new Date()): FieldErrors {
  const all = validateForm(f, today);
  const out: FieldErrors = {};
  for (const k of STEP_FIELDS[step]) if (all[k]) out[k] = all[k];
  return out;
}

export type DuplicateKind = "matricule" | "identity" | "name";
export interface DuplicateMatch {
  student: KnownStudent;
  kind: DuplicateKind;
  /** true = bloquant (impossible de créer) ; false = à vérifier par l'utilisateur. */
  blocking: boolean;
  reason: string;
}

/**
 * Correspondances avec les élèves existants.
 *  - même matricule → bloquant (la base l'interdit de toute façon) ;
 *  - même nom + même date de naissance → très probable (à confirmer) ;
 *  - même nom (ordre indifférent) sans date connue des deux côtés → possible.
 * Deux homonymes dont les dates de naissance diffèrent ne sont PAS signalés.
 */
export function findDuplicates(f: EnrollmentForm, known: KnownStudent[]): DuplicateMatch[] {
  const mat = normalizeText(f.matricule);
  const key = nameKey(f.full_name);
  const out: DuplicateMatch[] = [];
  for (const s of known) {
    if (mat && normalizeText(s.matricule) === mat) {
      out.push({ student: s, kind: "matricule", blocking: true, reason: "Ce matricule est déjà attribué." });
      continue;
    }
    if (!key || nameKey(s.full_name) !== key) continue;
    if (f.birth_date && s.birth_date) {
      if (f.birth_date === s.birth_date)
        out.push({ student: s, kind: "identity", blocking: false, reason: "Même nom et même date de naissance." });
    } else {
      out.push({ student: s, kind: "name", blocking: false, reason: "Même nom (date de naissance non comparable)." });
    }
  }
  return out.sort((a, b) => Number(b.blocking) - Number(a.blocking) || (a.kind === "identity" ? -1 : 1));
}

export const hasBlocking = (m: DuplicateMatch[]) => m.some((x) => x.blocking);

/** Élèves dont la recherche rapide correspond (nom, matricule, parent). */
export function searchStudents(known: KnownStudent[], query: string, limit = 8): KnownStudent[] {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  const words = q.split(" ");
  return known
    .filter((s) => {
      const hay = normalizeText(`${s.full_name ?? ""} ${s.matricule ?? ""}`);
      return words.every((w) => hay.includes(w));
    })
    .slice(0, limit);
}

export interface ParentSuggestion {
  parent_name: string;
  parent_phone: string;
  children: number;
}

/**
 * Responsables déjà connus (par téléphone, sinon par nom) : permet de
 * « sélectionner le responsable existant » au lieu de le ressaisir. On ne
 * propose que des responsables réellement présents sur des fiches existantes.
 */
export function suggestParents(known: KnownStudent[], query: string, limit = 5): ParentSuggestion[] {
  const q = normalizeText(query);
  const qp = phoneKey(query);
  if (q.length < 2 && qp.length < 4) return [];
  const groups = new Map<string, ParentSuggestion>();
  for (const s of known) {
    const name = (s.parent_name ?? "").trim();
    const phone = (s.parent_phone ?? "").trim();
    if (!name && !phone) continue;
    const id = phoneKey(phone) || "n:" + nameKey(name);
    const g = groups.get(id) ?? { parent_name: name, parent_phone: phone, children: 0 };
    g.children++;
    if (!g.parent_name && name) g.parent_name = name;
    groups.set(id, g);
  }
  return [...groups.values()]
    .filter((g) => (qp.length >= 4 && phoneKey(g.parent_phone).includes(qp)) || (q.length >= 2 && normalizeText(g.parent_name).includes(q)))
    .sort((a, b) => b.children - a.children)
    .slice(0, limit);
}

/** Ligne insérée dans `students` (aucun champ inventé ; school_id vient de la base). */
export function toStudentRow(f: EnrollmentForm) {
  const t = (s: string) => (s.trim() ? s.trim() : null);
  return {
    matricule: f.matricule.trim(),
    full_name: f.full_name.trim().replace(/\s+/g, " "),
    gender: f.gender || null,
    birth_date: f.birth_date || null,
    birth_place: t(f.birth_place),
    address: t(f.address),
    class_id: f.class_id || null,
    parent_name: t(f.parent_name),
    parent_phone: t(f.parent_phone),
    status: "actif",
  };
}

export interface EnrollmentSummary {
  title: string;
  lines: Array<{ label: string; value: string }>;
}

export function buildSummary(
  f: EnrollmentForm,
  ctx: { academicYear: string; className: string; level?: string | null },
): EnrollmentSummary {
  const lines: Array<{ label: string; value: string }> = [
    { label: "Élève", value: f.full_name.trim() },
    { label: "Matricule", value: f.matricule.trim() },
    { label: "Sexe", value: f.gender === "M" ? "Masculin" : f.gender === "F" ? "Féminin" : "—" },
    { label: "Né(e) le", value: f.birth_date || "non renseigné" },
    { label: "Année scolaire", value: ctx.academicYear },
  ];
  if (ctx.level) lines.push({ label: "Niveau", value: ctx.level });
  lines.push({ label: "Classe", value: ctx.className });
  if (f.parent_name.trim() || f.parent_phone.trim())
    lines.push({ label: "Responsable", value: [f.parent_name.trim(), f.parent_phone.trim()].filter(Boolean).join(" · ") });
  return { title: "Vérification de l'inscription", lines };
}

/** Matricule : même format que l'écran existant (EDG-XXXXXXXX). Unicité vérifiée par la base. */
export function generateMatricule(random: () => string = () => globalThis.crypto.randomUUID()): string {
  return "EDG-" + random().replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Erreur Postgres « violation d'unicité » (matricule pris entre-temps). */
export function isUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  return !!err && (err.code === "23505" || /duplicate key|unique/i.test(err.message ?? ""));
}

/** Clé d'identité « nom (ordre indifférent) + date de naissance » ; "" si la date manque. */
export function identityKey(fullName: string | null | undefined, birthDate: string | null | undefined): string {
  const n = nameKey(fullName);
  const d = String(birthDate ?? "").trim();
  return n && d ? `${n}|${d}` : "";
}

/* ------------------------------------------------------------------ */
/* Changement de classe / réinscription en lot                         */
/* ------------------------------------------------------------------ */

export interface ClassMove {
  fromClassId: string;
  toClassId: string;
  studentIds: string[];
}

export interface ReenrollmentPlan {
  moves: ClassMove[];
  total: number; // élèves qui changeront de classe
  unchanged: number; // sans destination choisie ou destination identique
  inactive: number; // statut autre que « actif » : jamais déplacés automatiquement
}

/**
 * Plan de réinscription : `mapping` associe une classe d'origine à sa classe de
 * destination ("" ou absente = ne pas changer). Un seul passage par classe
 * d'origine ; les élèves non « actifs » ne sont jamais déplacés.
 */
export function planReenrollment(
  students: Array<{ id: string; class_id?: string | null; status?: string | null }>,
  mapping: Record<string, string>,
): ReenrollmentPlan {
  const byPair = new Map<string, ClassMove>();
  let unchanged = 0;
  let inactive = 0;
  for (const s of students) {
    const from = s.class_id ?? "";
    if (!from) continue;
    const to = mapping[from] ?? "";
    if (!to || to === from) {
      unchanged++;
      continue;
    }
    if ((s.status ?? "actif") !== "actif") {
      inactive++;
      continue;
    }
    const k = `${from}>${to}`;
    const m = byPair.get(k) ?? { fromClassId: from, toClassId: to, studentIds: [] };
    m.studentIds.push(s.id);
    byPair.set(k, m);
  }
  const moves = [...byPair.values()];
  return { moves, total: moves.reduce((n, m) => n + m.studentIds.length, 0), unchanged, inactive };
}
